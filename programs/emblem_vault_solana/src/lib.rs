use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};
use anchor_spl::metadata::{
    create_metadata_accounts_v3,
    mpl_token_metadata::types::{Creator, DataV2},
    CreateMetadataAccountsV3,
};
use anchor_lang::solana_program::sysvar::instructions::{load_instruction_at_checked, ID as InstructionsID};
use anchor_lang::solana_program::ed25519_program;

declare_id!("DMLBNjTTdxA3Tnbx21ZsQU3hX1VUSW4SENPb3HCZrBCr");

#[program]
pub mod emblem_vault_solana {
    use super::*;

    pub fn initialize_program(ctx: Context<InitializeProgram>, base_uri: String, signer: Pubkey) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        program_state.base_uri = base_uri;
        program_state.authority = ctx.accounts.authority.key();
        program_state.authority = signer;
        Ok(())
    }

    pub fn mint_vault(
        ctx: Context<MintVault>,
        external_token_id: String,
        price: u64,
        timestamp: i64,
    ) -> Result<()> {
        msg!("Minting vault NFT...");

        // Verify the signature verification instruction was called
        msg!("Attempting to load previous instruction");
        let previous_ix = match load_instruction_at_checked(0, &ctx.accounts.instruction_sysvar_account.to_account_info()) {
            Ok(ix) => {
                msg!("Previous instruction loaded successfully");
                ix
            },
            Err(e) => {
                msg!("Error loading previous instruction: {:?}", e);
                return Err(e.into());
            }
        };
        msg!("Previous instruction program ID: {}", previous_ix.program_id);

        // // Extract the public key from the previous instruction
        let ed25519_ix_data = previous_ix.data;
        let pubkey_bytes = &ed25519_ix_data[16..48]; // public key is at slice 16..48, there exists a more elegant way with [ed25519_pubkey_offset..ed25519_pubkey_offset + 32]
        let verification_public_key = Pubkey::new_from_array(pubkey_bytes.try_into().unwrap());
        msg!("Verification public key: {}", verification_public_key);

        // Check if the verification public key matches the stored signer public key
        msg!("Stored signer public key: {}", ctx.accounts.program_state.signer_public_key);
        if verification_public_key != ctx.accounts.program_state.signer_public_key {
            msg!("Invalid signer: Verification key does not match stored signer key");
            return Err(VaultError::InvalidSigner.into());
        }


        // Check if the approval has expired (15-minute validity)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time - timestamp <= 900,
            VaultError::ApprovalExpired
        );

        // Collect minting fee
        let fee = price;
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.fee_receiver.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, fee)?;

        // Mint one token
        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            ),
            1,
        )?;

        // // Generate metadata
        let name = format!("Emblem Vault {}", external_token_id);
        let symbol = generate_symbol(&external_token_id);
        let uri = format!("{}{}", ctx.accounts.program_state.base_uri, external_token_id);

        // Create metadata
        let data = DataV2 {
            name,
            symbol,
            uri,
            seller_fee_basis_points: 0,
            creators: Some(vec![Creator {
                address: ctx.accounts.payer.key(),
                verified: false,
                share: 100,
            }]),
            collection: None,
            uses: None,
        };

        let accounts = CreateMetadataAccountsV3 {
            metadata: ctx.accounts.metadata.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            mint_authority: ctx.accounts.payer.to_account_info(),
            payer: ctx.accounts.payer.to_account_info(),
            update_authority: ctx.accounts.payer.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };

        create_metadata_accounts_v3(
            CpiContext::new(ctx.accounts.token_metadata_program.to_account_info(), accounts),
            data,
            false, // is_mutable
            true,  // update_authority_is_signer
            None,  // collection_details
        )?;

        // Initialize vault data
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.payer.key();
        vault.external_token_id = external_token_id;
        vault.is_minted = true;
        vault.is_claimed = false;
        vault.claimer = None;
        vault.mint = ctx.accounts.mint.key();
        vault.token_account = ctx.accounts.token_account.key();

        Ok(())
    }

    pub fn claim_vault(
        ctx: Context<ClaimVault>,
        external_token_id: String,
        price: u64,
        timestamp: i64,
    ) -> Result<()> {
        msg!("Claiming vault...");
        
        // Verify the signature verification instruction was called
        let previous_ix = load_instruction_at_checked(0, &ctx.accounts.instruction_sysvar_account.to_account_info())?;
        if previous_ix.program_id != ed25519_program::ID {
            return Err(VaultError::InvalidSignature.into());
        }

        let vault = &mut ctx.accounts.vault;
        require!(vault.is_minted, VaultError::NotMinted);
        require!(!vault.is_claimed, VaultError::AlreadyClaimed);
        require!(vault.external_token_id == external_token_id, VaultError::InvalidExternalTokenId);

        // Check if the approval has expired (15-minute validity)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time - timestamp <= 900,
            VaultError::ApprovalExpired
        );

        // Collect claiming fee
        let fee = price;
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.claimer.to_account_info(),
                to: ctx.accounts.fee_receiver.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, fee)?;

        // Burn the NFT
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.claimer.to_account_info(),
                },
            ),
            1,
        )?;

        // Update vault data
        vault.is_claimed = true;
        vault.claimer = Some(ctx.accounts.claimer.key());

        Ok(())
    }

    pub fn set_base_uri(ctx: Context<SetBaseUri>, new_base_uri: String) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        require!(ctx.accounts.authority.key() == program_state.authority, VaultError::Unauthorized);
        program_state.base_uri = new_base_uri;
        Ok(())
    }

    // Query functions
    pub fn is_claimed(ctx: Context<QueryVault>) -> Result<bool> {
        Ok(ctx.accounts.vault.is_claimed)
    }

    pub fn get_vault_owner(ctx: Context<QueryVault>) -> Result<Pubkey> {
        Ok(ctx.accounts.vault.owner)
    }

    pub fn get_claimer(ctx: Context<QueryVault>) -> Result<Option<Pubkey>> {
        Ok(ctx.accounts.vault.claimer)
    }

    pub fn get_base_uri(ctx: Context<GetBaseUri>) -> Result<String> {
        Ok(ctx.accounts.program_state.base_uri.clone())
    }

    pub fn update_signer_public_key(ctx: Context<UpdateSignerPublicKey>, new_signer_public_key: Pubkey) -> Result<()> {
        require!(ctx.accounts.authority.key() == ctx.accounts.program_state.authority, VaultError::Unauthorized);
        ctx.accounts.program_state.signer_public_key = new_signer_public_key;
        Ok(())
    }
}

 // Helper function to generate a symbol
 fn generate_symbol(external_token_id: &str) -> String {
    let prefix = "EV";
    let suffix: String = external_token_id.chars().filter(|c| c.is_ascii_alphanumeric()).take(3).collect();
    format!("{}{}", prefix, suffix).to_uppercase()
}

