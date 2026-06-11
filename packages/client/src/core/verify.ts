import {
  ModBundleSchema,
  SignedEnvelopeSchema,
  type ModBundle,
} from "@invariance/schema";

export class ClientVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientVerificationError";
  }
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function importVerifyKey(publicKeyPem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToDer(publicKeyPem).buffer as ArrayBuffer,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}

/**
 * Browser-side mirror of @invariance/schema/signing verifyBundle: hash check,
 * Ed25519 signature check via WebCrypto, then schema re-validation. Any
 * failure throws — callers must fall back to base behavior, never partially
 * apply.
 */
export async function verifyEnvelope(
  envelope: unknown,
  publicKey: CryptoKey,
): Promise<ModBundle> {
  const env = SignedEnvelopeSchema.parse(envelope);
  if ((await sha256Hex(env.payload)) !== env.contentHash) {
    throw new ClientVerificationError("content hash mismatch");
  }
  const ok = await crypto.subtle.verify(
    "Ed25519",
    publicKey,
    base64ToBytes(env.signature).buffer as ArrayBuffer,
    new TextEncoder().encode(env.payload),
  );
  if (!ok) {
    throw new ClientVerificationError("signature verification failed");
  }
  return ModBundleSchema.parse(JSON.parse(env.payload));
}
