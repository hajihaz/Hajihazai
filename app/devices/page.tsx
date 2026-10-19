import { auth } from "@/auth";
import Link from "next/link";
import HhcDevicesPanel from "@/components/hhc-devices-panel";
export default async function DevicesPage() {
  const s = await auth();
  if (!s?.user?.id) return <main className="mx-auto max-w-xl p-8"><p>Sign in to manage your computers.</p><Link href="/">Return to HajiHaz AI</Link></main>;
  if (s.user.email?.toLowerCase().endsWith("@guest.hajihaz.ai")) return <main className="mx-auto max-w-xl p-8"><p>Sign in to pair your own computer.</p><Link href="/">Return to HajiHaz AI</Link></main>;
  return <HhcDevicesPanel />;
}