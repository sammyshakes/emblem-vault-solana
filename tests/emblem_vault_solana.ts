import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import {
  Keypair,
  PublicKey,
  Transaction,
  Ed25519Program,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";
import { EmblemVaultSolana } from "../target/types/emblem_vault_solana";
import { MPL_CORE_PROGRAM_ID } from "@metaplex-foundation/mpl-core";

describe("emblem_vault_solana", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payerWallet = anchor.Wallet.local();

  //console wallet public key and payer
  console.log("wallet", payerWallet.publicKey.toBase58());
  console.log("payer public", payerWallet.payer.publicKey.toBase58());
  console.log("payer secret", payerWallet.payer.secretKey);

  const collectionType = "open";

  const program = anchor.workspace
    .EmblemVaultSolana as Program<EmblemVaultSolana>;

  let vaultPda: PublicKey;
  let collectionPda: PublicKey;
  let vaultSeeds: Buffer[];
  let collectionSeeds: Buffer[];
  let payerKeypair: Keypair;
  let signerKeypair: Keypair;
  let feeReceiverKeypair: Keypair;
  let externalTokenId: string;

  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state")],
    program.programId
  );

  before(async () => {
    payerKeypair = payerWallet.payer;
    signerKeypair = Keypair.generate();
    feeReceiverKeypair = Keypair.generate();
    const randomNum = Math.floor(Math.random() * 1000);
    externalTokenId = `EXT_${Date.now()}_${randomNum}`;

    // await provider.connection
    //   .requestAirdrop(payerKeypair.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL)
    //   .then((airdropSignature) =>
    //     provider.connection.confirmTransaction(airdropSignature)
    //   );

    collectionSeeds = [Buffer.from("collection"), Buffer.from(collectionType)];
    [collectionPda] = PublicKey.findProgramAddressSync(
      collectionSeeds,
      program.programId
    );

    vaultSeeds = [
      Buffer.from("vault"),
      collectionPda.toBuffer(),
      Buffer.from(externalTokenId),
    ];
    [vaultPda] = PublicKey.findProgramAddressSync(
      vaultSeeds,
      program.programId
    );

    // //console all the variables
    console.log("vaultPda", vaultPda.toBase58());
    console.log("collectionPda", collectionPda.toBase58());
    // console.log("vaultSeeds", vaultSeeds);
    // console.log("collectionSeeds", collectionSeeds);
    // console.log("payerKeypair", payerKeypair.publicKey.toBase58());
    // console.log("signerKeypair", signerKeypair.publicKey.toBase58());
    // console.log("feeReceiverKeypair", feeReceiverKeypair.publicKey.toBase58());
    console.log("externalTokenId", externalTokenId);
    // console.log("programStatePda", programStatePda.toBase58());
  });

  // it("Initializes program state", async () => {
  //   const baseUri = "https://example.com/metadata/";

  //   await program.methods
  //     .initializeProgram(baseUri, signerKeypair.publicKey)
  //     .accounts({
  //       authority: payerKeypair.publicKey,
  //     })
  //     .signers([payerKeypair])
  //     .rpc();

  //   const programState = await program.account.programState.fetch(
  //     programStatePda
  //   );

  //   expect(programState.baseUri).to.equal(baseUri);
  //   expect(programState.authority.toString()).to.equal(
  //     payerKeypair.publicKey.toString()
  //   );
  //   expect(programState.signerPublicKey.toBase58()).to.equal(
  //     signerKeypair.publicKey.toString()
  //   );
  // });

  it("Create Collection!", async () => {
    const tx = await program.methods
      .createCollection(collectionType)
      .accountsPartial({
        // signer: payerKeypair.publicKey,
        payer: payerKeypair.publicKey,
        collection: collectionPda,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
      })
      .signers([payerKeypair])
      .rpc();

    console.log(tx);
  });

  it("Create Asset!", async () => {
    const tx = await program.methods
      .createAsset(externalTokenId)
      .accountsPartial({
        // signer: payerKeypair.publicKey,
        payer: payerKeypair.publicKey,
        asset: vaultPda,
        collection: collectionPda,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        programState: programStatePda,
      })
      .signers([payerKeypair])
      .rpc();

    console.log(tx);
  });

  // it("Fails to mint a vault NFT without signature verification", async () => {
  //   const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
  //   const timestamp = Math.floor(Date.now() / 1000);

  //   const mintVaultIx = await program.methods
  //     .mintVault(externalTokenId, price, new anchor.BN(timestamp))
  //     .accounts({
  //       mint: mintKeypair.publicKey,
  //       tokenAccount: tokenAccount.address,
  //       metadata: Keypair.generate().publicKey, // This is just a placeholder
  //       payer: payerKeypair.publicKey,
  //       feeReceiver: feeReceiverKeypair.publicKey,
  //       programState: programStatePda,
  //       tokenMetadataProgram: new PublicKey(
  //         "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  //       ),
  //     })
  //     .instruction();

  //   const transaction = new Transaction().add(mintVaultIx);

  //   try {
  //     await provider.sendAndConfirm(transaction, [payerKeypair]);
  //     throw new Error("Minting should have failed but it succeeded!");
  //   } catch (error) {
  //     expect(error.message).to.include(
  //       "Transaction simulation failed: Error processing Instruction 0"
  //     );
  //   }
  // });

  // it("Fails to mint a vault NFT with a valid signature but unauthorized signer", async () => {
  //   const unauthorizedSigner = Keypair.generate(); // New keypair for unauthorized signer
  //   const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL fee
  //   const timestamp = Math.floor(Date.now() / 1000);
  //   const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
  //   const messageBytes = decodeUTF8(message);

  //   // Sign the message with the unauthorized signer's keypair
  //   const signature = nacl.sign.detached(
  //     messageBytes,
  //     unauthorizedSigner.secretKey
  //   );

  //   const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
  //     publicKey: unauthorizedSigner.publicKey.toBytes(),
  //     message: messageBytes,
  //     signature: signature,
  //   });

  //   const mintVaultIx = await program.methods
  //     .mintVault(externalTokenId, price, new anchor.BN(timestamp))
  //     .accounts({
  //       mint: mintKeypair.publicKey,
  //       tokenAccount: tokenAccount.address,
  //       metadata: Keypair.generate().publicKey, // This is just a placeholder
  //       payer: payerKeypair.publicKey,
  //       feeReceiver: feeReceiverKeypair.publicKey,
  //       programState: programStatePda,
  //       tokenMetadataProgram: new PublicKey(
  //         "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  //       ),
  //     })
  //     .instruction();

  //   const transaction = new Transaction().add(verifySignatureIx, mintVaultIx);

  //   try {
  //     // Attempt to send the transaction with the unauthorized signer
  //     await provider.sendAndConfirm(transaction, [
  //       payerKeypair,
  //       unauthorizedSigner,
  //     ]);
  //     throw new Error("Minting should have failed but it succeeded!");
  //   } catch (error) {
  //     // console.error("Transaction Error:", error.message);
  //     expect(error.message).to.include("unknown signer");
  //   }
  // });

  // it("Fails to mint a vault NFT with an invalid signature", async () => {
  //   const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL);
  //   const timestamp = Math.floor(Date.now() / 1000);
  //   const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
  //   const messageBytes = decodeUTF8(message);

  //   const tamperedMessageBytes = decodeUTF8("tampered_message");
  //   const invalidSignature = nacl.sign.detached(
  //     tamperedMessageBytes,
  //     signerKeypair.secretKey
  //   );

  //   const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
  //     publicKey: signerKeypair.publicKey.toBytes(),
  //     message: messageBytes,
  //     signature: invalidSignature,
  //   });

  //   const mintVaultIx = await program.methods
  //     .mintVault(externalTokenId, price, new anchor.BN(timestamp))
  //     .accounts({
  //       mint: mintKeypair.publicKey,
  //       tokenAccount: tokenAccount.address,
  //       metadata: Keypair.generate().publicKey, // This is just a placeholder
  //       payer: payerKeypair.publicKey,
  //       feeReceiver: feeReceiverKeypair.publicKey,
  //       programState: programStatePda,
  //       tokenMetadataProgram: new PublicKey(
  //         "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  //       ),
  //     })
  //     .instruction();

  //   const transaction = new Transaction().add(verifySignatureIx, mintVaultIx);

  //   try {
  //     await provider.sendAndConfirm(transaction, [payerKeypair]);
  //     throw new Error("Minting should have failed but it succeeded!");
  //   } catch (error) {
  //     expect(error.message).to.include("precompile verification failure");
  //   }
  // });

  // it("Mints a vault NFT", async () => {
  //   const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL fee
  //   const timestamp = Math.floor(Date.now() / 1000);
  //   const message = `mint:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
  //   const messageBytes = decodeUTF8(message);
  //   const signature = nacl.sign.detached(messageBytes, signerKeypair.secretKey);

  //   const [metadataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("metadata"),
  //       new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
  //       mintKeypair.publicKey.toBuffer(),
  //     ],
  //     new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  //   );

  //   const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
  //     publicKey: signerKeypair.publicKey.toBytes(),
  //     message: messageBytes,
  //     signature: signature,
  //   });

  //   const mintVaultIx = await program.methods
  //     .mintVault(externalTokenId, price, new anchor.BN(timestamp))
  //     .accounts({
  //       mint: mintKeypair.publicKey,
  //       tokenAccount: tokenAccount.address,
  //       metadata: metadataPda,
  //       payer: payerKeypair.publicKey,
  //       feeReceiver: feeReceiverKeypair.publicKey,
  //       programState: programStatePda,
  //       tokenMetadataProgram: new PublicKey(
  //         "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  //       ),
  //     })
  //     .instruction();

  //   const transaction = new Transaction().add(verifySignatureIx, mintVaultIx);
  //   await provider.sendAndConfirm(transaction, [payerKeypair]);

  //   const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
  //     tokenAccount.address
  //   );
  //   expect(new anchor.BN(tokenAccountInfo.value.amount).eq(new anchor.BN(1))).to
  //     .be.true;

  //   const vaultAccount = await program.account.vault.fetch(vaultPda);
  //   expect(vaultAccount.isMinted).to.be.true;
  //   expect(vaultAccount.isClaimed).to.be.false;
  //   expect(vaultAccount.externalTokenId).to.equal(externalTokenId);
  //   expect(vaultAccount.owner.toString()).to.equal(
  //     payerKeypair.publicKey.toString()
  //   );
  //   expect(vaultAccount.mint.toString()).to.equal(
  //     mintKeypair.publicKey.toString()
  //   );
  //   expect(vaultAccount.tokenAccount.toString()).to.equal(
  //     tokenAccount.address.toString()
  //   );
  // });

  // it("Claims a vault NFT", async () => {
  //   const price = new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL); // 0.5 SOL fee
  //   const timestamp = Math.floor(Date.now() / 1000);
  //   const message = `claim:${vaultPda.toBase58()}:${price.toString()}:${timestamp}:${externalTokenId}`;
  //   const messageBytes = decodeUTF8(message);
  //   const signature = nacl.sign.detached(messageBytes, signerKeypair.secretKey);

  //   const verifySignatureIx = Ed25519Program.createInstructionWithPublicKey({
  //     publicKey: signerKeypair.publicKey.toBytes(),
  //     message: messageBytes,
  //     signature: signature,
  //   });

  //   const claimVaultIx = await program.methods
  //     .claimVault(externalTokenId, price, new anchor.BN(timestamp))
  //     .accounts({
  //       mint: mintKeypair.publicKey,
  //       tokenAccount: tokenAccount.address,
  //       claimer: payerKeypair.publicKey,
  //       feeReceiver: feeReceiverKeypair.publicKey,
  //     })
  //     .instruction();

  //   const transaction = new Transaction().add(verifySignatureIx, claimVaultIx);
  //   await provider.sendAndConfirm(transaction, [payerKeypair]);

  //   const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
  //     tokenAccount.address
  //   );
  //   expect(tokenAccountInfo.value.uiAmount).to.equal(0);

  //   const vaultAccount = await program.account.vault.fetch(vaultPda);
  //   expect(vaultAccount.isClaimed).to.be.true;
  //   expect(vaultAccount.claimer.toString()).to.equal(
  //     payerKeypair.publicKey.toString()
  //   );
  // });

  // it("Queries vault information", async () => {
  //   const vaultAccount = await program.account.vault.fetch(vaultPda);

  //   const isClaimed = await program.methods
  //     .isClaimed()
  //     .accounts({ vault: vaultPda })
  //     .view();
  //   expect(isClaimed).to.equal(vaultAccount.isClaimed);
  //   // console.log("isClaimed", isClaimed);

  //   const vaultOwner = await program.methods
  //     .getVaultOwner()
  //     .accounts({ vault: vaultPda })
  //     .view();
  //   expect(vaultOwner.toString()).to.equal(vaultAccount.owner.toString());
  //   // console.log("vaultOwner", vaultOwner);

  //   if (vaultAccount.isClaimed) {
  //     const claimer = await program.methods
  //       .getClaimer()
  //       .accounts({ vault: vaultPda })
  //       .view();
  //     expect(claimer.toString()).to.equal(vaultAccount.claimer.toString());
  //     // console.log("claimer", claimer);
  //   }
  // });

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

  // it("Updates the signer public key and verifies the change", async () => {
  //   const newSignerKeypair = Keypair.generate(); // New signer public key
  //   const oldSignerKeypair = signerKeypair; // Reference to the old signer

  //   // Step 1: Update signer public key using the authority
  //   await program.methods
  //     .updateSignerPublicKey(newSignerKeypair.publicKey)
  //     .accounts({
  //       programState: programStatePda,
  //       authority: payerKeypair.publicKey, // Authority is the payer
  //     })
  //     .signers([payerKeypair]) // Authority signer
  //     .rpc();

  //   // Fetch the updated program state to verify the signer public key change
  //   const updatedProgramState = await program.account.programState.fetch(
  //     programStatePda
  //   );
  //   expect(updatedProgramState.signerPublicKey.toString()).to.equal(
  //     newSignerKeypair.publicKey.toString()
  //   );

  //   // Step 2: Generate a new external token ID
  //   const newExternalTokenId = "EXT1_" + Date.now().toString();

  //   // Recalculate the PDA based on the new external token ID
  //   const [newVaultPda] = PublicKey.findProgramAddressSync(
  //     [Buffer.from("vault"), Buffer.from(newExternalTokenId)],
  //     program.programId
  //   );

  //   // Create a new mint keypair, metadata and token account for the new vault
  //   mintKeypair = Keypair.generate();
  //   const mint = await createMint(
  //     provider.connection,
  //     payerKeypair,
  //     payerKeypair.publicKey,
  //     null,
  //     0,
  //     mintKeypair
  //   );

  //   tokenAccount = await getOrCreateAssociatedTokenAccount(
  //     provider.connection,
  //     payerKeypair,
  //     mint,
  //     payerKeypair.publicKey
  //   );

  //   const [metadataPda] = PublicKey.findProgramAddressSync(
  //     [
  //       Buffer.from("metadata"),
  //       new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
  //       mintKeypair.publicKey.toBuffer(),
  //     ],
  //     new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
  //   );

  //   // Attempt to mint using the old signer, it should fail
  //   const price = new anchor.BN(1 * anchor.web3.LAMPORTS_PER_SOL); // 1 SOL fee
  //   const timestamp = Math.floor(Date.now() / 1000);
  //   const message = `mint:${newVaultPda.toBase58()}:${price.toString()}:${timestamp}:${newExternalTokenId}`;
  //   const messageBytes = decodeUTF8(message);
  //   const oldSignature = nacl.sign.detached(
  //     messageBytes,
  //     oldSignerKeypair.secretKey
  //   ); // Old signer's signature

  //   const verifyOldSignatureIx = Ed25519Program.createInstructionWithPublicKey({
  //     publicKey: oldSignerKeypair.publicKey.toBytes(),
  //     message: messageBytes,
  //     signature: oldSignature,
  //   });

  //   const mintVaultIx = await program.methods
  //     .mintVault(newExternalTokenId, price, new anchor.BN(timestamp))
  //     .accounts({
  //       mint: mintKeypair.publicKey,
  //       tokenAccount: tokenAccount.address,
  //       metadata: metadataPda,
  //       payer: payerKeypair.publicKey,
  //       feeReceiver: feeReceiverKeypair.publicKey,
  //       programState: programStatePda,
  //       tokenMetadataProgram: new PublicKey(
  //         "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  //       ),
  //     })
  //     .instruction();

  //   const oldTransaction = new Transaction().add(
  //     verifyOldSignatureIx,
  //     mintVaultIx
  //   );

  //   try {
  //     await provider.sendAndConfirm(oldTransaction, [payerKeypair]);
  //     throw new Error(
  //       "Minting should have failed with the old signer but it succeeded!"
  //     );
  //   } catch (error) {
  //     // console.error("Transaction Error:", error.message);
  //     expect(error.message).to.include("Invalid signer");
  //   }

  //   // Step 3: Attempt to mint using the new signer, it should succeed
  //   const newSignature = nacl.sign.detached(
  //     messageBytes,
  //     newSignerKeypair.secretKey
  //   ); // New signer's signature

  //   const verifyNewSignatureIx = Ed25519Program.createInstructionWithPublicKey({
  //     publicKey: newSignerKeypair.publicKey.toBytes(),
  //     message: messageBytes,
  //     signature: newSignature,
  //   });

  //   const newTransaction = new Transaction().add(
  //     verifyNewSignatureIx,
  //     mintVaultIx
  //   );
  //   await provider.sendAndConfirm(newTransaction, [payerKeypair]);

  //   // Verify that the vault was successfully minted
  //   const tokenAccountInfo = await provider.connection.getTokenAccountBalance(
  //     tokenAccount.address
  //   );
  //   expect(new anchor.BN(tokenAccountInfo.value.amount).eq(new anchor.BN(1))).to
  //     .be.true;

  //   const vaultAccount = await program.account.vault.fetch(newVaultPda);
  //   expect(vaultAccount.isMinted).to.be.true;
  // });

  it("Fails to update signer public key by unauthorized account", async () => {
    const unauthorizedKeypair = Keypair.generate(); // Generate a new unauthorized keypair
    const newSignerKeypair = Keypair.generate(); // New signer public key

    try {
      // Attempt to update the signer public key using an unauthorized account
      await program.methods
        .updateSignerPublicKey(newSignerKeypair.publicKey)
        .accounts({
          programState: programStatePda,
          authority: unauthorizedKeypair.publicKey, // Unauthorized authority
        })
        .signers([unauthorizedKeypair]) // Sign the transaction with the unauthorized keypair
        .rpc();

      throw new Error("Unauthorized update should have failed but succeeded!");
    } catch (error) {
      // Check that the error is the expected "Unauthorized" error
      expect(error.message).to.include("Error Code: Unauthorized");
      expect(error.message).to.include("Error Number: 6005");
    }

    // Fetch the program state and ensure the signer public key wasn't updated
    const programState = await program.account.programState.fetch(
      programStatePda
    );
    expect(programState.signerPublicKey.toString()).to.not.equal(
      newSignerKeypair.publicKey.toString()
    );
  });

  it("Successfully updates signer public key by the authorized authority", async () => {
    const newSignerKeypair = Keypair.generate(); // New signer public key

    // Call update_signer_public_key from the authorized authority (payerKeypair in this case)
    await program.methods
      .updateSignerPublicKey(newSignerKeypair.publicKey)
      .accounts({
        programState: programStatePda,
        authority: payerKeypair.publicKey, // Authorized authority
      })
      .signers([payerKeypair]) // Authority signer
      .rpc();

    // Fetch the updated program state and assert the signer public key is updated
    const updatedProgramState = await program.account.programState.fetch(
      programStatePda
    );
    expect(updatedProgramState.signerPublicKey.toString()).to.equal(
      newSignerKeypair.publicKey.toString()
    );
  });
});
