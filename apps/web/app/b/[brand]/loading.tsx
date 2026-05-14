export default function BrandLoading() {
  return (
    <main className="container-narrow flex min-h-[60vh] items-center justify-center py-20">
      <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-secondary">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-secondary opacity-60" />
          <span className="relative inline-block h-2 w-2 rounded-full bg-secondary" />
        </span>
        Cargando evento…
      </div>
    </main>
  );
}
