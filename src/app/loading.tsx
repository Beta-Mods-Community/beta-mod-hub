export default function Loading() {
  return (
    <main className="site-container flex-1 py-10" role="status" aria-busy="true">
      <p className="sr-only">Loading page…</p>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-8 w-2/3 max-w-sm rounded-md bg-[var(--surface-raised)]" />
        <div className="h-4 w-3/4 max-w-md rounded-sm bg-[var(--surface)]" />
        <div className="grid gap-6 pt-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="h-64 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)]" />
          <div className="hidden h-40 rounded-lg border border-[var(--line)] bg-[var(--surface)] lg:block" />
        </div>
      </div>
    </main>
  );
}
