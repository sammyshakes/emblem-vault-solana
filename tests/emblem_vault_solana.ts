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
  let externalTokenId: string;

  before(async () => {
    mintKeypair = Keypair.generate();
    payerKeypair = Keypair.generate();
    externalTokenId = "EXT_" + Date.now().toString();

    await provider.connection
      .requestAirdrop(payerKeypair.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL)
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

    await program.methods
      .initializeVault("Test Vault", externalTokenId)
      .accounts({
        authority: payerKeypair.publicKey,
      })
      .signers([payerKeypair])
      .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.isInitialized).to.be.true;
    expect(vaultAccount.name).to.equal("Test Vault");
  });

  it("Mints an NFT", async () => {
    const metadataUri = "https://example.com/token-metadata";
    const vaultAccount = await program.account.vault.fetch(vaultPda);

    const timestamp = Math.floor(Date.now() / 1000);
    const message = `mint:${vaultPda.toBase58()}:${
      vaultAccount.nonce
    }:${timestamp}:${mintKeypair.publicKey.toBase58()}:${externalTokenId}`;
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

    const mintNftIx = await program.methods
      .mintNft(
        "Test NFT",
        "NFT",
        metadataUri,
        new anchor.BN(timestamp),
        vaultAccount.nonce,
        externalTokenId
      )
      .accounts({
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        metadata: metadataPda,
        payer: payerKeypair.publicKey,
        authority: payerKeypair.publicKey,
        tokenMetadataProgram: new PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
      } as any)
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, mintNftIx);
    await provider.sendAndConfirm(transaction, [payerKeypair]);

    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount.address
    );
    expect(new anchor.BN(tokenAccountInfo.value.amount).eq(new anchor.BN(1))).to
      .be.true;

    const updatedVaultAccount = await program.account.vault.fetch(vaultPda);
    expect(
      new anchor.BN(updatedVaultAccount.nonce).eq(
        vaultAccount.nonce.add(new anchor.BN(1))
      )
    ).to.be.true;
    expect(updatedVaultAccount.isClaimed).to.be.true;
  });

  it("Fails to mint an NFT with an invalid signature", async () => {
    const vaultAccount = await program.account.vault.fetch(vaultPda);

    const timestamp = Math.floor(Date.now() / 1000);
    const message = `mint:${vaultPda.toBase58()}:${
      vaultAccount.nonce
    }:${timestamp}:${mintKeypair.publicKey.toBase58()}:${externalTokenId}`;
    const messageBytes = decodeUTF8(message);

    const tamperedMessageBytes = decodeUTF8("tampered_message");
    const invalidSignature = nacl.sign.detached(
      tamperedMessageBytes,
      payerKeypair.secretKey
    );

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
      signature: invalidSignature,
    });

    const mintNftIx = await program.methods
      .mintNft(
        "Invalid NFT",
        "NFT",
        "https://example.com/token-metadata",
        new anchor.BN(timestamp),
        vaultAccount.nonce,
        externalTokenId
      )
      .accounts({
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        metadata: metadataPda,
        payer: payerKeypair.publicKey,
        authority: payerKeypair.publicKey,
        tokenMetadataProgram: new PublicKey(
          "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        ),
      } as any)
      .instruction();

    const transaction = new Transaction().add(verifySignatureIx, mintNftIx);

    try {
      await provider.sendAndConfirm(transaction, [payerKeypair]);
      throw new Error("Minting should have failed but it succeeded!");
    } catch (error) {
      // console.log("Mint failed as expected with error:", error.message);
      expect(error.message).to.include("precompile verification failure");
    }
  });

  it("Burns an NFT", async () => {
    const tx = await program.methods
      .burnNft()
      .accounts({
        vault: vaultPda,
        mint: mintKeypair.publicKey,
        tokenAccount: tokenAccount.address,
        authority: payerKeypair.publicKey,
      })
      .signers([payerKeypair])
      .rpc();

    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount.address
    );
    expect(tokenAccountInfo.value.uiAmount).to.equal(0);
  });
});