#[derive(Accounts)]
pub struct InitializeProgram<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 +     // discriminator
                200 +   // base_uri (String)
                32 +     // authority (Pubkey)
                32,      // signer_public_key (Pubkey)
        seeds = [b"program_state"],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_token_id: String, price: u64, timestamp: i64)]
pub struct MintVault<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 +         // discriminator
                32 +        // owner (Pubkey)
                4 + 200 +   // external_token_id (String)
                1 +         // is_minted (bool)
                1 +         // is_claimed (bool)
                33 +        // claimer (Option<Pubkey>)
                32 +        // mint (Pubkey)
                32,         // token_account (Pubkey)
        seeds = [b"vault", payer.key().as_ref(), external_token_id.as_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub metadata: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This is the account that will receive the fee
    #[account(mut)]
    pub fee_receiver: AccountInfo<'info>,
    /// CHECK: This account is not dangerous because we only read from it
    #[account(address = InstructionsID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_metadata_program: AccountInfo<'info>,
    pub program_state: Account<'info, ProgramState>,
}

#[derive(Accounts)]
#[instruction(external_token_id: String, price: u64, timestamp: i64)]
pub struct ClaimVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref(), external_token_id.as_bytes()],
        bump,
        constraint = vault.external_token_id == external_token_id,
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    /// CHECK: This is the account that will receive the fee
    #[account(mut)]
    pub fee_receiver: AccountInfo<'info>,
    /// CHECK: This account is not dangerous because we only read from it
    #[account(address = InstructionsID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct QueryVault<'info> {
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct SetBaseUri<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct GetBaseUri<'info> {
    pub program_state: Account<'info, ProgramState>,
}


#[derive(Accounts)]
pub struct UpdateSignerPublicKey<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,
    pub authority: Signer<'info>,
}

#[account]
pub struct ProgramState {
    pub base_uri: String,
    pub authority: Pubkey,
    pub signer_public_key: Pubkey,
}

#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub external_token_id: String,
    pub is_minted: bool,
    pub is_claimed: bool,
    pub claimer: Option<Pubkey>,
    pub mint: Pubkey,
    pub token_account: Pubkey,
}

#[error_code]
pub enum VaultError {
    #[msg("The vault is not minted")]
    NotMinted,
    #[msg("Approval has expired")]
    ApprovalExpired,
    #[msg("Vault has already been claimed")]
    AlreadyClaimed,
    #[msg("Invalid external token ID")]
    InvalidExternalTokenId,
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid signer")]
    InvalidSigner,
}