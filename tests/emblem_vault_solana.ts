import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EmblemVaultSolana } from "../target/types/emblem_vault_solana";
import { expect } from "chai";
import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  Ed25519Program,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  Account,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";

describe("emblem_vault_solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .EmblemVaultSolana as Program<EmblemVaultSolana>;

  let vaultPda: PublicKey;
  let mintKeypair: Keypair;
  let tokenAccount: Account;
  let payerKeypair: Keypair;
  let feeReceiverKeypair: Keypair;
  let externalTokenId: string;

  before(async () => {
    mintKeypair = Keypair.generate();
    payerKeypair = Keypair.generate();
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
  });

  it("Mints a vault NFT", async () => {
    const metadataUri = "https://example.com/token-metadata";
    const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL fee
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, payerKeypair.secretKey);

    const [metadataPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: payerKeypair.publicKey.toBytes(),
      message: messageBytes,
      signature: signature,
    });

    const mintVaultIx = await program.methods
      .mintVault(
        externalTokenId,
        price,
        "Test Vault",
        "VAULT",
        metadataUri,
        new anchor.BN(timestamp)
      )
      .accounts({
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        metadata: metadataPda,
        payer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
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
      .mintVault(
        externalTokenId,
        price,
        "Invalid Vault",
        "INVALID",
        "https://example.com/invalid-metadata",
        new anchor.BN(timestamp)
      )
      .accounts({
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        metadata: Keypair.generate().publicKey, // This is just a placeholder
        payer: payerKeypair.publicKey,
        feeReceiver: feeReceiverKeypair.publicKey,
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

  it("Claims a vault NFT", async () => {
    const price = new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL); // 0.5 SOL fee
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `claim:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, payerKeypair.secretKey);

    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: payerKeypair.publicKey.toBytes(),
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

    const vaultOwner = await program.methods
      .getVaultOwner()
      .accounts({ vault: vaultPda })
      .view();
    expect(vaultOwner.toString()).to.equal(vaultAccount.owner.toString());

    if (vaultAccount.isClaimed) {
      const claimer = await program.methods
        .getClaimer()
        .accounts({ vault: vaultPda })
        .view();
      expect(claimer.toString()).to.equal(vaultAccount.claimer.toString());
    }
  });
});
