export const MAX_BODY_BYTES = 9 * 1024 * 1024;

/** Validates names only in errors: never echo a connection string or secret. */
export function validateCloudRuntime(env) {
  const required = ['DATABASE_URL', 'SESSION_SECRET', 'PILOT_ACCESS_KEY', 'APP_URL',
    'ENCRYPTION_KEY', 'STORAGE_ENDPOINT', 'STORAGE_REGION', 'STORAGE_BUCKET',
    'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'TRANSLOADIT_KEY', 'TRANSLOADIT_SECRET',
    'RESEND_API_KEY', 'AUTH_MAIL_FROM'];
  const errors = required.filter(key => !env[key]?.trim()).map(key => `${key} is required`);
  for (const [key, value] of Object.entries({ CLOUD_PILOT: 'on', PILOT_MODE: 'on', STORAGE_DRIVER: 's3', SCAN_DRIVER: 'transloadit', AUTH_MAIL_MODE: 'resend', NODE_ENV: 'production' })) {
    if (env[key] !== value) errors.push(`${key} must be ${value}`);
  }
  if ((env.SESSION_SECRET?.length ?? 0) < 32 || (env.PILOT_ACCESS_KEY?.length ?? 0) < 32) errors.push('Session and pilot secrets must have at least 32 characters');
  if (Buffer.from(env.ENCRYPTION_KEY ?? '', 'base64').length !== 32) errors.push('ENCRYPTION_KEY must encode 32 bytes');
  if (!['sha256', 'sha384'].includes(env.TRANSLOADIT_SIGNATURE_ALGORITHM ?? 'sha384')) errors.push('Unsupported Transloadit signature algorithm');
  if (env.AUTH_ALLOW_UNVERIFIED_LOCAL) errors.push('Remove AUTH_ALLOW_UNVERIFIED_LOCAL');
  if (/[\r\n]/.test(env.AUTH_MAIL_FROM ?? '')) errors.push('Invalid AUTH_MAIL_FROM');
  try {
    const url = new URL(env.APP_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') throw new Error();
  } catch { errors.push('APP_URL must be a public HTTPS origin'); }
  try {
    const url = new URL(env.STORAGE_ENDPOINT);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+(?:\.storage)?\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, '') !== '/storage/v1/s3') throw new Error();
  } catch { errors.push('STORAGE_ENDPOINT must be the private Supabase S3 endpoint'); }
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.hostname.includes('-pooler.') || url.searchParams.get('sslmode') !== 'require') throw new Error();
  } catch { errors.push('DATABASE_URL must be the isolated Neon pilot pooled URL with sslmode=require'); }
  return errors;
}

/** Run BEFORE Next/React's form parser allocates buffers. Never queue bodies. */
export function cloudRequestPolicy(method, rawUrl, headers) {
  let pathname;
  try { pathname = new URL(rawUrl, 'http://localhost').pathname; } catch { return { status: 400 }; }
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (!['GET', 'HEAD', 'OPTIONS', 'POST'].includes(method)) return { status: 405 };
  const length = headers['content-length'];
  if (headers['transfer-encoding']) return { status: 411 };
  if (mutation && length === undefined) return { status: 411 };
  if (length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) return { status: 400 };
  const bytes = Number(length ?? 0);
  if (!mutation && bytes > 0) return { status: 400 };
  if (bytes > (pathname === '/pilot-access' ? 4096 : MAX_BODY_BYTES)) return { status: 413 };
  return { status: 200, exclusive: mutation || /\/promotion\/download\/?$/.test(pathname) };
}

export function createWorkSlot() {
  let busy = false;
  return { take() {
    if (busy) return null;
    busy = true;
    let released = false;
    return () => { if (!released) { released = true; busy = false; } };
  } };
}
