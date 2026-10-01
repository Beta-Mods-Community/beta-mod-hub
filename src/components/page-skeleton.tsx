export default function PageSkeleton({
  layout = "page",
}: {
  layout?: "page" | "catalog" | "mod";
}) {
  return (
    <main
      className="site-container flex-1 py-10 sm:py-12"
      role="status"
      aria-busy="true"
    >
      <p className="sr-only">Loading page…</p>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-10 w-2/3 max-w-sm rounded-md bg-surface-raised" />
        <div className="h-4 w-3/4 max-w-md rounded-sm bg-surface" />
        {layout === "catalog" ? (
          <>
            <div className="h-16 rounded-lg border border-line bg-surface-soft" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <div
                  key={key}
                  className="overflow-hidden rounded-lg border border-line bg-surface"
                >
                  <div className="aspect-[16/10] bg-surface-raised" />
                  <div className="space-y-3 p-5">
                    <div className="h-5 w-3/4 rounded bg-surface-raised" />
                    <div className="h-3 w-full rounded bg-surface-raised" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div
            className={`grid gap-6 pt-3 ${layout === "mod" ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}
          >
            <div className="h-64 rounded-lg border border-line bg-surface-soft" />
            {layout === "mod" && (
              <div className="h-48 rounded-lg border border-line bg-surface" />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
