import "server-only";
import { client } from "./db";
import { catalogPage, CATALOG_PAGE_SIZE, escapeLike } from "./catalog-query";
import type { ModCardData } from "@/components/mod-card";

export async function getCatalogPage(options: { q?: string; game?: string; sort?: string; page?: number } = {}) {
  if (!client) return { mods: [] as ModCardData[], total: 0, page: 1, pages: 1 };
  const q = options.q?.trim().slice(0, 100) ?? "";
  const game = options.game?.slice(0, 120) ?? "";
  const pattern = `%${escapeLike(q)}%`;
  const filter = client`m.status NOT IN ('promoted', 'abandoned') AND m.hidden_at IS NULL
    AND (${game} = '' OR m.game = ${game})
    AND (${q} = '' OR m.title ILIKE ${pattern} OR m.game ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM unnest(m.tags) AS tag WHERE tag ILIKE ${pattern}))`;
  const count = await client`SELECT count(*) AS total FROM beta_mods m WHERE ${filter}`;
  const total = Number(count[0].total);
  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const page = Math.min(catalogPage(options.page), pages);
  const order = options.sort === "needs-testers"
    ? client`coalesce(v.total, 0) ASC, m.updated_at ASC, m.id ASC`
    : client`m.created_at DESC, m.id DESC`;
  const rows = await client<ModCardData[]>`
    SELECT m.id, m.title, m.description, m.game, m.tags, m.status,
      m.created_at AS "createdAt", m.updated_at AS "updatedAt", u.display_name AS "ownerName",
      coalesce(v.total, 0)::int AS "testerCount", coalesce(v.total, 0)::int AS total,
      coalesce(v.ready, 0)::int AS ready,
      (SELECT count(*)::int FROM bug_reports r WHERE r.beta_mod_id = m.id AND r.status <> 'fixed') AS "openBugs",
      (SELECT count(*)::int FROM builds b WHERE b.beta_mod_id = m.id) AS "buildCount",
      latest.uploaded_at AS "lastBuildAt",
      (SELECT mm.id FROM mod_media mm WHERE mm.beta_mod_id = m.id AND mm.scan_state = 'clean'
        ORDER BY mm.is_hero DESC, mm.position ASC LIMIT 1) AS "heroMediaId"
    FROM beta_mods m LEFT JOIN users u ON u.id = m.owner_id
    LEFT JOIN LATERAL (SELECT id, uploaded_at FROM builds b WHERE b.beta_mod_id = m.id
      ORDER BY uploaded_at DESC, id DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (SELECT count(*) AS total, count(*) FILTER (WHERE is_ready) AS ready
      FROM ready_signals r WHERE r.build_id = latest.id) v ON true
    WHERE ${filter} ORDER BY ${order} LIMIT ${CATALOG_PAGE_SIZE} OFFSET ${(page - 1) * CATALOG_PAGE_SIZE}`;
  return { mods: Array.from(rows), total, page, pages };
}
