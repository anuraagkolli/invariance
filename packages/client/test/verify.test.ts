import { describe, expect, it } from "vitest";
import { ModBundleSchema } from "@invariance/schema";
import { generateSigningKeyPair, signBundle } from "@invariance/schema/signing";
import { ClientVerificationError, importVerifyKey, verifyEnvelope } from "../src/core/verify";

const keys = generateSigningKeyPair();
const bundle = ModBundleSchema.parse({
  id: "mod_wc",
  appId: "demo",
  subjectId: "u1",
  revision: 0,
  binding: { appManifestVersion: "1.0.0" },
  uiOps: [{ type: "token-override", token: "--inv-accent", value: "#123456" }],
  hooks: [],
  createdAt: "2026-06-10T00:00:00.000Z",
});

describe("verifyEnvelope (WebCrypto)", () => {
  it("verifies an envelope signed by the node signing module", async () => {
    const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);
    const key = await importVerifyKey(keys.publicKeyPem);
    const verified = await verifyEnvelope(envelope, key);
    expect(verified).toEqual(bundle);
  });

  it("rejects tampered payloads", async () => {
    const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);
    const key = await importVerifyKey(keys.publicKeyPem);
    await expect(
      verifyEnvelope({ ...envelope, payload: envelope.payload.replace("#123456", "#bad") }, key),
    ).rejects.toThrow(ClientVerificationError);
  });

  it("rejects signatures from a different key", async () => {
    const otherKeys = generateSigningKeyPair();
    const envelope = signBundle(bundle, otherKeys.privateKeyPem, otherKeys.keyId);
    const key = await importVerifyKey(keys.publicKeyPem);
    await expect(verifyEnvelope(envelope, key)).rejects.toThrow("signature verification failed");
  });
});
