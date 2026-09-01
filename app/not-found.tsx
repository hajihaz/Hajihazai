import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">That HajiHaz page could not be found.</p>
      <Link href="/" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
        Go home
      </Link>
    </main>
  );
}
