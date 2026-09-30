/** Temporary cloud-pilot diagnostics. No telemetry transmission, body reads or request changes. */
export const ACTION_DIAGNOSTIC_LIMIT = 12;
export const ACTION_DIAGNOSTIC_WINDOW_MS = 60000;

type FetchTarget = { fetch: typeof fetch };
const installed = new WeakSet<FetchTarget>();

function hasActionHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("Next-Action");
  if (Array.isArray(headers)) return headers.some(([name]) => name.toLowerCase() === "next-action");
  return Object.keys(headers).some(name => name.toLowerCase() === "next-action");
}

function isSameOriginAction(args: Parameters<typeof fetch>, origin: string): boolean {
  const [input, init] = args;
  const request = input instanceof Request ? input : undefined;
  if ((init?.method ?? request?.method ?? "GET").toUpperCase() !== "POST") return false;
  if (!hasActionHeader(init?.headers ?? request?.headers)) return false;
  const url = request ? request.url : String(input);
  return new URL(url, origin).origin === origin;
}

function readHeader(response: Response, name: string): string | null | undefined {
  try { return response.headers.get(name); } catch { return undefined; }
}

function contentCategory(response: Response): string {
  const value = readHeader(response, "content-type");
  if (value === undefined) return "unavailable";
  if (!value) return "missing";
  if (value.length > 256) return "other";
  const mime = value.split(";", 1)[0].trim().toLowerCase();
  return ["text/x-component", "text/html", "text/plain", "application/json", "application/octet-stream"].includes(mime) ? mime : "other";
}

function failureMetadata(response: Response, origin: string) {
  let redirected: boolean | null = null;
  let responseType = "unavailable";
  let finalSameOrigin: boolean | null = null;
  try { const value = response.redirected; if (typeof value === "boolean") redirected = value; } catch { /* Optional metadata only. */ }
  try {
    const value = response.type;
    responseType = ["basic", "cors", "default", "error", "opaque", "opaqueredirect"].includes(value) ? value : "other";
  } catch { /* Optional metadata only. */ }
  try {
    const value = response.url;
    if (value) {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol)) finalSameOrigin = url.origin === origin;
    }
  } catch { /* Do not serialize even an invalid URL or raw error. */ }
  // CF-Ray is a provider correlation ID, not proof that Cloudflare refused it.
  // Accept only its bounded documented ID/colo shape; never dump all headers.
  // https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-ray
  const ray = readHeader(response, "cf-ray");
  const cfRay = typeof ray === "string" && ray.length === 20 && /^[a-f0-9]{16}-[a-z]{3}$/i.test(ray) ? ray : null;
  return { redirected, responseType, finalSameOrigin, cfRay };
}

export function installCloudActionDiagnostics(target: FetchTarget, {
  enabled, origin, writeLine = (line: string) => console.warn(line), now = () => performance.now(),
}: { enabled: boolean; origin: string; writeLine?: (line: string) => void; now?: () => number }): void {
  if (!enabled || installed.has(target)) return;
  const original = target.fetch;
  let windowStart = now(); let emitted = 0;
  const report = (response?: Response) => {
    try {
      const time = now();
      if (time - windowStart >= ACTION_DIAGNOSTIC_WINDOW_MS) { windowStart = time; emitted = 0; }
      if (emitted > ACTION_DIAGNOSTIC_LIMIT) return;
      if (emitted++ === ACTION_DIAGNOSTIC_LIMIT) {
        writeLine(JSON.stringify({ event: "cloud-action-diagnostics-limited", maxEvents: ACTION_DIAGNOSTIC_LIMIT, windowMs: ACTION_DIAGNOSTIC_WINDOW_MS }));
        return;
      }
      writeLine(JSON.stringify({ event: response ? "cloud-action-response" : "cloud-action-fetch-rejected",
        status: response?.status ?? 0, contentType: response ? contentCategory(response) : "unavailable",
        ...(response && response.status >= 400 ? failureMetadata(response, origin) : {}) }));
    } catch { /* Diagnostics never change action results or expose raw errors. */ }
  };
  target.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    let observe = false;
    try { observe = isSameOriginAction(args, origin); } catch { /* Forward unrecognized inputs unchanged. */ }
    const pending: ReturnType<typeof fetch> = Reflect.apply(original, this, args);
    if (observe) void pending.then(response => report(response), () => report());
    // Preserve request, receiver, argument identity, original promise and response.
    // Never read/clone a body, retry, redirect, add a header or issue another fetch.
    return pending;
  };
  installed.add(target);
}
