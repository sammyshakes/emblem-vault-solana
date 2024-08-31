# Solana Emblem Vault: Project Checklist

## Solana Program

- [x] Basic program structure
- [x] State management (EmblemVaultState, ClaimRecord, BurnRecord)
- [x] Instruction definition
- [x] Signature verification implementation
- [ ] Complete `initialize` function
- [ ] Complete `claim` function
- [ ] Complete `burn` function
- [ ] Implement `update_signer_public_key` function
- [x] Add metadata support
- [ ] Comprehensive error handling

## Testing

- [x] Basic test structure
- [x] Signature verification test
- [x] Add test for `claim` function
- [x] Complete test for `burn` function
- [x] Add test for `update_signer_public_key` function
- [x] Add tests for error cases and edge scenarios

## API/SDK Layer

- [ ] Create TypeScript SDK structure
- [ ] Implement connection to Solana program
- [ ] Add function to generate keypair (interfacing with backend)
- [ ] Add function to claim tokens
- [ ] Add function to burn tokens
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
✔ Mints an NFT (408ms)
✔ Burns an NFT (411ms)

2 passing (2s)
```

---
