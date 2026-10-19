import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";
import { hhcCommands, hhcDevices, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  startPairing, completePairing, authenticateDevice, touchDevice, listOwnerDevices,
  queueOwnerCommand, claimCommand, finishCommand, actOnOwnerCommand, revokeOwnerDevice,
} from "@/lib/hhc/customer-bridge";

test.describe("customer HHC isolation and authorization", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Requires disposable local PostgreSQL");

  test("two accounts cannot pair, command, approve, or revoke each other's Macs", async () => {
    const a = crypto.randomUUID(), b = crypto.randomUUID();
    const guest = crypto.randomUUID();
    await db.insert(users).values([
      { id:a, email:"customer-a-"+a+"@example.test" },
      { id:b, email:"customer-b-"+b+"@example.test" },
      { id:guest, email:"guest-"+guest+"@guest.hajihaz.ai" },
    ]);
    try {
      await expect(startPairing(guest)).rejects.toThrow(/sign in/i);
      const issuedA = await startPairing(a);
      const issuedB = await startPairing(b);
      expect(issuedA.pairingCode).not.toEqual(issuedB.pairingCode);
      expect(issuedA.pairingCode.length).toBeGreaterThan(40);
      await expect(completePairing("bad-code", "wrong")).rejects.toThrow();
      const macA = await completePairing(issuedA.pairingCode, "Customer A Mac");
      const macB = await completePairing(issuedB.pairingCode, "Customer B Mac");
      await expect(completePairing(issuedA.pairingCode, "Replay")).rejects.toThrow();
      const [storedA] = await db.select().from(hhcDevices).where(eq(hhcDevices.id, macA.device.id));
      expect(storedA.userId).toBe(a);
      expect(storedA.tokenHash).not.toBe(macA.deviceToken);
      expect(storedA.tokenHash.length).toBe(64);

      expect(await authenticateDevice(macA.device.id, "Bearer "+macA.deviceToken)).not.toBeNull();
      expect(await authenticateDevice(macA.device.id, "Bearer "+macB.deviceToken)).toBeNull();
      expect(await authenticateDevice(macB.device.id, "Bearer "+macA.deviceToken)).toBeNull();
      expect(await authenticateDevice(macA.device.id, "Bearer wrong")).toBeNull();
      await touchDevice(macA.device.id);
      await touchDevice(macB.device.id);
      const listA = await listOwnerDevices(a), listB = await listOwnerDevices(b);
      expect(listA.map(d => d.id)).toEqual([macA.device.id]);
      expect(listB.map(d => d.id)).toEqual([macB.device.id]);

      await expect(queueOwnerCommand(b, {deviceId:macA.device.id,tool:"system_info",args:{}})).rejects.toThrow();
      await expect(queueOwnerCommand(a, {deviceId:macB.device.id,tool:"system_info",args:{}})).rejects.toThrow();
      await expect(queueOwnerCommand(a, {deviceId:macA.device.id,tool:"totally_unsafe",args:{}})).rejects.toThrow();
      const read = await queueOwnerCommand(a, {deviceId:macA.device.id,tool:"system_info",args:{}});
      expect(read.status).toBe("queued");
      expect(await claimCommand(macB.device.id)).toBeNull();
      const claimed = await claimCommand(macA.device.id);
      expect(claimed?.id).toBe(read.commandId);
      expect(await claimCommand(macA.device.id)).toBeNull();
      await expect(finishCommand(macB.device.id, read.commandId, true, {})).rejects.toThrow();
      await finishCommand(macA.device.id, read.commandId, true, { output:"A computer only" });
      await expect(finishCommand(macA.device.id, read.commandId, true, {})).rejects.toThrow();

      const restricted = await queueOwnerCommand(a, {deviceId:macA.device.id,tool:"run_command",args:{command:"pwd"}});
      expect(restricted.status).toBe("pending_approval");
      expect(await claimCommand(macA.device.id)).toBeNull();
      await expect(actOnOwnerCommand(b, restricted.commandId, true)).rejects.toThrow();
      await actOnOwnerCommand(a, restricted.commandId, true);
      expect((await claimCommand(macA.device.id))?.id).toBe(restricted.commandId);
      await finishCommand(macA.device.id, restricted.commandId, false, { error:"Locally denied" });
      const [saved] = await db.select().from(hhcCommands).where(eq(hhcCommands.id, restricted.commandId));
      expect(saved.status).toBe("failed");

      await expect(revokeOwnerDevice(b, macA.device.id)).rejects.toThrow();
      await revokeOwnerDevice(a, macA.device.id);
      expect(await authenticateDevice(macA.device.id, "Bearer "+macA.deviceToken)).toBeNull();
      await expect(queueOwnerCommand(a, {deviceId:macA.device.id,tool:"system_info",args:{}})).rejects.toThrow();
      expect(await authenticateDevice(macB.device.id, "Bearer "+macB.deviceToken)).not.toBeNull();
    } finally {
      await db.delete(users).where(eq(users.id, a));
      await db.delete(users).where(eq(users.id, b));
      await db.delete(users).where(eq(users.id, guest));
    }
  });

  test("unpaired browser and invalid agent tokens fail closed", async ({ request }) => {
    for (const url of ["/api/hhc/devices", "/api/hhc/commands"]) {
      const r = await request.get(url, { headers: {cookie:""} });
      expect([401,403]).toContain(r.status());
    }
    const bad = await request.post("/api/hhc/agent/pair", { data:{ pairingCode:"invalid", name:"Other Mac" } });
    expect(bad.status()).toBe(403);
    const unknown = await request.get("/api/hhc/agent/00000000-0000-4000-8000-000000000001", { headers:{authorization:"Bearer invalid"} });
    expect(unknown.status()).toBe(401);
  });
});
