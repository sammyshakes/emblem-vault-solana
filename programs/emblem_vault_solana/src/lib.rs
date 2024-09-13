use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{load_instruction_at_checked, ID as InstructionsID};
use anchor_lang::solana_program::ed25519_program;
use mpl_core::{
    ID as MPL_CORE_PROGRAM_ID,
    accounts::BaseCollectionV1, 
    types::{
        Attribute,
        Attributes,
        PluginAuthorityPair, 
        Plugin, 
        PluginAuthority, 
        PermanentBurnDelegate, 
        PermanentFreezeDelegate
    }, 
    instructions::{CreateV2CpiBuilder, CreateCollectionV2CpiBuilder, BurnV1}, 
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

        // Add permanent freeze delegate plugin if freeze authority is provided
        if let Some(freeze_authority) = &ctx.accounts.freeze_authority {
            collection_plugins.push(PluginAuthorityPair {
                plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: false }),
                authority: Some(PluginAuthority::Address { address: freeze_authority.key() }),
            });
        }

        // Add permanent burn delegate plugin if burn authority is provided
        if let Some(burn_authority) = &ctx.accounts.burn_authority {
            collection_plugins.push(PluginAuthorityPair {
                plugin: Plugin::PermanentBurnDelegate(PermanentBurnDelegate {}),
                authority: Some(PluginAuthority::Address { address: burn_authority.key() }),
            });
        }

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

    pub fn mint_vault(ctx: Context<MintVault>, external_token_id: String, price: u64, timestamp: i64) -> Result<()> {
        // Verify the signature verification instruction was called
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

        // Check if the verification public key matches the stored signer public key
        if verification_public_key != ctx.accounts.program_state.signer_public_key {
            msg!("Invalid signer: Verification key does not match stored signer key");
            msg!("Verification public key: {}", verification_public_key);
            msg!("Stored signer public key: {}", ctx.accounts.program_state.signer_public_key);
            return Err(VaultError::InvalidSigner.into());
        }

        // Check if the approval has expired (15-minute validity)
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time - timestamp <= 900,
            VaultError::ApprovalExpired
        );

        let asset_bump = ctx.bumps.asset;
        let collection_key = ctx.accounts.collection.key();
        let seeds = &[b"vault", collection_key.as_ref(), external_token_id.as_bytes(), &[asset_bump]];

        // Check if the PDA account already exists
        if ctx.accounts.asset.to_account_info().lamports() > 0 {
            return Err(VaultError::VaultAlreadyExists.into());
        }

        msg!("Creating asset with external token ID: {}", external_token_id);
        msg!("Collection key should match collection pda: {}", collection_key);

        let mut asset_attributes = vec![];

        // Create initial attributes
        let initial_attributes = Attributes {
            attribute_list: vec![
                Attribute {
                    key: "is_minted".to_string(),
                    value: "true".to_string(),
                },
                Attribute {
                    key: "is_claimed".to_string(),
                    value: "false".to_string(),
                },
                Attribute {
                    key: "external_token_id".to_string(),
                    value: external_token_id.to_string(),
                },
            ],
        };

        asset_attributes.push(PluginAuthorityPair {
            plugin: Plugin::Attributes(
                initial_attributes
            ),
            authority: Some(PluginAuthority::Address { address: ctx.accounts.payer.key() }),
        });
        
        // Generate metadata
        let name = format!("Emblem Vault {}", external_token_id);
        let uri = format!("{}{}", ctx.accounts.program_state.base_uri, external_token_id);

        CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .plugins(asset_attributes)
        .payer(&ctx.accounts.payer.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri("ipfs://QmeFkqZBSaBoeXQ5cb2d7jqD9DYz6EqzfMV35LznWXtfaB/1".to_string())
        .invoke_signed(&[seeds])?;

        Ok(())
    }

    // pub fn claim_vault(
    //     ctx: Context<ClaimVault>,
    //     external_token_id: String,
    //     price: u64,
    //     timestamp: i64,
    // ) -> Result<()> {
    //     msg!("Claiming vault...");
        
    //     // Verify the signature verification instruction was called
    //     let previous_ix = load_instruction_at_checked(0, &ctx.accounts.instruction_sysvar_account.to_account_info())?;
    //     if previous_ix.program_id != ed25519_program::ID {
    //         return Err(VaultError::InvalidSignature.into());
    //     }
    
    //     // Extract the public key from the previous instruction
    //     let ed25519_ix_data = previous_ix.data;
    //     let pubkey_bytes = &ed25519_ix_data[16..48];
    //     let verification_public_key = Pubkey::new_from_array(pubkey_bytes.try_into().unwrap());
    
    //     // Check if the verification public key matches the stored signer public key
    //     if verification_public_key != ctx.accounts.program_state.signer_public_key {
    //         return Err(VaultError::InvalidSigner.into());
    //     }
    
    //     let asset = &ctx.accounts.asset;
        
    //     // Check if the asset is minted and not claimed
    //     require!(asset.is_some(), VaultError::NotMinted);
    //     require!(!asset.is_frozen(), VaultError::AlreadyClaimed);
        
    //     // Check if the external token ID matches
    //     // Note: You might need to adjust this based on how you store the external_token_id in the Metaplex asset
    //     require!(asset.name == format!("Emblem Vault {}", external_token_id), VaultError::InvalidExternalTokenId);
    
    //     // Check if the approval has expired (15-minute validity)
    //     let current_time = Clock::get()?.unix_timestamp;
    //     require!(
    //         current_time - timestamp <= 900,
    //         VaultError::ApprovalExpired
    //     );
    
    //     // Collect claiming fee
    //     let fee = price;
    //     let cpi_context = CpiContext::new(
    //         ctx.accounts.system_program.to_account_info(),
    //         anchor_lang::system_program::Transfer {
    //             from: ctx.accounts.claimer.to_account_info(),
    //             to: ctx.accounts.fee_receiver.to_account_info(),
    //         },
    //     );
    //     anchor_lang::system_program::transfer(cpi_context, fee)?;
    
    //     // // Burn the asset using Metaplex Core
    //     // let cpi_accounts = BurnV1 {
    //     //     asset: ctx.accounts.asset.to_account_info(),
    //     //     collection: Some(ctx.accounts.collection.key()),
    //     //     authority: Some(ctx.accounts.claimer.key()),
            
    //     // };
    
    //     // let cpi_context = CpiContext::new(
    //     //     ctx.accounts.mpl_core_program.to_account_info(),
    //     //     cpi_accounts,
    //     // );
    
    //     // mpl_core::cpi::burn_v1(cpi_context)?;
    
    //     // Update claim status (if needed)
    //     // Note: You might need to adjust this based on how you want to track claimed status
    //     // For example, you could add a custom attribute to the asset instead of using a separate vault account
    
    //     Ok(())
    // }

    pub fn set_base_uri(ctx: Context<SetBaseUri>, new_base_uri: String) -> Result<()> {
        let program_state = &mut ctx.accounts.program_state;
        require!(ctx.accounts.authority.key() == program_state.authority, VaultError::Unauthorized);
        program_state.base_uri = new_base_uri;
        Ok(())
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
    pub burn_authority: Option<Signer<'info>>,
    pub freeze_authority: Option<Signer<'info>>,
    /// CHECK: This doesn't need to be checked, because there is the address constraint
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_token_id: String, price: u64, timestamp: i64)]
pub struct MintVault<'info> {
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
    /// CHECK: This account is not dangerous because we only read from it
    #[account(address = InstructionsID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
}

// #[derive(Accounts)]
// #[instruction(external_token_id: String, price: u64, timestamp: i64)]
// pub struct ClaimVault<'info> {
//     #[account(mut)]
//     pub claimer: Signer<'info>,
//     #[account(mut)]
//     pub payer: Signer<'info>,
//     #[account(mut)]
//     pub collection: Account<'info, BaseCollectionV1>,
//     #[account(
//         mut,
//         seeds = [b"vault", collection.key().as_ref(), external_token_id.as_bytes()],
//         bump,
//     )]
//     pub asset: Account<'info, BaseAssetV1>,
//     #[account(mut)]
//     pub fee_receiver: SystemAccount<'info>,
//     /// CHECK: This is the MPL Core program
//     #[account(address = MPL_CORE_PROGRAM_ID)]
//     pub mpl_core_program: UncheckedAccount<'info>,
//     pub system_program: Program<'info, System>,
//     pub program_state: Account<'info, ProgramState>,
//     /// CHECK: This account is not dangerous because we only read from it
//     #[account(address = InstructionsID)]
//     pub instruction_sysvar_account: AccountInfo<'info>,
// }
