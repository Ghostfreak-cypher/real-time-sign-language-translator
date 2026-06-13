import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          404
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-400">
          The page you’re looking for doesn’t exist.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
