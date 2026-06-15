import type { NextFunction, Request, RequestHandler, Response } from "express";
import { InvarianceRuntime, type InvarianceServerConfig } from "./runtime";

export interface InvarianceMiddlewareConfig extends InvarianceServerConfig {
  /** How to identify the end user; defaults to the x-invariance-subject header. */
  getSubject?: (req: Request) => string | undefined;
}

function defaultGetSubject(req: Request): string | undefined {
  const header = req.header("x-invariance-subject");
  return header ? String(header) : undefined;
}

/**
 * Express adapter for the Tier-1 runtime. Mount it ahead of the API routes
 * (after body parsing). For each request matching a manifest endpoint it runs
 * the subject's request hooks over `req.body` and patches `res.json` to run
 * response hooks before sending. Only success (<400) JSON responses are
 * transformed. Everything fails open: no subject, no bundle, or any
 * runtime/verification failure means the host app behaves exactly as if the
 * middleware were absent.
 */
export function createInvarianceMiddleware(config: InvarianceMiddlewareConfig): RequestHandler {
  const runtime = new InvarianceRuntime(config);
  const getSubject = config.getSubject ?? defaultGetSubject;

  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const subjectId = getSubject(req);
        if (!subjectId) return next();
        const manifest = await runtime.getManifest();
        if (!manifest) return next();
        const endpoint = runtime.matchEndpoint(manifest, req.method, req.path);
        if (!endpoint) return next();

        const originalJson = res.json.bind(res);
        res.json = (body: unknown): Response => {
          if (res.statusCode >= 400) return originalJson(body);
          // Restore immediately: hooks transform the endpoint's own payload
          // exactly once, not error handlers that may run later.
          res.json = originalJson;
          void runtime
            .transform(subjectId, endpoint, "response", body)
            .then((transformed) => originalJson(transformed))
            .catch(() => originalJson(body));
          return res;
        };

        if (req.body !== undefined) {
          req.body = await runtime.transform(subjectId, endpoint, "request", req.body);
        }
        next();
      } catch {
        next();
      }
    })();
  };
}
