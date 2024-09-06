import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  createNft,
} from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount } from "@metaplex-foundation/umi";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { keypairIdentity } from "@metaplex-foundation/umi";

async function createCollectionNFT() {
  // Use the RPC endpoint of your choice.
  const umi = createUmi("https://api.devnet.solana.com").use(
    mplTokenMetadata()
  );

  // Load your keypair
  const secretKey = new Uint8Array(/* Your secret key bytes */);
  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, keypair);

  // Use the keypair as the identity
  umi.use(keypairIdentity(signer));

  const collectionMint = generateSigner(umi);

  await createNft(umi, {
    mint: collectionMint,
    name: "Emblem Vaults Collection",
    uri: "https://example.com/emblem-vaults-collection.json",
    sellerFeeBasisPoints: percentAmount(0), // 0% royalties
    isCollection: true,
  }).sendAndConfirm(umi);

  console.log("Collection NFT created with address:", collectionMint.publicKey);
  return collectionMint.publicKey;
}

createCollectionNFT();
