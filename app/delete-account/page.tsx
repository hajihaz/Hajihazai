import { auth } from "@/auth";
import DeleteAccountButton from "@/components/delete-account-button";

export const metadata = { title: "Delete Account | HajiHaz AI" };

export default async function DeleteAccountPage() {
  const session = await auth();
  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-5 py-12">
      <h1 className="text-3xl font-semibold">Delete HajiHaz AI Account</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        Account deletion permanently removes your HajiHaz AI account and associated user-owned application data. This action cannot be undone.
      </p>
      {session?.user?.id ? <DeleteAccountButton /> : (
        <div className="mt-8 rounded-xl border p-5 text-sm">
          <p>You must sign in before requesting account deletion.</p>
          <a className="mt-4 inline-block underline" href="/">Return to HajiHaz AI and sign in</a>
        </div>
      )}
    </main>
  );
}
