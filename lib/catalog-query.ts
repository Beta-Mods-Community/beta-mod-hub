export const CATALOG_PAGE_SIZE = 12;

export function catalogPage(value: unknown) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}

export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function browseUrl(values: { q?: string; game?: string; sort?: string; page?: number }) {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.game) params.set("game", values.game);
  if (values.sort === "needs-testers") params.set("sort", values.sort);
  if (values.page && values.page > 1) params.set("page", String(values.page));
  return `/browse${params.size ? `?${params}` : ""}`;
}
