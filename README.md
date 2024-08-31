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

## Running Tests

To run the tests for the Solana Emblem Vault program, follow these steps:

### 1. Install Dependencies

Ensure that you have all the necessary dependencies installed. You can do this by running:

```bash
yarn install
```

### 2. Set Up the Solana Localnet

The tests are designed to run on a local Solana network. You need to start a local validator and clone the necessary programs (like the Metaplex Token Metadata program) from the mainnet.

### 3. Start the Local Validator with Cloning

Make sure your `Anchor.toml` is configured to clone the Metaplex Token Metadata program to your local validator:

```toml
[test.validator]
url = "https://api.mainnet-beta.solana.com"  # Clone from mainnet

[[test.validator.clone]]
address = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"  # Metaplex Token Metadata program
```

### 4. Run the Tests

You can run the tests using the following command:

```bash
yarn test
```

This will execute all the tests defined in the `tests` directory, including the minting and burning of NFTs.

### 5. Review Test Results

After running the tests, review the output in your terminal. You should see results like:

```bash
✔ Mints an NFT (408ms)
✔ Burns an NFT (411ms)

2 passing (2s)
```

This confirms that the tests for minting and burning NFTs have passed successfully.

### 6. Troubleshooting

If you encounter any errors during testing, check the logs provided by the test runner. Common issues include:

- **Program not deployed:** Ensure that the required programs are correctly cloned to your local validator.
- **State persistence:** If tests depend on state from previous tests, ensure the state is correctly managed or reset between tests.

### 7. Additional Considerations

- **Test Isolation:** If you want to isolate state between tests, consider using the `beforeEach` and `afterEach` hooks to reset state or reinitialize accounts as needed.
- **Logging:** Use `console.log` statements within your tests to debug and monitor specific values, such as transaction signatures, balances, and account states.

---
