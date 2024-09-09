# Solana Emblem Vault: Project Checklist

## Solana Program

- [x] Basic program structure
- [x] State management (Vault)
- [x] Instruction definition
- [x] Signature verification implementation
- [x] Complete `mint_vault` function
- [x] Complete `claim_vault` function
- [x] Implement `update_signer_public_key` function
- [x] Add metadata support
- [x] Comprehensive error handling
- [x] Set and update base URI
- [x] Add deploy script
- [x] Add mint vault script

## Testing

- [x] Basic test structure
- [x] Signature verification test
- [x] Add test for `mint_vault` function
- [x] Add test for `claim_vault` function
- [x] Add tests for error cases and edge scenarios
- [x] Add invalid signature test and missing signature verification
- [x] Add test for base URI update
- [x] Add test for unauthorized base URI update
- [x] Add test for `update_signer_public_key` function
- [x] Add test for unauthorized signer update

## API/SDK Layer

- [ ] Create TypeScript SDK structure
- [ ] Implement connection to Solana program
- [ ] Add function to generate keypair (interfacing with backend)
- [ ] Add function to mint vault NFTs
- [ ] Add function to claim vault NFTs
- [ ] Implement signature request and verification process
- [ ] Add utility functions (e.g., fetching vault state)

## Backend Service

- [ ] Set up Node.js/Express server
- [ ] Implement secure key storage system
- [ ] Create endpoint for keypair generation
- [ ] Create endpoint for signature generation
- [ ] Implement API key authentication
- [ ] Set up encryption for stored keys
- [ ] Add endpoint for public key retrieval
- [ ] Implement proper error handling and logging

## Documentation

- [ ] Write API documentation for SDK
- [ ] Document Solana program instructions and accounts
- [ ] Write deployment guide for Solana program
- [ ] Create setup instructions for backend service

## Deployment and Scripts

- [ ] Deploy Solana program to devnet
- [x] Add deploy script
- [x] Add mint vault script

---

### Current Test Results

```bash
✔ Initializes program state (416ms)
✔ Fails to mint a vault NFT without signature verification
✔ Fails to mint a vault NFT with a valid signature but unauthorized signer
✔ Fails to mint a vault NFT with an invalid signature
✔ Mints a vault NFT (331ms)
✔ Claims a vault NFT (408ms)
✔ Queries vault information
✔ Updates base URI by authority (397ms)
✔ Fails to update base URI by unauthorized account
✔ Updates the signer public key and verifies the change (1637ms)
✔ Fails to update signer public key by unauthorized account
✔ Successfully updates signer public key by the authorized authority (388ms)

12 passing (5s)
```

---
