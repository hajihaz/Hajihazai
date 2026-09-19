import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getAutomation: vi.fn(),
  createAutomationRun: vi.fn(),
  markAutomationResult: vi.fn(),
  finishAutomationRun: vi.fn(),
  claimDueAutomations: vi.fn(),
}));

const ai = vi.hoisted(() => ({ routeChatStream: vi.fn() }));
const memory = vi.hoisted(() => ({ buildMemoryContext: vi.fn() }));
const projects = vi.hoisted(() => ({ getProject: vi.fn() }));
const schedule = vi.hoisted(() => ({ nextAutomationRun: vi.fn() }));

vi.mock("@/lib/db/automation-queries", () => db);
vi.mock("@/lib/ai/router", () => ai);
vi.mock("@/lib/memory/context", () => memory);
vi.mock("@/lib/db/project-queries", () => projects);
vi.mock("@/lib/automation/schedule", () => schedule);

import { runAutomationNow } from "@/lib/automation/runner";

const failedAutomation = {
  id: "automation-1",
  userId: "user-1",
  name: "Daily report",
  prompt: "Create the daily report",
  schedule: "0 9 * * *",
  timezone: "Asia/Kolkata",
  status: "failed" as const,
  projectId: null,
  nextRunAt: null,
  lastRunAt: new Date("2026-09-18T03:30:00.000Z"),
  lastStatus: "error",
  lastError: "temporary provider outage",
  createdAt: new Date("2026-09-17T03:30:00.000Z"),
  updatedAt: new Date("2026-09-18T03:30:00.000Z"),
};

function streamOf(...chunks: string[]) {
  return {
    stream: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    modelId: "test-model",
  };
}

describe("automation runner retry lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schedule.nextAutomationRun.mockReturnValue(new Date("2026-09-19T03:30:00.000Z"));
    db.getAutomation.mockResolvedValue(failedAutomation);
    db.createAutomationRun.mockResolvedValue({ id: "run-1" });
    db.markAutomationResult.mockResolvedValue({});
    db.finishAutomationRun.mockResolvedValue({});
    memory.buildMemoryContext.mockResolvedValue(null);
    projects.getProject.mockResolvedValue(null);
    ai.routeChatStream.mockResolvedValue(streamOf("Daily report complete."));
  });

  it("reactivates a failed automation, clears its error, runs it, and preserves the schedule", async () => {
    const result = await runAutomationNow("user-1", "automation-1");

    expect(result).toEqual({ status: "success", runId: "run-1" });
    expect(schedule.nextAutomationRun).toHaveBeenCalledWith("0 9 * * *", "Asia/Kolkata");
    expect(db.markAutomationResult).toHaveBeenNthCalledWith(1, "user-1", "automation-1", {
      status: "active",
      lastStatus: "retrying",
      nextRunAt: new Date("2026-09-19T03:30:00.000Z"),
      lastError: null,
    });
    expect(db.createAutomationRun).toHaveBeenCalledWith("user-1", "automation-1");
    expect(db.finishAutomationRun).toHaveBeenCalledWith("user-1", "run-1", {
      status: "success",
      output: "Daily report complete.",
      modelId: "test-model",
    });
    expect(db.markAutomationResult).toHaveBeenNthCalledWith(2, "user-1", "automation-1", {
      status: "active",
      lastStatus: "success",
      nextRunAt: new Date("2026-09-19T03:30:00.000Z"),
      lastError: null,
    });
  });

  it("records a retry failure without losing the restored schedule", async () => {
    ai.routeChatStream.mockRejectedValue(new Error("provider unavailable"));

    const result = await runAutomationNow("user-1", "automation-1");

    expect(result).toEqual({ status: "error", runId: "run-1", error: "provider unavailable" });
    expect(db.finishAutomationRun).toHaveBeenCalledWith("user-1", "run-1", {
      status: "error",
      error: "provider unavailable",
    });
    expect(db.markAutomationResult).toHaveBeenNthCalledWith(2, "user-1", "automation-1", {
      status: "active",
      lastStatus: "error",
      nextRunAt: new Date("2026-09-19T03:30:00.000Z"),
      lastError: "provider unavailable",
    });
  });
});
