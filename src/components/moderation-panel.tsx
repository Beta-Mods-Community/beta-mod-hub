import Link from "next/link";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@lib/db";
import { requireAdmin } from "@lib/access";
import { moderateContent, setAccountSuspended } from "@lib/moderation";
import { betaMods, users } from "../../db/schema";
import { contentReports, moderationLog } from "../../db/community-schema";

export default async function ModerationPanel() {
  await requireAdmin();
  if (!db) return null;
  const [reports, hidden, accounts, log] = await Promise.all([
    db.select({ report: contentReports, mod: betaMods }).from(contentReports).innerJoin(betaMods, eq(betaMods.id, contentReports.betaModId)).where(isNull(contentReports.resolvedAt)).orderBy(desc(contentReports.createdAt)).limit(100),
    db.select().from(betaMods).where(isNotNull(betaMods.hiddenAt)).limit(100),
    db.select({ id: users.id, displayName: users.displayName, suspendedAt: users.suspendedAt }).from(users).orderBy(desc(users.createdAt)).limit(100),
    db.select().from(moderationLog).orderBy(desc(moderationLog.createdAt)).limit(20),
  ]);
  return <section className="panel mt-6 space-y-6 p-6"><h2 className="text-xl font-semibold">Content and accounts</h2>
    <div><h3 className="font-semibold">Open reports</h3>{!reports.length && <p className="mt-2 text-sm text-[var(--muted)]">No open content reports.</p>}
      {reports.map(({ report, mod }) => <div className="mt-4 border-t border-[var(--line)] pt-4" key={report.id}>
        <Link className="text-[var(--accent)]" href={`/mods/${mod.id}`}>{mod.title}</Link><p className="my-3 whitespace-pre-wrap text-sm">{report.reason}</p><DecisionForm modId={mod.id}/>
      </div>)}
    </div>
    <div><h3 className="font-semibold">Hidden listings</h3>{hidden.map(mod => <div key={mod.id} className="mt-4"><Link href={`/mods/${mod.id}`}>{mod.title}</Link><DecisionForm modId={mod.id}/></div>)}</div>
    <details><summary className="cursor-pointer font-semibold">Manage accounts (latest 100)</summary><p className="my-3 text-xs text-[var(--muted)]">Suspension ends existing sessions. Configured administrator accounts cannot be suspended here.</p>
      {accounts.map(account => <form key={account.id} action={setAccountSuspended} className="grid gap-2 border-t border-[var(--line)] py-3 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="userId" value={account.id}/><input type="hidden" name="suspended" value={String(!account.suspendedAt)}/>
        <span className="text-sm">{account.displayName}{account.suspendedAt ? " · suspended" : ""}</span>
        <input className="field" name="reason" required minLength={5} maxLength={2000} aria-label={`Reason for account action on ${account.displayName}`} placeholder="Reason"/>
        <button className="button-secondary">{account.suspendedAt ? "Restore account" : "Suspend"}</button>
      </form>)}
    </details>
    <details><summary className="cursor-pointer font-semibold">Recent moderation actions</summary><ul className="mt-3 space-y-3 text-sm">{log.map(item => <li key={item.id}>{item.action}: {item.reason}<span className="block text-xs text-[var(--muted)]">{item.createdAt.toISOString()}</span></li>)}</ul></details>
  </section>;
}
function DecisionForm({ modId }: { modId: string }) {
  return <form action={moderateContent} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="modId" value={modId}/>
    <input className="field min-w-40 flex-1" name="reason" required minLength={5} maxLength={2000} aria-label="Moderation reason" placeholder="Reason for this decision"/>
    <button name="decision" value="hide" className="button-secondary">Hide</button><button name="decision" value="restore" className="button-secondary">Restore</button><button name="decision" value="resolve" className="button-secondary">Dismiss report</button>
  </form>;
}
