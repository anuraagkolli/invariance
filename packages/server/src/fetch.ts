import { InvarianceRuntime, type InvarianceServerConfig } from "./runtime";

export type FetchHandler = (req: Request) => Promise<Response> | Response;

export interface InvarianceFetchConfig extends InvarianceServerConfig {
  /** How to identify the end user; defaults to the x-invariance-subject header. */
  getSubject?: (req: Request) => string | undefined;
}

/**
 * Fetch-style wrapper for Next.js route handlers (and any WinterCG runtime):
 * `export const GET = withInvariance(config, handler)`. JSON request bodies
 * are transformed by the subject's request hooks before the handler runs;
 * success JSON responses are transformed by response hooks before returning.
 * Any failure falls open to the unmodified handler behavior.
 */
export function withInvariance(config: InvarianceFetchConfig, handler: FetchHandler): FetchHandler {
  const runtime = new InvarianceRuntime(config);
  const getSubject =
    config.getSubject ?? ((req: Request) => req.headers.get("x-invariance-subject") ?? undefined);

  return async (req: Request): Promise<Response> => {
    let subjectId: string | undefined;
    let endpoint: ReturnType<InvarianceRuntime["matchEndpoint"]> = null;
    let request = req;
    try {
      subjectId = getSubject(req);
      if (subjectId) {
        const manifest = await runtime.getManifest();
        if (manifest) {
          endpoint = runtime.matchEndpoint(manifest, req.method, new URL(req.url).pathname);
        }
      }
      if (subjectId && endpoint && req.headers.get("content-type")?.includes("application/json")) {
        const body = await req.clone().json();
        const transformed = await runtime.transform(subjectId, endpoint, "request", body);
        request = new Request(req, { body: JSON.stringify(transformed) });
      }
    } catch {
      request = req;
    }

    const response = await handler(request);

    try {
      if (
        subjectId &&
        endpoint &&
        response.ok &&
        response.headers.get("content-type")?.includes("application/json")
      ) {
        const body = await response.clone().json();
        const transformed = await runtime.transform(subjectId, endpoint, "response", body);
        const headers = new Headers(response.headers);
        headers.delete("content-length"); // body size changed
        return new Response(JSON.stringify(transformed), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    } catch {
      // Fall through to the untouched response.
    }
    return response;
  };
}
