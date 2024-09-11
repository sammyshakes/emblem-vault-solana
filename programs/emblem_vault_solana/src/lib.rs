use anchor_lang::prelude::*;

use mpl_core::{
    ID as MPL_CORE_PROGRAM_ID,
    accounts::BaseCollectionV1, 
    types::{PluginAuthorityPair, Plugin, PermanentFreezeDelegate}, 
    instructions::{CreateV2CpiBuilder, CreateCollectionV2CpiBuilder}, 
};

declare_id!("DMLBNjTTdxA3Tnbx21ZsQU3hX1VUSW4SENPb3HCZrBCr");

#[program]
pub mod emblem_vault_solana {
    use super::*;

    pub fn initialize_program(ctx: Context<InitializeProgram>, base_uri: String, signer: Pubkey) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        program_state.base_uri = base_uri;
        program_state.authority = ctx.accounts.authority.key();
        program_state.signer_public_key = signer;
        Ok(())
    }

    pub fn create_collection(ctx: Context<CreateCollection>, collection_type: String) -> Result<()> {
        let collection_bump = ctx.bumps.collection;
        let seeds = &[b"collection", collection_type.as_bytes(), &[collection_bump]]; 

        // Add initialization logic if needed
        if ctx.accounts.collection.to_account_info().lamports() == 0 {
            // The account has not been initialized, proceed with initialization
            msg!("Initializing collection with type: {}", collection_type);
        } else {
            // Collection already initialized
            msg!("Collection already exists");
            return Ok(());
        }
        
        let name: String = format!("Emblem {} Vaults", collection_type);
        
        let mut collection_plugins = vec![];

        collection_plugins.push( PluginAuthorityPair { plugin: Plugin::PermanentFreezeDelegate( PermanentFreezeDelegate { frozen: true}), authority: None});

        CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .payer(&ctx.accounts.payer.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri("https://example.com".to_string())
        .plugins(collection_plugins)
        .invoke_signed(&[seeds])?;
        
        Ok(())
    }

    pub fn create_asset(ctx: Context<CreateAsset>, external_token_id: String) -> Result<()> {
        let asset_bump = ctx.bumps.asset;
        let collection_key = ctx.accounts.collection.key();
        let seeds = &[b"vault", collection_key.as_ref(), external_token_id.as_bytes(), &[asset_bump]];

        // Check if the PDA account already exists
        if ctx.accounts.asset.to_account_info().lamports() > 0 {
            msg!("The asset PDA already exists. Skipping initialization.");
            return Err(VaultError::VaultAlreadyExists.into());
        }

        msg!("Creating asset with external token ID: {}", external_token_id);
        msg!("Collection key should match collection pda: {}", collection_key);

        
        // Generate metadata
        let name = format!("Emblem Vault {}", external_token_id);
        let uri = format!("{}{}", ctx.accounts.program_state.base_uri, external_token_id);

        CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.payer.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri(uri)
        .invoke_signed(&[seeds])?;

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
    #[msg("Vault already exists")]
    VaultAlreadyExists,
}

#[derive(Accounts)]
#[instruction(collection_type: String)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This doesn't need to be checked, initialized in the program
    #[account(
        mut,
        seeds = [b"collection", collection_type.as_bytes()],
        bump,
    )]
    pub collection: UncheckedAccount<'info>,  
    /// CHECK: This doesn't need to be checked, because there is the address constraint
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_token_id: String)]
pub struct CreateAsset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This doesn't need to be checked, initialized in the program
    #[account(
        mut, 
        seeds = [
            b"vault", 
            collection.to_account_info().key().as_ref(), 
            external_token_id.as_bytes()], 
            bump
        )]
    pub asset: AccountInfo<'info>,  // Define the asset PDA data
    #[account(mut)]
    pub collection: Account<'info, BaseCollectionV1>,  // Link to the collection
    /// CHECK: This doesn't need to be checked, because there is the address constraint
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub program_state: Account<'info, ProgramState>,
}

#[account]
pub struct AssetData {
    pub name: String,
    pub uri: String,
    pub external_token_id: String,
    pub price: u64,
    pub timestamp: i64,
}
