import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  Keypair,
  PublicKey,
  Transaction,
  Ed25519Program,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  Account,
  createMint,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";
import { EmblemVaultSolana } from "../target/types/emblem_vault_solana";

describe("emblem_vault_solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .EmblemVaultSolana as Program<EmblemVaultSolana>;

  let vaultPda: PublicKey;
  let mintPda: PublicKey;
  let tokenAccount: PublicKey;
  let payerKeypair: Keypair;
  let feeReceiverKeypair: Keypair;
  let externalTokenId: string;
  let signerKeypair: Keypair;
  let metadataPda: PublicKey;

  // Collection PDAs
  let collectionMint: PublicKey;
  let collectionMetadataPda: PublicKey;
  let collectionMasterEditionPda: PublicKey;

  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state")],
    program.programId
  );

  // we will use the deployed collection mint address,
  // which will be stored in program state
  collectionMint = Keypair.generate().publicKey;

  // Derive PDAs for the vault and mint
  [vaultPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault"),
      payerKeypair.publicKey.toBuffer(),
      Buffer.from(externalTokenId),
    ],
    program.programId
  );

  [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_mint"), Buffer.from(externalTokenId)],
    program.programId
  );

  [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
      mintPda.toBuffer(),
    ],
    new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  );

  // Derive collection metadata PDA
  [collectionMetadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
      collectionMint.toBuffer(),
    ],
    new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  );

  // Derive the Master Edition PDA for the collection mint
  [collectionMasterEditionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
      collectionMint.toBuffer(),
      Buffer.from("edition"),
    ],
    new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  );

  console.log("programStatePda", programStatePda.toBase58());
  console.log("program.programId", program.programId.toBase58());

  before(async () => {
    payerKeypair = Keypair.generate();
    feeReceiverKeypair = Keypair.generate();
    signerKeypair = Keypair.generate();
    externalTokenId = "EXT_" + Date.now().toString();

    console.log("payerKeypair", payerKeypair.publicKey.toBase58());
    console.log("signerKeypair", signerKeypair.publicKey.toBase58());
    console.log("feeReceiverKeypair", feeReceiverKeypair.publicKey.toBase58());
    console.log("externalTokenId", externalTokenId);

    // Airdrop SOL to the payer account
    await provider.connection
      .requestAirdrop(payerKeypair.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
      .then((airdropSignature) =>
        provider.connection.confirmTransaction(airdropSignature)
      );

    // Get associated token account for the mint PDA
    tokenAccount = await getAssociatedTokenAddress(
      mintPda,
      payerKeypair.publicKey
    );
  });

  it("Initializes program state", async () => {
    const baseUri = "https://example.com/metadata/";

    await program.methods
      .initializeProgram(baseUri, signerKeypair.publicKey, collectionMint)
      .accounts({
        authority: payerKeypair.publicKey,
      })
      .signers([payerKeypair])
      .rpc();

    const programState = await program.account.programState.fetch(
      programStatePda
    );
    expect(programState.baseUri).to.equal(baseUri);
    expect(programState.authority.toString()).to.equal(
      payerKeypair.publicKey.toString()
    );
  });

  it("Fails to mint a vault NFT without signature verification", async () => {
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const timestamp = Math.floor(Date.now() / 1000);

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        mint: mintPda,
        tokenAccount: tokenAccount,
        metadata: Keypair.generate().publicKey, // This is just a placeholder
        payer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
        programState: programStatePda,
        tokenMetadataProgram: new PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
      })
      .instruction();

    const transaction = new Transaction().add(mintVaultIx);

    try {
      await provider.sendAndConfirm(transaction, [payerKeypair]);
      throw new Error("Minting should have failed but it succeeded!");
    } catch (error) {
      expect(error.message).to.include("custom program error: 0x1774"); // InvalidSignature error code
    }
  });

  it("Fails to mint a vault NFT with an invalid signature", async () => {
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);

    const tamperedMessageBytes = decodeUTF8("tampered_message");
    const invalidSignature = nacl.sign.detached(
      tamperedMessageBytes,
      payerKeypair.secretKey
    );

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: payerKeypair.publicKey.toBytes(),
      message: messageBytes,
      signature: invalidSignature,
    });

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        mint: mintPda,
        tokenAccount: tokenAccount,
        metadata: Keypair.generate().publicKey, // This is just a placeholder
        payer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
        programState: programStatePda,
        tokenMetadataProgram: new PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
      })
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, mintVaultIx);

    try {
      await provider.sendAndConfirm(transaction, [payerKeypair]);
      throw new Error("Minting should have failed but it succeeded!");
    } catch (error) {
      expect(error.message).to.include("precompile verification failure");
    }
  });

  it("Mints a vault NFT", async () => {
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL fee
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, signerKeypair.secretKey);

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: messageBytes,
      signature: signature,
    });

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        mint: mintPda,
        tokenAccount: tokenAccount,
        metadata: metadataPda,
        payer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
        programState: programStatePda,
        collectionMint: collectionMint,
        collectionMetadata: collectionMetadataPda,
        collectionMasterEdition: collectionMasterEditionPda,
        tokenMetadataProgram: new PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
      })
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, mintVaultIx);
    await provider.sendAndConfirm(transaction, [payerKeypair]);

    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount
    );
    expect(new anchor.BN(tokenAccountInfo.value.amount).eq(new anchor.BN(1))).to
      .be.true;

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.isMinted).to.be.true;
    expect(vaultAccount.isClaimed).to.be.false;
    expect(vaultAccount.externalTokenId).to.equal(externalTokenId);
    expect(vaultAccount.owner.toString()).to.equal(
      payerKeypair.publicKey.toString()
    );
    expect(vaultAccount.mint.toString()).to.equal(mintPda.toString());
    expect(vaultAccount.tokenAccount.toString()).to.equal(
      tokenAccount.toString()
    );
  });

  it("Claims a vault NFT", async () => {
    const price = new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL); // 0.5 SOL fee
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `claim:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, signerKeypair.secretKey);

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: messageBytes,
      signature: signature,
    });

    const claimVaultIx = await program.methods
      .claimVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        vault: vaultPda,
        mint: mintPda,
        tokenAccount: tokenAccount,
        claimer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
      })
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, claimVaultIx);
    await provider.sendAndConfirm(transaction, [payerKeypair]);

    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount
    );
    expect(tokenAccountInfo.value.uiAmount).to.equal(0);

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.isClaimed).to.be.true;
    expect(vaultAccount.claimer.toString()).to.equal(
      payerKeypair.publicKey.toString()
    );
  });

  it("Queries vault information", async () => {
    const vaultAccount = await program.account.vault.fetch(vaultPda);

    const isClaimed = await program.methods
      .isClaimed()
      .accounts({ vault: vaultPda })
      .view();
    expect(isClaimed).to.equal(vaultAccount.isClaimed);
    // console.log("isClaimed", isClaimed);

    const vaultOwner = await program.methods
      .getVaultOwner()
      .accounts({ vault: vaultPda })
      .view();
    expect(vaultOwner.toString()).to.equal(vaultAccount.owner.toString());
    // console.log("vaultOwner", vaultOwner);

    if (vaultAccount.isClaimed) {
      const claimer = await program.methods
        .getClaimer()
        .accounts({ vault: vaultPda })
        .view();
      expect(claimer.toString()).to.equal(vaultAccount.claimer.toString());
      // console.log("claimer", claimer);
    }
  });

  it("Updates base URI by authority", async () => {
    const newBaseUri = "https://newexample.com/metadata/";

    // Call setBaseUri from the authority (payerKeypair in this case)
    await program.methods
      .setBaseUri(newBaseUri)
      .accounts({
        programState: programStatePda,
        authority: payerKeypair.publicKey,
      })
      .signers([payerKeypair])
      .rpc();

    // Fetch the updated program state and assert the base URI is updated
    const updatedProgramState = await program.account.programState.fetch(
      programStatePda
    );
    expect(updatedProgramState.baseUri).to.equal(newBaseUri);
  });

  it("Fails to update base URI by unauthorized account", async () => {
    const unauthorizedKeypair = Keypair.generate();
    const newBaseUri = "https://unauthorized.com/metadata/";

    try {
      // Attempt to call setBaseUri from an unauthorized account
      await program.methods
        .setBaseUri(newBaseUri)
        .accounts({
          programState: programStatePda,
          authority: unauthorizedKeypair.publicKey,
        })
        .signers([unauthorizedKeypair])
        .rpc();

      throw new Error(
        "The unauthorized update should have failed but succeeded!"
      );
    } catch (error) {
      // Assert the exact error code and message
      expect(error.message).to.include("Error Code: Unauthorized");
      expect(error.message).to.include("Error Number: 6005");
      expect(error.message).to.include("Unauthorized");
    }

    // Verify that the base URI has not changed
    const programState = await program.account.programState.fetch(
      programStatePda
    );
    expect(programState.baseUri).to.not.equal(
      "https://unauthorized.com/metadata/"
    );
  });
});
