import type { InvarianceClientConfig } from "./types";

export interface AuthoringResult {
  ok: boolean;
  modId?: string;
  /** Human-readable rejection reasons when verification failed. */
  reasons?: string[];
}

/** Submit a natural-language customization prompt to the control plane. */
export async function submitPrompt(
  config: InvarianceClientConfig,
  prompt: string,
): Promise<AuthoringResult> {
  const res = await fetch(
    `${config.registryUrl.replace(/\/$/, "")}/v1/apps/${config.appId}/subjects/${encodeURIComponent(config.subjectId)}/prompts`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
  if (res.status === 422) {
    const body = (await res.json()) as { reasons?: string[] };
    return { ok: false, reasons: body.reasons ?? ["rejected by verification"] };
  }
  if (!res.ok) {
    return { ok: false, reasons: [`authoring failed (${res.status})`] };
  }
  const body = (await res.json()) as { modId: string };
  return { ok: true, modId: body.modId };
}

/** Ask the control plane to repair a degraded modset with AI. */
export async function requestRefix(config: InvarianceClientConfig): Promise<AuthoringResult> {
  const res = await fetch(
    `${config.registryUrl.replace(/\/$/, "")}/v1/apps/${config.appId}/subjects/${encodeURIComponent(config.subjectId)}/refix`,
    { method: "POST" },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reasons?: string[] };
    return { ok: false, reasons: body.reasons ?? [`refix failed (${res.status})`] };
  }
  const body = (await res.json()) as { modId: string };
  return { ok: true, modId: body.modId };
}
