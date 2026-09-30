import "server-only";

export async function sendResendMail(input: { key: string; from: string; to: string; subject: string; text: string }, fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${input.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (!response.ok || !response.body) throw new Error();
    let size = 0; const chunks: Uint8Array[] = [];
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength; if (size > 16384) throw new Error(); chunks.push(chunk);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.id) || "error" in body) throw new Error();
  } catch { throw new Error("Email delivery failed. Please try again later."); }
}
