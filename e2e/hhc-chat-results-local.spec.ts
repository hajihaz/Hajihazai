import { expect, test } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";

/** No customer Mac, tunnel or production database is contacted by these tests. */
test.describe("HHC verified results inside chat", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Disposable database only");

  test("queued HHC request shows only device-attested result, including after async completion", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    const pairRes = await page.request.post("/api/hhc/devices");
    expect(pairRes.status()).toBe(201);
    const code = (await pairRes.json()).pairingCode;
    const enroll = await page.request.post("/api/hhc/agent/pair", { data: {pairingCode:code,name:"Test Customer Mac"} });
    expect(enroll.status()).toBe(201);
    const {device,deviceToken} = await enroll.json();
    const auth = { authorization: "Bearer " + deviceToken };
    try {
      const online = await page.request.get("/api/hhc/agent/" + device.id, { headers:auth });
      expect(online.status()).toBe(200);
      const created = await page.request.post("/api/hhc/commands", {
        data:{deviceId:device.id,tool:"system_info",args:{}},
      });
      expect(created.status()).toBe(201);
      const {commandId,status} = await created.json();
      expect(status).toBe("queued");

      await page.route("**/api/chat", async route => {
        const metadata = {hhcCommandId:commandId, hhcCommandStatus:"queued", hhcDeviceName:"Test Customer Mac"};
        const chunk = JSON.stringify({t:"chunk",text:"Your request is queued, not executed yet."});
        const done = JSON.stringify({t:"done",meta:metadata});
        await route.fulfill({status:200,contentType:"text/event-stream",body:`data: ${chunk}\n\ndata: ${done}\n\n`});
      });
      await page.goto("/", {waitUntil:"domcontentloaded"});
      await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
      await page.locator("header").getByRole("button",{name:"New chat",exact:true}).click();
      await page.getByPlaceholder("Message HajiHaz AI…").fill("show my Mac system info");
      await page.getByRole("button",{name:"Send message"}).click();
      const card = page.getByRole("region",{name:"HHC computer execution"});
      await expect(card.getByText("Queued on your Mac")).toBeVisible();
      await expect(card.getByText("Test Customer Mac")).toBeVisible();
      await expect(card.getByText("Verified device result")).toHaveCount(0);
      const claim = await page.request.get("/api/hhc/agent/" + device.id,{headers:auth});
      expect(claim.status()).toBe(200);
      expect((await claim.json()).command.id).toBe(commandId);
      const confirm = await page.request.post("/api/hhc/agent/"+device.id,{
        headers:auth, data:{commandId,ok:true,result:{message:"VERIFIED_ONLY_FROM_MAC",freeDiskBytes:1024}},
      });
      expect(confirm.status()).toBe(200);
      await expect(card.getByText("Completed on your Mac")).toBeVisible({timeout:15000});
      await expect(card.getByText(/VERIFIED_ONLY_FROM_MAC/)).toBeVisible();
    } finally {
      expect((await page.request.delete("/api/hhc/devices/" + device.id)).status()).toBe(200);
    }
  });

  test("real chat route queues customer HHC without fabricating execution or LLM output", async ({ page }) => {
    test.setTimeout(60000);
    await ensureE2EAuthenticated(page.request);
    const pairResponse = await page.request.post("/api/hhc/devices");
    expect(pairResponse.status()).toBe(201);
    const { pairingCode } = await pairResponse.json();
    const pairing = await page.request.post("/api/hhc/agent/pair", {
      data: { pairingCode, name:"Simulated isolated Mac" },
    });
    expect(pairing.status()).toBe(201);
    const { device, deviceToken } = await pairing.json();
    const agentHeaders = {authorization:"Bearer "+deviceToken};
    try {
      await page.request.get("/api/hhc/agent/"+device.id,{headers:agentHeaders});
      const conversationResponse = await page.request.post("/api/conversations",{data:{}});
      expect(conversationResponse.status()).toBe(200);
      const conversation = await conversationResponse.json();
      const response = await page.request.post("/api/chat",{
        data:{conversationId:conversation.id,message:"show my Mac system info",level:"medium",
          brainMode:"smart",brainId:null},
        timeout:30000,
      });
      expect(response.status()).toBe(200);
      const text = await response.text();
      const events = text.split("\n\n").map(chunk => chunk.trim())
        .filter(chunk=>chunk.startsWith("data: "))
        .map(chunk=>JSON.parse(chunk.slice(6)));
      const assistant = events.find(e=>e.t==="chunk");
      const done = events.find(e=>e.t==="done");
      expect(assistant?.text).toContain("not");
      expect(done?.modelId).toBe("hajihaz-commander-queued");
      expect(done?.meta?.hhcCommandId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(done?.meta?.hhcDeviceName).toBe("Simulated isolated Mac");
      const statusResponse = await page.request.get("/api/hhc/commands/"+done.meta.hhcCommandId);
      expect(statusResponse.status()).toBe(200);
      expect((await statusResponse.json()).command.status).toBe("queued");
    } finally {
      expect((await page.request.delete("/api/hhc/devices/"+device.id)).status()).toBe(200);
    }
  });

  test("account-controlled cancellation prevents an unclaimed Mac command", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    const issued = await page.request.post("/api/hhc/devices");
    expect(issued.status()).toBe(201);
    const { pairingCode } = await issued.json();
    const p = await page.request.post("/api/hhc/agent/pair", {
      data:{pairingCode,name:"Cancel Test Mac"},
    });
    expect(p.status()).toBe(201);
    const { device, deviceToken } = await p.json();
    const headers = {authorization:"Bearer "+deviceToken};
    try {
      expect((await page.request.get("/api/hhc/agent/" + device.id,{headers})).status()).toBe(200);
      const created = await page.request.post("/api/hhc/commands", {
        data:{deviceId:device.id,tool:"system_info",args:{}},
      });
      expect(created.status()).toBe(201);
      const { commandId } = await created.json();
      const cancelled = await page.request.post("/api/hhc/commands/" + commandId, {
        data:{action:"cancel"},
      });
      expect(cancelled.status()).toBe(200);
      expect((await cancelled.json()).status).toBe("cancelled");
      const own = await page.request.get("/api/hhc/commands/" + commandId);
      expect(own.status()).toBe(200);
      expect((await own.json()).command.status).toBe("cancelled");
      const fetched = await page.request.get("/api/hhc/agent/" + device.id,{headers});
      expect(fetched.status()).toBe(200);
      expect((await fetched.json()).command).toBeNull();
    } finally {
      expect((await page.request.delete("/api/hhc/devices/"+device.id)).status()).toBe(200);
    }
  });

});
