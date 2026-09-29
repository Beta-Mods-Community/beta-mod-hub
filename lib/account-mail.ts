import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { isLoopbackUrl, type AccountTokenPurpose } from "./account-policy";

export const MAIL_UNAVAILABLE = "Email delivery is not configured. Contact the site owner to enable verification and password recovery.";

export function accountMailConfig() {
  const raw = process.env.APP_URL;
  if (!raw) return null;
  let base: URL;
  try { base = new URL(raw); } catch { return null; }
  if (base.username || base.password || base.search || base.hash
    || !["http:", "https:"].includes(base.protocol)
    || (!isLoopbackUrl(raw) && base.protocol !== "https:")) return null;
  // Preview files are private local artifacts, never served as an HTTP route.
  if (process.env.AUTH_MAIL_MODE === "preview") {
    if (process.env.NODE_ENV === "production" || !isLoopbackUrl(raw)) return null;
    return { mode: "preview" as const, origin: base.origin };
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !Number.isInteger(port)
    || port < 1 || port > 65535) return null;
  if (!!process.env.SMTP_USER !== !!process.env.SMTP_PASSWORD) return null;
  return { mode: "smtp" as const, origin: base.origin, port };
}

export async function sendAccountMail(to: string, purpose: AccountTokenPurpose, token: string) {
  const config = accountMailConfig();
  if (!config) throw new Error(MAIL_UNAVAILABLE);
  const verifying = purpose === "verify-email";
  const url = new URL(verifying ? "/verify-email" : "/reset-password", config.origin);
  url.searchParams.set("token", token);
  const subject = verifying ? "Verify your Beta Mods email" : "Reset your Beta Mods password";
  const text = `${verifying ? "Confirm your email address" : "Choose a new password"} using this link:\n\n${url}\n\nThis link expires in ${verifying ? "24 hours" : "30 minutes"} and can only be used once. If you did not request it, ignore this email.\n\nBeta Mods`;
  if (config.mode === "preview") {
    const directory = path.join(homedir(), ".betamods-dev-mail");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(directory, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify({ to, subject, text, createdAt: new Date().toISOString() }, null, 2),
      { encoding: "utf8", mode: 0o600, flag: "wx" });
    return;
  }
  const secure = process.env.SMTP_SECURE === "true" || config.port === 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: config.port, secure,
    requireTLS: !secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  } finally { transport.close(); }
}
