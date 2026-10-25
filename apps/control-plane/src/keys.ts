import { generateSigningKeyPair, type SigningKeyPair } from "@invariance/schema/signing";

/**
 * v1 key management: one platform keypair, from env (PEM) or freshly
 * generated per process in dev. Per-app keys and rotation come with real
 * deployment.
 */
export function loadKeys(): SigningKeyPair {
  const privateKeyPem = process.env.INVARIANCE_SIGNING_PRIVATE_KEY;
  const publicKeyPem = process.env.INVARIANCE_SIGNING_PUBLIC_KEY;
  const keyId = process.env.INVARIANCE_SIGNING_KEY_ID;
  if (privateKeyPem && publicKeyPem && keyId) {
    return { privateKeyPem, publicKeyPem, keyId };
  }
  return generateSigningKeyPair();
}
