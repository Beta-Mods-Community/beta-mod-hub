/** Temporary cloud-pilot diagnostics. No telemetry, body reads or request changes. */
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

function contentCategory(response: Response): string {
  const value = response.headers.get("content-type");
  if (!value) return "missing";
  const mime = value.split(";", 1)[0].trim().toLowerCase();
  return ["text/x-component", "text/html", "text/plain", "application/json", "application/octet-stream"].includes(mime) ? mime : "other";
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
        status: response?.status ?? 0, contentType: response ? contentCategory(response) : "unavailable" }));
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
