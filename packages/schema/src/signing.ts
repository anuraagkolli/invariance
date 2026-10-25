import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { canonicalJson } from "./canonical-json";
import { SignedEnvelopeSchema, type SignedEnvelope } from "./envelope";
import { ModBundleSchema, type ModBundle } from "./mod";

export { SignedEnvelopeSchema, type SignedEnvelope } from "./envelope";

export class BundleVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleVerificationError";
  }
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export interface SigningKeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  keyId: string;
}

export function generateSigningKeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" });
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    keyId: createHash("sha256").update(der).digest("hex").slice(0, 16),
  };
}

/** Validates, canonicalizes, and signs a bundle. Control-plane only. */
export function signBundle(
  bundle: ModBundle,
  privateKeyPem: string,
  keyId: string,
): SignedEnvelope {
  const validated = ModBundleSchema.parse(bundle);
  const payload = canonicalJson(validated);
  const signature = cryptoSign(
    null,
    Buffer.from(payload, "utf8"),
    createPrivateKey(privateKeyPem),
  ).toString("base64");
  return {
    alg: "ed25519",
    keyId,
    payload,
    contentHash: sha256Hex(payload),
    signature,
  };
}

/**
 * Verifies hash + signature, then re-validates the payload schema. Runtimes
 * call this before executing anything; any failure means fall back to base
 * behavior, never partial application.
 */
export function verifyBundle(envelope: unknown, publicKeyPem: string): ModBundle {
  const env = SignedEnvelopeSchema.parse(envelope);
  if (sha256Hex(env.payload) !== env.contentHash) {
    throw new BundleVerificationError("content hash mismatch");
  }
  const ok = cryptoVerify(
    null,
    Buffer.from(env.payload, "utf8"),
    createPublicKey(publicKeyPem),
    Buffer.from(env.signature, "base64"),
  );
  if (!ok) {
    throw new BundleVerificationError("signature verification failed");
  }
  return ModBundleSchema.parse(JSON.parse(env.payload));
}
