# Solana Emblem Vault: Project Checklist

## Solana Program

- [x] Basic program structure
- [x] State management (Vault)
- [x] Instruction definition
- [x] Signature verification implementation
- [x] Complete `mint_vault` function
- [x] Complete `claim_vault` function
- [ ] Implement `update_signer_public_key` function
- [x] Add metadata support
- [x] Comprehensive error handling

## Testing

- [x] Basic test structure
- [x] Signature verification test
- [x] Add test for `mint_vault` function
- [x] Add test for `claim_vault` function
- [x] Add tests for error cases and edge scenarios, including invalid signature test and missing signature verification

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

## Deployment

- [ ] Deploy Solana program to devnet
- [ ] Set up secure hosting for backend service

---

### Current Test Results

```bash
✔ Fails to mint a vault NFT without signature verification (55ms)
✔ Fails to mint a vault NFT with an invalid signature (63ms)
✔ Mints a vault NFT (302ms)
✔ Claims a vault NFT (413ms)
✔ Queries vault information (39ms)

5 passing (2s)
```

---
