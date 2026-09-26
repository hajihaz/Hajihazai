import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Offline · HajiHaz AI",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section className="w-full max-w-sm text-center" aria-labelledby="offline-title">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted">
          <WifiOff className="size-6" aria-hidden="true" />
        </div>
        <h1 id="offline-title" className="text-xl font-semibold">You’re offline</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          HajiHaz AI needs a connection for live conversations. Your browser can reopen the app shell while the network is unavailable.
        </p>
        <a href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground">
          Try again
        </a>
      </section>
    </main>
  );
}
