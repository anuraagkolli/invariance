// The pure session turn-machine moved to @invariance/theming (beside merge/diff). Re-exported here so
// existing control-plane imports + tests are unchanged. resetToPublished/resetToAppDefault STAY — they
// depend on AuditStore (a control-plane storage interface), so they are not plane-agnostic.
import {
  acknowledge,
  APP_DEFAULT_SPEC,
  canonicalize,
  runTurn,
  type Session,
  type TurnResult,
} from "@invariance/theming";
import type { AuditStore } from "../publish/stores.js";

export { runTurn, acknowledge, APP_DEFAULT_SPEC };
export type { Session, TurnResult };

// Reset (§4.4): draft ← loadPublishedSpec(published) OR draft ← appDefault when nothing published.
export async function resetToPublished(session: Session, audit: AuditStore): Promise<Session> {
  if (session.published === null) {
    return resetToAppDefault(session);
  }
  const record = await audit.getPublishedSpec(session.tenant, session.published);
  const draft = record ? canonicalize(record.styleSpec) : APP_DEFAULT_SPEC;
  return { tenant: session.tenant, draft, candidate: undefined, pendingSpec: undefined, published: session.published };
}

export function resetToAppDefault(session: Session): Session {
  return { tenant: session.tenant, draft: APP_DEFAULT_SPEC, candidate: undefined, pendingSpec: undefined, published: session.published };
}
