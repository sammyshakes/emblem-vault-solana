use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token};

declare_id!("DMLBNjTTdxA3Tnbx21ZsQU3hX1VUSW4SENPb3HCZrBCr");

#[program]
pub mod emblem_vault_solana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, name: String) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.is_initialized = true;
        vault.name = name;
        Ok(())
    }

    pub fn mint_token(ctx: Context<MintToken>, metadata_uri: String) -> Result<()> {
        let vault = &ctx.accounts.vault;
        require!(vault.is_initialized, VaultError::NotInitialized);

        // TODO: Implement signature verification here

        token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
            ),
            1,
        )?;

        emit!(TokenMinted {
            mint: *ctx.accounts.mint.key,
            metadata_uri,
        });

        Ok(())
    }

    pub fn burn_token(ctx: Context<BurnToken>, amount: u64) -> Result<()> {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
        )?;

        // TODO: Implement exit fee logic here

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 4 + name.len(),
        seeds = [b"vault", authority.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintToken<'info> {
    #[account(mut, has_one = authority @ VaultError::InvalidAuthority)]
    pub vault: Account<'info, Vault>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    pub mint_authority: Signer<'info>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BurnToken<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub is_initialized: bool,
    pub name: String,
}

#[event]
pub struct TokenMinted {
    pub mint: Pubkey,
    pub metadata_uri: String,
}

#[error_code]
pub enum VaultError {
    #[msg("The vault is not initialized")]
    NotInitialized,
    #[msg("Invalid authority for this operation")]
    InvalidAuthority,
}
