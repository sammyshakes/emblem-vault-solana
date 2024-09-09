import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  Keypair,
  PublicKey,
  Transaction,
  Ed25519Program,
} from "@solana/web3.js";
import {
  Account,
  createMint,
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
  let mintKeypair: Keypair;
  let tokenAccount: Account;
  let payerKeypair: Keypair;
  let signerKeypair: Keypair;
  let feeReceiverKeypair: Keypair;
  let externalTokenId: string;

  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state")],
    program.programId
  );

  before(async () => {
    mintKeypair = Keypair.generate();
    payerKeypair = Keypair.generate();
    signerKeypair = Keypair.generate();
    feeReceiverKeypair = Keypair.generate();
    externalTokenId = "EXT_" + Date.now().toString();

    await provider.connection
      .requestAirdrop(payerKeypair.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
      .then((airdropSignature) =>
        provider.connection.confirmTransaction(airdropSignature)
      );

    const mint = await createMint(
      provider.connection,
      payerKeypair,
      payerKeypair.publicKey,
      null,
      0,
      mintKeypair
    );

    tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      mint,
      payerKeypair.publicKey
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        payerKeypair.publicKey.toBuffer(),
        Buffer.from(externalTokenId),
      ],
      program.programId
    );

    //console all the variables
    console.log("vaultPda", vaultPda.toBase58());
    // console.log("mintPda", mintPda.toBase58());
    // console.log("tokenAccount", tokenAccount.toBase58());
    console.log("payerKeypair", payerKeypair.publicKey.toBase58());
    console.log("signerKeypair", signerKeypair.publicKey.toBase58());
    console.log("feeReceiverKeypair", feeReceiverKeypair.publicKey.toBase58());
    console.log("externalTokenId", externalTokenId);
    console.log("programStatePda", programStatePda.toBase58());
    // console.log("metadataPda", metadataPda.toBase58());
  });

  it("Initializes program state", async () => {
    const baseUri = "https://example.com/metadata/";

    await program.methods
      .initializeProgram(baseUri, signerKeypair.publicKey)
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
    expect(programState.signerPublicKey.toBase58()).to.equal(
      signerKeypair.publicKey.toString()
    );
  });

  it("Fails to mint a vault NFT without signature verification", async () => {
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
    const timestamp = Math.floor(Date.now() / 1000);

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
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
      expect(error.message).to.include(
        "Transaction simulation failed: Error processing Instruction 0"
      );
    }
  });

  it("Fails to mint a vault NFT with a valid signature but unauthorized signer", async () => {
    const unauthorizedSigner = Keypair.generate(); // New keypair for unauthorized signer
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL fee
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);

    // Sign the message with the unauthorized signer's keypair
    const signature = nacl.sign.detached(
      messageBytes,
      unauthorizedSigner.secretKey
    );

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: unauthorizedSigner.publicKey.toBytes(),
      message: messageBytes,
      signature: signature,
    });

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
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
      // Attempt to send the transaction with the unauthorized signer
      await provider.sendAndConfirm(transaction, [
        payerKeypair,
        unauthorizedSigner,
      ]);
      throw new Error("Minting should have failed but it succeeded!");
    } catch (error) {
      // console.error("Transaction Error:", error.message);
      expect(error.message).to.include("unknown signer");
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
      signerKeypair.secretKey
    );

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: messageBytes,
      signature: invalidSignature,
    });

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
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

    const [metadataPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: signerKeypair.publicKey.toBytes(),
      message: messageBytes,
      signature: signature,
    });

    const mintVaultIx = await program.methods
      .mintVault(externalTokenId, price, new anchor.BN(timestamp))
      .accounts({
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        metadata: metadataPda,
        payer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
        programState: programStatePda,
        tokenMetadataProgram: new PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
      })
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, mintVaultIx);
    await provider.sendAndConfirm(transaction, [payerKeypair]);

    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount.address
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
    expect(vaultAccount.mint.toString()).to.equal(
      mintKeypair.publicKey.toString()
    );
    expect(vaultAccount.tokenAccount.toString()).to.equal(
      tokenAccount.address.toString()
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
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        claimer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
      })
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, claimVaultIx);
    await provider.sendAndConfirm(transaction, [payerKeypair]);

    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount.address
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
