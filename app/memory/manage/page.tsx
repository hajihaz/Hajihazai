import { auth } from "@/auth";
import { listAllMemories, memoryStats } from "@/lib/db/memory-queries";
import MemoryManager from "@/components/memory-manager";

export default async function MemoryManagePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <p className="text-muted-foreground">Please sign in to manage your memory.</p>
      </main>
    );
  }

  const rows = await listAllMemories(session.user.id);
  const stats = await memoryStats(session.user.id);
  const memories = rows.map((memory) => ({
    id: memory.id,
    type: memory.type,
    title: memory.title,
    content: memory.content,
    status: memory.status,
    importance: memory.importance,
    confidence: memory.confidence,
    validFrom: memory.validFrom.toISOString(),
    validUntil: memory.validUntil?.toISOString() ?? null,
    supersededBy: memory.supersededBy,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  }));

  return <MemoryManager initialMemories={memories} initialStats={stats} />;
}
