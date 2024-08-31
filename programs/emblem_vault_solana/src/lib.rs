use anchor_lang::prelude::*;
use anchor_spl::metadata::{
    create_metadata_accounts_v3,
    mpl_token_metadata::types::{Creator, DataV2},
    CreateMetadataAccountsV3,
};
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("DMLBNjTTdxA3Tnbx21ZsQU3hX1VUSW4SENPb3HCZrBCr");

#[program]
pub mod emblem_vault_solana {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, name: String, external_token_id: String) -> Result<()> {
        msg!("Initializing vault with name: {} and external_token_id: {}", name, external_token_id);
        
        // Print out the seeds
        msg!("Seeds used in Rust:");
        msg!("Seed 1 (vault): {:?}", b"vault");
        msg!("Seed 2 (authority): {:?}", ctx.accounts.authority.key().to_bytes());
        msg!("Seed 3 (external_token_id): {:?}", external_token_id.as_bytes());
        
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.is_initialized = true;
        vault.name = name;
        vault.nonce = 0;
        vault.external_token_id = external_token_id;
        vault.is_claimed = false;
        
        msg!("Vault initialized successfully");
        Ok(())
    }

    pub fn mint_nft(
        ctx: Context<MintNFT>,
        name: String,
        symbol: String,
        uri: String,
        timestamp: i64,
        nonce: u64,
        external_token_id: String,
    ) -> Result<()> {
        msg!("Minting NFT...");
        msg!("Vault: {:?}", ctx.accounts.vault.key());
        msg!("Mint: {:?}", ctx.accounts.mint.key());
        msg!("Token Account: {:?}", ctx.accounts.token_account.key());
        msg!("Metadata: {:?}", ctx.accounts.metadata.key());
        msg!("Payer: {:?}", ctx.accounts.payer.key());

        let vault = &mut ctx.accounts.vault;
        require!(vault.is_initialized, VaultError::NotInitialized);
        require!(vault.nonce == nonce, VaultError::InvalidNonce);
        require!(!vault.is_claimed, VaultError::AlreadyClaimed);
        require!(vault.external_token_id == external_token_id, VaultError::InvalidExternalTokenId);
    
        // Check if the approval has expired (e.g., 15-minute validity)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time - timestamp <= 900, // 15 minutes
            VaultError::ApprovalExpired
        );

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

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_metadata_program.to_account_info(),
            accounts,
        );

        create_metadata_accounts_v3(
            cpi_ctx,
            data,
            false, // is_mutable
            true,  // update_authority_is_signer
            None,  // collection_details
        )?;

        // Mark the vault as claimed
        vault.is_claimed = true;

         // Increment the nonce
        vault.nonce += 1;

        Ok(())
    }

    pub fn burn_nft(ctx: Context<BurnNFT>) -> Result<()> {
        // Check if the token account has enough tokens to burn
        let token_account = &ctx.accounts.token_account;
        require!(token_account.amount >= 1, VaultError::InsufficientTokens);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            1,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String, external_token_id: String)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 4 + name.len() + 4 + external_token_id.len() + 1 + 8,
        seeds = [b"vault", authority.key().as_ref(), external_token_id.as_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitializeVault<'info> {
    pub fn seeds(&self) -> Vec<Vec<u8>> {
        vec![
            b"vault".to_vec(),
            self.authority.key().as_ref().to_vec(),
            self.vault.external_token_id.as_bytes().to_vec(),
        ]
    }
}
#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String, timestamp: i64, nonce: u64, external_token_id: String)]
pub struct MintNFT<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref(), external_token_id.as_bytes()],
        bump,
        has_one = authority,
        constraint = vault.external_token_id == external_token_id,
        constraint = !vault.is_claimed @ VaultError::AlreadyClaimed,
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
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_metadata_program: AccountInfo<'info>,
    pub authority: Signer<'info>,
}
#[derive(Accounts)]
pub struct BurnNFT<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub is_initialized: bool,
    pub name: String,
    pub nonce: u64,
    pub external_token_id: String,
    pub is_claimed: bool,
}

#[error_code]
pub enum VaultError {
    #[msg("The vault is not initialized")]
    NotInitialized,
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Approval has expired")]
    ApprovalExpired,
    #[msg("Insufficient tokens to burn")]
    InsufficientTokens,
    #[msg("Invalid nonce")]
    InvalidNonce,
    #[msg("Vault has already been claimed")]
    AlreadyClaimed,
    #[msg("Invalid external token ID")]
    InvalidExternalTokenId,
}
