import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical-json";
import {
  BundleVerificationError,
  generateSigningKeyPair,
  signBundle,
  verifyBundle,
} from "../src/signing";
import { ModBundleSchema } from "../src/mod";
import { baseBundle } from "./mod.test";

const keys = generateSigningKeyPair();
const bundle = ModBundleSchema.parse(baseBundle());

describe("canonicalJson", () => {
  it("is stable across object key order", () => {
    const a = { b: 1, a: { d: [1, 2], c: "x" } };
    const b = { a: { c: "x", d: [1, 2] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("drops undefined object values and nullifies undefined array entries", () => {
    expect(canonicalJson({ a: undefined, b: [undefined] })).toBe('{"b":[null]}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ a: Infinity })).toThrow(TypeError);
  });
});

describe("signBundle / verifyBundle", () => {
  it("round-trips a bundle", () => {
    const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);
    const verified = verifyBundle(envelope, keys.publicKeyPem);
    expect(verified).toEqual(bundle);
    expect(envelope.keyId).toBe(keys.keyId);
  });

  it("produces identical envelopes for structurally equal bundles", () => {
    const reordered = Object.fromEntries(Object.entries(bundle).reverse()) as typeof bundle;
    const a = signBundle(bundle, keys.privateKeyPem, keys.keyId);
    const b = signBundle(reordered, keys.privateKeyPem, keys.keyId);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("detects payload tampering via content hash", () => {
    const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);
    const tampered = { ...envelope, payload: envelope.payload.replace("#1b2a4a", "#000000") };
    expect(() => verifyBundle(tampered, keys.publicKeyPem)).toThrow(BundleVerificationError);
    expect(() => verifyBundle(tampered, keys.publicKeyPem)).toThrow("content hash mismatch");
  });

  it("detects tampering even when the content hash is recomputed", () => {
    const envelope = signBundle(bundle, keys.privateKeyPem, keys.keyId);
    const payload = envelope.payload.replace("#1b2a4a", "#000000");
    const tampered = {
      ...envelope,
      payload,
      contentHash: createHash("sha256").update(payload, "utf8").digest("hex"),
    };
    expect(() => verifyBundle(tampered, keys.publicKeyPem)).toThrow(
      "signature verification failed",
    );
  });

  it("rejects a signature from a different key", () => {
    const otherKeys = generateSigningKeyPair();
    const envelope = signBundle(bundle, otherKeys.privateKeyPem, otherKeys.keyId);
    expect(() => verifyBundle(envelope, keys.publicKeyPem)).toThrow(
      "signature verification failed",
    );
  });

  it("refuses to sign an invalid bundle", () => {
    const invalid = { ...bundle, revision: -1 };
    expect(() => signBundle(invalid, keys.privateKeyPem, keys.keyId)).toThrow();
  });
});
