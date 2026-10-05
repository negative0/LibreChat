/**
 * Cloudflare managed challenges on API requests.
 *
 * A Cloudflare zone can answer any request with a managed challenge: a 403 HTML page carrying a
 * `cf-mitigated: challenge` header. A browser solves one on a page load, but an XHR or fetch
 * cannot, so the request simply fails. File uploads are the usual casualty, since their bodies
 * are what WAF rules tend to flag.
 *
 * With `turnstile.managedChallenge` enabled, the client registers a solver that shows a Turnstile
 * widget. A widget with pre-clearance sets the `cf_clearance` cookie when solved, which is what
 * lets the retried request past the challenge; the token also goes along in a header so an origin
 * can verify it if it wants to. Each request is retried at most once.
 */

export const CLOUDFLARE_CHALLENGE_TOKEN_HEADER = 'cf-turnstile-response';

/** Resolves with a Turnstile token once the challenge is solved, or rejects if it is abandoned. */
export type CloudflareChallengeSolver = () => Promise<string>;

let solver: CloudflareChallengeSolver | null = null;
let pending: Promise<string | null> | null = null;

/** Registers the solver; `null` turns challenge handling off. */
export function setCloudflareChallengeSolver(next: CloudflareChallengeSolver | null): void {
  solver = next;
}

export function isCloudflareChallenge(status: number, mitigated: unknown): boolean {
  return status === 403 && typeof mitigated === 'string' && mitigated.toLowerCase() === 'challenge';
}

/**
 * Asks the registered solver for a token. Requests challenged while it is open share the one
 * prompt. Resolves `null` with no solver registered or when the challenge was abandoned.
 */
export function solveCloudflareChallenge(): Promise<string | null> {
  if (!solver) {
    return Promise.resolve(null);
  }
  if (!pending) {
    pending = solver()
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
