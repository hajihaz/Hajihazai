import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { listConversations } from "@/lib/db/queries";
import { getProfile, isProfileComplete } from "@/lib/db/profile-queries";
import { listLevels } from "@/lib/ai/levels";
import { isAdmin } from "@/lib/auth/admin";
import { isMaintenanceMode } from "@/lib/system-settings";
import { signInWithGoogle } from "@/app/actions";
import ChatApp from "@/components/chat-app";
import AuthForm from "@/components/auth-form";

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await auth();

  // Not signed in → clean Google sign-in.
  if (!session?.user?.id) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          {/* Brand */}
          <div className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-4" /> HajiHaz AI
          </div>

          {/* Headline + sub-copy: make it clear this is sign-in AND sign-up */}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome to HajiHaz AI
            </h1>
            <p className="text-balance text-sm text-muted-foreground sm:text-base">
              Sign in or create your account with Google.
            </p>
          </div>

          {/* Auth card: badge → button → helper */}
          <div className="flex w-full flex-col items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Login &amp; Registration
            </span>

            <form action={signInWithGoogle} className="w-full">
              <button className="flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border bg-background px-5 text-sm font-medium shadow-sm hover:bg-accent">
                <GoogleIcon />
                Continue with Google
              </button>
            </form>

            <div className="flex w-full items-center gap-3 py-1 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>

            <AuthForm />

            <p className="text-xs text-muted-foreground">
              New users will be guided through a quick onboarding process.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Maintenance mode — admins bypass, everyone else goes to maintenance page
  const adminUser = isAdmin(session.user.email);
  if (!adminUser) {
    const maintenance = await isMaintenanceMode().catch(() => false);
    if (maintenance) redirect("/maintenance");
  }

  // Signed in but not onboarded → onboarding.
  const profile = await getProfile(session.user.id);
  if (!isProfileComplete(profile)) {
    redirect("/onboarding");
  }

  const rows = await listConversations(session.user.id);
  const conversations = rows.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt?.toISOString() ?? null,
  }));

  // Capability levels (Low/Medium active, High/Max "Coming Soon"). The client
  // refines availability via GET /api/models using configured capability metadata.
  const levels = listLevels();
  const admin = adminUser || isAdmin(profile?.email);
  const { c: openConversationId } = await searchParams;

  return (
    <ChatApp
      user={{
        name: profile?.googleName ?? session.user.name,
        email: profile?.email ?? session.user.email,
        image: profile?.profilePicture ?? session.user.image,
      }}
      initialConversations={conversations}
      levels={levels}
      isAdmin={admin}
      openConversationId={openConversationId}
    />
  );
}
