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
        PermanentFreezeDelegate,
    }, 
    instructions::{CreateV2CpiBuilder, CreateCollectionV2CpiBuilder, BurnV1CpiBuilder}, 
};

declare_id!("AmCkuQ9euwgmoYyW2wRRmqz2XxspvBYtWeJYz91WoAQ6");

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
        let collection_seeds = &[
            b"collection",
            collection_type.as_bytes(),
            b"2",
            &[collection_bump],
        ];
    
        let (authority_pda, authority_bump) = Pubkey::find_program_address(
            &[b"authority"],
            ctx.program_id,
        );
    
        let name = format!("Emblem {} Vaults", collection_type);
    
        CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .collection(&ctx.accounts.collection.to_account_info())
            .update_authority(Some(&ctx.accounts.authority_pda.to_account_info()))
            .payer(&ctx.accounts.payer.to_account_info())
            .system_program(&ctx.accounts.system_program.to_account_info())
            .name(name)
            .uri("https://gray-experienced-mockingbird-652.mypinata.cloud/ipfs/QmdMeZyHGkmnBHbLrXKRzibCqFDTvgTXGNrBnY2opup1Go".to_string())
            .plugins(vec![
                PluginAuthorityPair {
                    plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: false }),
                    authority: Some(PluginAuthority::Address { address: authority_pda }),
                },
                PluginAuthorityPair {
                    plugin: Plugin::PermanentBurnDelegate(PermanentBurnDelegate {}),
                    authority: Some(PluginAuthority::Address { address: authority_pda }),
                },
            ])
            .invoke_signed(&[collection_seeds])?;
    
        Ok(())
    }
    

    pub fn mint_vault(ctx: Context<MintVault>, external_token_id: String, price: u64, timestamp: i64) -> Result<()> {
        // Verify the signature verification instruction was called
        let previous_ix = load_instruction_at_checked(0, &ctx.accounts.instruction_sysvar_account.to_account_info())
            .map_err(|e| {
                msg!("Error loading previous instruction: {:?}", e);
                e
            })?;

        // Extract the public key from the previous instruction
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

        let asset_bump = ctx.bumps.asset;
        let collection_key = ctx.accounts.collection.key();
        let asset_seeds = &[b"vault", collection_key.as_ref(), external_token_id.as_bytes(), &[asset_bump]];

        let (authority_pda, authority_bump) = Pubkey::find_program_address(
            &[b"authority"],
            ctx.program_id,
        );
    
        let authority_seeds: &[&[u8]] = &[
            b"authority", 
            &[authority_bump],      // &[u8; 1], which is &[u8]
        ];
        let signer_seeds = &[authority_seeds];

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
        .authority(Some(&ctx.accounts.authority_pda.to_account_info()))
        .plugins(asset_attributes)
        .payer(&ctx.accounts.payer.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri("https://gray-experienced-mockingbird-652.mypinata.cloud/ipfs/QmXnixGRdM2FEZ1ELL3ihLHRGTRuEpRDNRxtgoMMA3HLX1".to_string())
        .invoke_signed(&[asset_seeds, authority_seeds])?;

        Ok(())
    }

    pub fn claim_vault(
        ctx: Context<ClaimVault>,
        external_token_id: String,
        price: u64,
        timestamp: i64
    ) -> Result<()> {
        msg!("Claiming vault with external token ID: {}", external_token_id);
    
        // Verify the signature verification instruction was called
        let previous_ix = load_instruction_at_checked(0, &ctx.accounts.instruction_sysvar_account.to_account_info())
            .map_err(|e| {
                msg!("Error loading previous instruction: {:?}", e);
                e
            })?;
        
    
        // Check that the previous instruction is the Ed25519 program
        if previous_ix.program_id != ed25519_program::ID {
            msg!("Invalid previous instruction program ID");
            return Err(VaultError::InvalidSignature.into());
        }
    
        // Extract the public key from the previous instruction
        let ed25519_ix_data = previous_ix.data;
        let pubkey_bytes = &ed25519_ix_data[16..48];
        let verification_public_key = Pubkey::new_from_array(pubkey_bytes.try_into().unwrap());
    
        // Check if the verification public key matches the stored signer public key
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
    
        // // Check if the asset exists (not already claimed or burned)
        // if ctx.accounts.asset.to_account_info().lamports() == 0 {
        //     msg!("Asset not found or already claimed");
        //     return Err(VaultError::AlreadyClaimed.into());
        // }
    
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

        let collection_key = ctx.accounts.collection.key();

        let (authority_pda, bump) = Pubkey::find_program_address(&[b"authority"], ctx.program_id);
        let authority_seeds: &[&[u8]] = &[
            b"authority", // Coerced to &[u8]
            &[bump],      // &[u8; 1], which is &[u8]
        ];
        let signer_seeds = &[authority_seeds];

         // Burn the asset using the Metaplex Core CPI
        BurnV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .authority(Some(&ctx.accounts.authority_pda.to_account_info()))
        .payer(&ctx.accounts.claimer.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .invoke_signed(signer_seeds)?;

        msg!("Vault asset burned successfully");
        Ok(())
    }
    

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
                4 + 200 +   // base_uri (String)
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
    #[account(
        mut,
        seeds = [b"collection", collection_type.as_bytes(), b"2"],
        bump,
    )]
    /// CHECK: The collection account is initialized here
    pub collection: UncheckedAccount<'info>,
    #[account(
        seeds = [b"authority"],
        bump,
    )]
    /// CHECK: Program's authority PDA
    pub authority_pda: UncheckedAccount<'info>,
    /// CHECK: Verified by address constraint
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(external_token_id: String, price: u64, timestamp: i64)]
pub struct MintVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: This account is only used to receive fees
    #[account(mut)]
    pub fee_receiver: UncheckedAccount<'info>,
    /// CHECK: This doesn't need to be checked, initialized in the program
    #[account(
        mut,
        seeds = [
            b"vault", 
            collection.key().as_ref(), 
            external_token_id.as_bytes()
        ], 
        bump,
    )]
    pub asset: UncheckedAccount<'info>,  
    #[account(mut)]
    pub collection: Account<'info, BaseCollectionV1>,  // Link to the collection
    /// CHECK: Program's authority PDA
    #[account(
        seeds = [b"authority"],
        bump,
    )]
    pub authority_pda: UncheckedAccount<'info>,
    /// CHECK: This doesn't need to be checked, because there is the address constraint
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub program_state: Account<'info, ProgramState>,
    /// CHECK: This account is not dangerous because we only read from it
    #[account(address = InstructionsID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(external_token_id: String, price: u64, timestamp: i64)]
pub struct ClaimVault<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    /// CHECK: This account is only used to receive fees
    #[account(mut)]
    pub fee_receiver: UncheckedAccount<'info>,
    /// CHECK: Asset account to be burned
    #[account(
        mut,
        seeds = [b"vault", collection.key().as_ref(), external_token_id.as_bytes()],
        bump,
        owner = MPL_CORE_PROGRAM_ID,
    )]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: This is a foreign account owned by the Metaplex Core program
    #[account(mut, owner = MPL_CORE_PROGRAM_ID)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: Program's authority PDA
    #[account(
        seeds = [b"authority"],
        bump,
    )]
    pub authority_pda: UncheckedAccount<'info>,
    /// CHECK: This is the MPL Core program
    #[account(address = MPL_CORE_PROGRAM_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub program_state: Account<'info, ProgramState>,
    /// CHECK: This account is not dangerous because we only read from it
    #[account(address = InstructionsID)]
    pub instruction_sysvar_account: AccountInfo<'info>,
}
