import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import dotenv from "dotenv";

import { EmblemVaultSolana } from "../target/types/emblem_vault_solana";

dotenv.config();

async function main() {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Read the deployed program ID from the IDL file
  const idl = JSON.parse(
    fs.readFileSync("./target/idl/emblem_vault_solana.json", "utf8")
  );

  // Create a program interface
  const program = new Program(idl) as Program<EmblemVaultSolana>;

  console.log("Deploying Emblem Vault Solana Program...");

  // Derive the PDA for the program state
  const [programStatePda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state")],
    program.programId
  );

  // Initialize the program state
  const baseUri = process.env.BASE_URI;

  try {
    const tx = await program.methods
      .initializeProgram(baseUri)
      .accounts({
        authority: provider.wallet.publicKey,
      })
      .rpc();

    console.log("Program state initialized. Transaction signature:", tx);

    // Fetch and display the program state
    const programState = await program.account.programState.fetch(
      programStatePda
    );
    console.log("Program State:");
    console.log("  Base URI:", programState.baseUri);
    console.log("  Authority:", programState.authority.toBase58());

    // Additional setup steps can be added here
    // For example, setting up initial vaults, configuring fees, etc.

    console.log("Deployment completed successfully!");
  } catch (error) {
    console.error("Deployment failed:", error);
  }
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  }
);
