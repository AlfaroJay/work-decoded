import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed, expiring links for the consultant-facing pages.
 *
 * Token format:  <recordId>.<expiresUnixSeconds>.<sig>
 *   sig = first 32 hex chars of HMAC-SHA256(`${recordId}.${expires}`, LINK_SIGNING_SECRET)
 *
 * Tokens are minted by the Zaps (Code by Zapier step using the same algorithm
 * and secret) whenever an email needs a link to the intake brief or feedback
 * form, and verified here before any client PII is returned. A bare Airtable
 * record ID is never accepted.
 *
 * The matching generator used in Zapier Code steps:
 *
 *   const crypto = require('crypto');
 *   const exp = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60; // 60 days
 *   const payload = `${inputData.recordId}.${exp}`;
 *   const sig = crypto.createHmac('sha256', inputData.secret)
 *     .update(payload).digest('hex').slice(0, 32);
 *   output = [{ token: `${payload}.${sig}` }];
 */

const TOKEN_RE = /^(rec[A-Za-z0-9]{14})\.(\d{10})\.([0-9a-f]{32})$/;

export const DEFAULT_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

export function signSessionToken(
  recordId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string | null {
  const secret = process.env.LINK_SIGNING_SECRET;
  if (!secret || !/^rec[A-Za-z0-9]{14}$/.test(recordId)) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${recordId}.${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return `${payload}.${sig}`;
}

/**
 * Returns the Airtable record ID if the token is well-formed, unexpired, and
 * correctly signed; otherwise null. Never throws.
 */
export function verifySessionToken(token: string | null): string | null {
  const secret = process.env.LINK_SIGNING_SECRET;
  if (!secret || !token) return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const [, recordId, expStr, sig] = m;
  if (parseInt(expStr, 10) < Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac('sha256', secret)
    .update(`${recordId}.${expStr}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return recordId;
}
