import { requireAdmin } from "@/lib/admin/session";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

type HealthResult = {
  provider: string;
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
};

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkProvider(
  name: string,
  url: string,
  apiKey: string | undefined,
  headers: Record<string, string> = {},
): Promise<HealthResult> {
  if (!apiKey) return { provider: name, ok: false, configured: false, latencyMs: 0, error: "No API key configured" };
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return {
      provider: name,
      ok: res.ok,
      configured: true,
      latencyMs: Date.now() - start,
      status: res.status,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    return {
      provider: name,
      ok: false,
      configured: true,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });

  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const [database, ...providers] = await Promise.all([
    checkDatabase(),
    checkProvider("Groq", "https://api.groq.com/openai/v1/models", process.env.GROQ_API_KEY),
    checkProvider("OpenRouter", "https://openrouter.ai/api/v1/models", process.env.OPENROUTER_API_KEY),
    geminiKey
      ? checkProvider("Google Gemini", `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`, geminiKey, {})
      : checkProvider("Google Gemini", "https://generativelanguage.googleapis.com/v1beta/models", undefined),
  ]);

  const memUsage = process.memoryUsage();
  const providerFailure = providers.some((p) => p.configured && !p.ok);

  return Response.json({
    status: database.ok && !providerFailure ? "healthy" : "degraded",
    checkedAt: new Date().toISOString(),
    database,
    providers,
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    },
    uptime: Math.round(process.uptime()),
  });
}
