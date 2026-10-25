import { z } from "zod";

/**
 * Browser-safe envelope contract. Signing/verifying with node:crypto lives in
 * ./signing (node-only subpath export); browser runtimes verify via WebCrypto.
 */
export const SignedEnvelopeSchema = z.object({
  alg: z.literal("ed25519"),
  keyId: z.string().min(1),
  /** Canonical JSON of the ModBundle. */
  payload: z.string().min(1),
  /** sha256 hex of payload; doubles as the content address for CDN paths. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** base64 ed25519 signature over payload. */
  signature: z.string().min(1),
});
export type SignedEnvelope = z.infer<typeof SignedEnvelopeSchema>;
