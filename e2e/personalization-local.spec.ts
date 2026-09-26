import { test, expect } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
test("conversation personalization is server-backed", async ({ page }) => {
 const identifier=process.env.E2E_IDENTIFIER,password=process.env.E2E_PASSWORD;test.skip(!identifier||!password,"isolated credentials required");
 await ensureE2EAuthenticated(page.request);
 const c=await page.request.post("/api/conversations",{data:{}});expect(c.status()).toBe(200);const convo=await c.json();
 expect((await page.request.patch(`/api/conversations/${convo.id}`,{data:{pinned:true,intelligenceLevel:"high"}})).status()).toBe(200);
 const list=await page.request.get("/api/conversations");const found=(await list.json()).conversations.find((x:{id:string})=>x.id===convo.id);expect(found.pinned).toBe(true);expect(found.intelligenceLevel).toBe("high");
 expect((await page.request.patch(`/api/conversations/${convo.id}`,{data:{pinned:false,intelligenceLevel:"medium"}})).status()).toBe(200);
});
