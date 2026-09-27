"use server";

import { auth, signIn, signOut } from "@/auth";
import { cookies } from "next/headers";
import { createGuestTransferToken } from "@/lib/auth/guest-transfer";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function signInGuestWithGoogle() {
  const session = await auth();
  if (session?.user?.id && session.user.email?.toLowerCase().endsWith("@guest.hajihaz.ai")) {
    const store = await cookies();
    store.set("hajihaz_guest_transfer", createGuestTransferToken(session.user.id), {
      httpOnly: true, sameSite: "lax", secure: (process.env.AUTH_URL ?? "").startsWith("https://"), path: "/", maxAge: 15 * 60,
    });
  }
  await signIn("google", { redirectTo: "/api/auth/claim-guest" });
}
