import type { InvarianceClientConfig } from "./types";

export interface TelemetryEvent {
  type:
    | "mods_applied"
    | "mods_degraded"
    | "prompt_submitted"
    | "mod_authored"
    | "mod_rejected"
    | "refix_requested";
  subjectId: string;
  modId?: string;
  detail?: Record<string, string | number>;
}

/**
 * Fire-and-forget event emitter, always off the request path. Failures are
 * swallowed: telemetry must never affect the host app.
 */
export function createTelemetry(config: InvarianceClientConfig) {
  const endpoint = `${config.registryUrl.replace(/\/$/, "")}/v1/apps/${config.appId}/events`;
  return {
    emit(event: Omit<TelemetryEvent, "subjectId">): void {
      if (config.telemetry === false) return;
      const body = JSON.stringify({ ...event, subjectId: config.subjectId, at: Date.now() });
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, body);
          return;
        }
        void fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // Never let telemetry surface to the host app.
      }
    },
  };
}
