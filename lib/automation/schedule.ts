import { Cron } from "croner";

export function nextAutomationRun(schedule: string, timezone: string, from = new Date()) {
  try {
    const next = new Cron(schedule, { timezone }).nextRun(from);
    return next instanceof Date && !Number.isNaN(next.getTime()) ? next : null;
  } catch {
    return null;
  }
}

export function isValidCronSchedule(schedule: string, timezone: string) {
  return nextAutomationRun(schedule, timezone) !== null;
}
