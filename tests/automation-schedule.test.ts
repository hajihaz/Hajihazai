import { describe, expect, it } from "vitest";
import { isValidCronSchedule, nextAutomationRun } from "@/lib/automation/schedule";

describe("automation scheduling", () => {
  it("computes the next run in the requested timezone", () => {
    const from = new Date("2026-09-18T22:00:00.000Z");
    const next = nextAutomationRun("30 9 * * *", "Asia/Kolkata", from);
    expect(next?.toISOString()).toBe("2026-09-19T04:00:00.000Z");
  });

  it("rejects malformed schedules and accepts valid cron", () => {
    expect(isValidCronSchedule("not-a-cron", "UTC")).toBe(false);
    expect(isValidCronSchedule("0 9 * * 1-5", "Asia/Kolkata")).toBe(true);
  });
});
