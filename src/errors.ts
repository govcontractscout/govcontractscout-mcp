/**
 * Upstream API error → the one string the agent sees.
 *
 * The API's quota errors carry the conversion path inside the same `error`
 * object as the message: `upgrade_url` on every limit error, and `packs`
 * (overflow credits) once a paid key is past its cap. The agent is the only
 * surface the user has, so dropping them showed "Upgrade your plan for more
 * requests" with no way to do it — the link existed and never left the server.
 *
 * Order matters: the message first (that is what the API's docs quote), then
 * the link, then the packs.
 */

type ErrorBody = {
  message?: unknown;
  upgrade_url?: unknown;
  packs?: unknown;
};

function packsLine(packs: unknown): string {
  if (!Array.isArray(packs)) return "";
  return packs
    .filter((p): p is { credits?: unknown; price?: unknown } => !!p && typeof p === "object")
    .map((p) => `${p.credits} credits for $${p.price}`)
    .join(", ");
}

export function apiErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { error?: unknown };
    if (b.error && typeof b.error === "object") {
      const e = b.error as ErrorBody;
      if (typeof e.message === "string") {
        const parts = [e.message];
        if (typeof e.upgrade_url === "string" && e.upgrade_url) {
          parts.push(`Upgrade: ${e.upgrade_url}`);
        }
        const packs = packsLine(e.packs);
        if (packs) parts.push(`Or buy overflow credits: ${packs}`);
        return parts.join(" ");
      }
    }
    if (typeof b.error === "string") return b.error;
  }
  return `API error (HTTP ${status})`;
}
