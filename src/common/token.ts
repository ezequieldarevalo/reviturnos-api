import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'change-me';

export function signLinkToken(
  payload: Record<string, any>,
  ttlMinutes = 30,
): string {
  const exp = Date.now() + ttlMinutes * 60_000;
  const data = { ...payload, exp };
  const json = JSON.stringify(data);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(b64)
    .digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyLinkToken(
  token: string,
): { ok: true; data: any } | { ok: false; reason: string } {
  if (!token || !token.includes('.')) return { ok: false, reason: 'MALFORMED' };
  const [b64, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(b64)
    .digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return { ok: false, reason: 'BAD_SIG' };
  const data = JSON.parse(Buffer.from(b64, 'base64url').toString());
  if (Date.now() > Number(data.exp)) return { ok: false, reason: 'EXPIRED' };
  return { ok: true, data };
}
