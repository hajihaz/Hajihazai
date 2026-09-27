import { auth } from "@/auth";
import { transferGuestConversations, verifyGuestTransferToken } from "@/lib/auth/guest-transfer";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)hajihaz_guest_transfer=([^;]+)/)?.[1];
  if (session?.user?.id) {
    const guestId = verifyGuestTransferToken(cookie ? decodeURIComponent(cookie) : null);
    await transferGuestConversations(guestId, session.user.id);
  }
  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set("hajihaz_guest_transfer", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
