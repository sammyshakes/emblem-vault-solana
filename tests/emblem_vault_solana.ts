import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EmblemVaultSolana } from "../target/types/emblem_vault_solana";
import { expect } from "chai";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Ed25519Program,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  Account,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import { decodeUTF8, encodeBase64 } from "tweetnacl-util";

describe("emblem_vault_solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .EmblemVaultSolana as Program<EmblemVaultSolana>;

  let vaultPda: PublicKey;
  let mintKeypair: Keypair;
  let tokenAccount: Account;
  let payerKeypair: Keypair;

  before(async () => {
    // Create a new keypair for the mint
    mintKeypair = Keypair.generate();

    // Create a new keypair for the payer
    payerKeypair = Keypair.generate();

    // Airdrop some SOL to the payer
    const airdropSignature = await provider.connection.requestAirdrop(
      payerKeypair.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    // Create a new mint
    const mint = await createMint(
      provider.connection,
      payerKeypair,
      payerKeypair.publicKey, // Mint authority is the payerKeypair in this context
      null,
      0,
      mintKeypair
    );

    // Create a token account
    tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payerKeypair,
      mint,
      payerKeypair.publicKey
    );

    // Derive the PDA for the vault account based on seeds
    [vaultPda] = await PublicKey.findProgramAddressSync(
      [
        Buffer.from("vault"),
        payerKeypair.publicKey.toBuffer(),
        Buffer.from("Test Vault"),
      ],
      program.programId
    );

    // Initialize the vault
    const vaultName = "Test Vault";
    const tx = await program.methods
      .initializeVault(vaultName)
      .accounts({
        // vault: vaultPda,
        authority: payerKeypair.publicKey,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payerKeypair])
      .rpc();

    console.log("Initialization transaction signature", tx);

    const vaultAccount = await program.account.vault.fetch(vaultPda);
    expect(vaultAccount.authority.toString()).to.equal(
      payerKeypair.publicKey.toString()
    );
    expect(vaultAccount.isInitialized).to.be.true;
    expect(vaultAccount.name).to.equal(vaultName);
  });

  it("Mints an NFT", async () => {
    const metadataUri = "https://example.com/token-metadata";
    const name = "Test NFT";
    const symbol = "NFT";

    // Prepare the message and sign it with the payer's secret key
    const timestamp = Date.now();
    const message = `${payerKeypair.publicKey.toBase58()}:${timestamp}`;
    const messageBytes = decodeUTF8(message);
    const signature = nacl.sign.detached(messageBytes, payerKeypair.secretKey);

    console.log("Message:", message);
    console.log("Signature:", Buffer.from(signature).toString("hex"));

    const result = nacl.sign.detached.verify(
      messageBytes,
      signature,
      payerKeypair.publicKey.toBytes()
    );

    console.log("Signature verification:", result);
    expect(result).to.be.true;

    // Derive the correct PDA for the metadata account
    const [metadataPda, _] = await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintKeypair.publicKey.toBuffer(),
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    // Construct and send the transaction with Ed25519 verification
    // Step 1: Create Ed25519 signature verification instruction
    const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: payerKeypair.publicKey.toBytes(), // PublicKey of the signer
      message: messageBytes, // The original message that was signed
      signature: signature, // The signature to verify
    });

    // Step 2: Create custom program instruction (minting the NFT)
    const mintNftIx = await program.methods
      .mintNft(name, symbol, metadataUri, new anchor.BN(timestamp))
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
      })
      .signers([payerKeypair])
      .instruction();

    // Step 3: Combine both instructions into a single transaction
    const transaction = new Transaction().add(verifySignatureIx, mintNftIx);

    // Step 4: Send and confirm the transaction
    await provider.sendAndConfirm(transaction, [payerKeypair]);

    console.log("Mint transaction successfully sent and confirmed!");

    // Check the token account balance
    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount.address
    );
    expect(tokenAccountInfo.value.uiAmount).to.equal(1);
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

    console.log("Burn transaction signature", tx);

    // Check the token account balance
    const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
      tokenAccount.address
    );
    expect(tokenAccountInfo.value.uiAmount).to.equal(0);
  });
});
