import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface PreparedRepo {
  /** Absolute path to scan. */
  root: string;
  source: "url" | "path";
  /** The URL or path the developer gave. */
  ref: string;
  /** Remove a cloned temp dir; no-op for local paths. */
  cleanup: () => Promise<void>;
}

export interface PrepareInput {
  /** A git URL to shallow-clone, e.g. https://github.com/acme/app. */
  repoUrl?: string;
  /** A local path (absolute, or relative to the monorepo root) to scan. */
  path?: string;
}

const GIT_URL = /^(https?:\/\/|git@)[\w.@:/~-]+?(\.git)?$/;

/**
 * Resolve the developer's repo input to a local directory to scan. A URL is
 * shallow-cloned into a temp dir (caller must `cleanup`); a path is resolved
 * (relative paths resolve against the monorepo root so "apps/nebula" works in
 * the local demo). Throws on anything that isn't a readable directory.
 */
export async function prepareRepo(
  input: PrepareInput,
  monorepoRoot: string,
): Promise<PreparedRepo> {
  if (input.repoUrl) {
    if (!GIT_URL.test(input.repoUrl)) {
      throw new Error(`not a git URL: ${input.repoUrl}`);
    }
    const dir = await mkdtemp(join(tmpdir(), "inv-onboard-"));
    try {
      await exec("git", ["clone", "--depth", "1", input.repoUrl, dir], {
        timeout: 120_000,
      });
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw new Error(
        `git clone failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {
      root: dir,
      source: "url",
      ref: input.repoUrl,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }

  if (input.path) {
    const root = resolve(monorepoRoot, input.path);
    if (!existsSync(root)) throw new Error(`path not found: ${root}`);
    return {
      root,
      source: "path",
      ref: input.path,
      cleanup: async () => {},
    };
  }

  throw new Error("provide either repoUrl or path");
}
