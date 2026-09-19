import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const hasDb = !!process.env.DATABASE_URL;
const ai = vi.hoisted(() => ({ routeChatStream: vi.fn() }));
const memory = vi.hoisted(() => ({ buildMemoryContext: vi.fn() }));

vi.mock("@/lib/ai/router", () => ai);
vi.mock("@/lib/memory/context", () => memory);

const streamOf = (text: string) => ({
  stream: (async function* () { yield text; })(),
  modelId: "test-model",
});

describe.skipIf(!hasDb)("automation runner (db)", () => {
  let db: any, schema: any, runDueAutomations: any, runAutomationNow: any, automationQueries: any;
  let userId = "", projectId = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    ({ runDueAutomations, runAutomationNow } = await import("@/lib/automation/runner"));
    automationQueries = await import("@/lib/db/automation-queries");
    const suffix = String(Date.now()) + "-" + String(Math.round(Math.random() * 1e6));
    const [user] = await db.insert(schema.users).values({ email: "automation-" + suffix + "@x.com" }).returning();
    userId = user.id;
    const [project] = await db.insert(schema.projects).values({
      userId,
      name: "Automation project",
      instructions: "Always include the project operating instructions.",
    }).returning();
    projectId = project.id;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    memory.buildMemoryContext.mockResolvedValue(null);
    ai.routeChatStream.mockResolvedValue(streamOf("scheduled result"));
  });

  afterAll(async () => {
    if (!db || !userId) return;
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  async function createAutomation(values: Record<string, unknown>) {
    const [row] = await db.insert(schema.automations).values({
      userId,
      name: "Test automation",
      prompt: "Run the scheduled task",
      schedule: "0 0 * * *",
      timezone: "UTC",
      status: "active",
      nextRunAt: new Date("2026-09-19T00:00:00.000Z"),
      ...values,
    }).returning();
    return row;
  }

  it("claims a due automation, executes it, records the run, and schedules the next run", async () => {
    const automation = await createAutomation({});
    const result = await runDueAutomations(new Date("2026-09-19T03:00:00.000Z"));

    expect(result.claimed).toBe(1);
    expect(result.results[0]).toMatchObject({ id: automation.id, status: "success" });

    const [saved] = await db.select().from(schema.automations).where(eq(schema.automations.id, automation.id));
    const runs = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.automationId, automation.id));
    expect(saved.status).toBe("active");
    expect(saved.lastStatus).toBe("success");
    expect(saved.lastError).toBeNull();
    expect(saved.nextRunAt?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("success");
    expect(runs[0].output).toBe("scheduled result");
  });

  it("moves an active scheduled automation to failed when execution errors", async () => {
    const automation = await createAutomation({});
    ai.routeChatStream.mockRejectedValue(new Error("provider unavailable"));

    const result = await runDueAutomations(new Date("2026-09-19T03:00:00.000Z"));
    expect(result.results[0]).toMatchObject({ id: automation.id, status: "error", error: "provider unavailable" });

    const [saved] = await db.select().from(schema.automations).where(eq(schema.automations.id, automation.id));
    const [run] = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.automationId, automation.id));
    expect(saved.status).toBe("failed");
    expect(saved.nextRunAt).toBeNull();
    expect(saved.lastStatus).toBe("error");
    expect(saved.lastError).toBe("provider unavailable");
    expect(run.status).toBe("error");
    expect(run.error).toBe("provider unavailable");
  });

  it("passes owned project instructions and project memory into execution", async () => {
    const automation = await createAutomation({ projectId });
    memory.buildMemoryContext.mockResolvedValue({ block: "Project memory: use the approved format." });

    const result = await runAutomationNow(userId, automation.id);
    expect(result.status).toBe("success");

    const messages = ai.routeChatStream.mock.calls.at(-1)?.[0] ?? [];
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0].content).toContain("Project: Automation project");
    expect(messages[0].content).toContain("Always include the project operating instructions.");
    expect(messages[0].content).toContain("Project memory: use the approved format.");
    expect(messages[1]).toEqual({ role: "user", content: "Run the scheduled task" });
    expect(memory.buildMemoryContext).toHaveBeenCalledWith(userId, {
      query: "Run the scheduled task",
      projectId,
    });
  });

  it("rejects assigning another user's project to an automation", async () => {
    const otherSuffix = String(Date.now()) + "-other";
    const [otherUser] = await db.insert(schema.users).values({ email: "automation-other-" + otherSuffix + "@x.com" }).returning();
    const [otherProject] = await db.insert(schema.projects).values({
      userId: otherUser.id,
      name: "Other project",
    }).returning();
    const automation = await createAutomation({});

    expect(await automationQueries.updateAutomation(userId, automation.id, { projectId: otherProject.id })).toBeNull();
    expect(await automationQueries.createAutomation(userId, {
      name: "Cross-user",
      prompt: "Should fail",
      schedule: "0 0 * * *",
      timezone: "UTC",
      nextRunAt: new Date("2026-09-19T00:00:00.000Z"),
      projectId: otherProject.id,
    })).toBeNull();

    await db.delete(schema.users).where(eq(schema.users.id, otherUser.id));
  });
});
