import { auth } from "@/auth";
import { listBrainsForPicker } from "@/lib/db/brain-queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const brains = await listBrainsForPicker();
  return Response.json({ brains }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
  });
}
