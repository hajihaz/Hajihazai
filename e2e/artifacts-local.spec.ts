import { test, expect } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
test("server-backed artifact survives reload and versions", async ({ page }) => {
  const identifier=process.env.E2E_IDENTIFIER,password=process.env.E2E_PASSWORD; test.skip(!identifier||!password,"isolated credentials required");
  await ensureE2EAuthenticated(page.request);
  const convo=await page.request.post("/api/conversations",{data:{}}); expect(convo.status()).toBe(200); const c=await convo.json();
  const created=await page.request.post("/api/artifacts",{data:{conversationId:c.id,title:"E2E Artifact",content:"version one"}}); expect(created.status()).toBe(201); const a=await created.json();
  const updated=await page.request.patch(`/api/artifacts/${a.artifact.id}`,{data:{title:"E2E Artifact Renamed",content:"version two"}}); expect(updated.status()).toBe(200);
  const reopened=await page.request.get(`/api/artifacts/${a.artifact.id}`); expect(reopened.status()).toBe(200); const body=await reopened.json(); expect(body.artifact.content).toBe("version two"); expect(body.versions.length).toBeGreaterThanOrEqual(2);
  const list=await page.request.get(`/api/artifacts?conversationId=${c.id}`); expect((await list.json()).artifacts[0].id).toBe(a.artifact.id);
  const deleted=await page.request.delete(`/api/artifacts/${a.artifact.id}`); expect(deleted.status()).toBe(204); expect((await page.request.get(`/api/artifacts/${a.artifact.id}`)).status()).toBe(404);
});
