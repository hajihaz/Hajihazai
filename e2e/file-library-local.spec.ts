import { test, expect } from "@playwright/test";

test("persistent file library upload -> search -> reuse -> delete", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const identifier = process.env.E2E_IDENTIFIER; const password = process.env.E2E_PASSWORD;
  test.skip(!identifier || !password, "Set E2E_IDENTIFIER and E2E_PASSWORD for the isolated file-library journey.");
  const login = await page.request.post("/api/auth/login", { data: { identifier, password } });
  expect(login.status()).toBe(200);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });

  const payload = `File Library E2E ${Date.now()}\nPersistent server-backed content.`;
  const upload = await page.request.post("/api/knowledge/upload", {
    multipart: { file: { name: "library-e2e.txt", mimeType: "text/plain", buffer: Buffer.from(payload) }, title: "Library E2E File" },
  });
  expect(upload.status()).toBe(200);
  const uploaded = await upload.json();
  expect(uploaded.documentId).toBeTruthy();

  const listed = await page.request.get("/api/knowledge");
  expect(listed.status()).toBe(200);
  expect((await listed.json()).documents.some((d: { id:string }) => d.id === uploaded.documentId)).toBe(true);

  const searched = await page.request.get("/api/knowledge?q=Library%20E2E%20File");
  expect(searched.status()).toBe(200);
  expect((await searched.json()).documents.some((d: { id:string }) => d.id === uploaded.documentId)).toBe(true);

  const convo = await page.request.post("/api/conversations", { data: {} });
  expect(convo.status()).toBe(200);
  const conversation = await convo.json();
  const attached = await page.request.post(`/api/conversations/${conversation.id}/attachments`, { data: { documentId: uploaded.documentId } });
  expect(attached.status()).toBe(201);
  const reopened = await page.request.get(`/api/conversations/${conversation.id}/attachments`);
  expect(reopened.status()).toBe(200);
  expect((await reopened.json()).attachments.some((a: { documentId:string }) => a.documentId === uploaded.documentId)).toBe(true);

  const detail = await page.request.get(`/api/knowledge/${uploaded.documentId}`);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).preview.content).toContain("Persistent server-backed content.");

  const detached = await page.request.delete(`/api/conversations/${conversation.id}/attachments?documentId=${encodeURIComponent(uploaded.documentId)}`);
  expect(detached.status()).toBe(204);
  const afterDetach = await page.request.get(`/api/conversations/${conversation.id}/attachments`);
  expect(afterDetach.status()).toBe(200);
  expect((await afterDetach.json()).attachments.some((a: { documentId:string }) => a.documentId === uploaded.documentId)).toBe(false);

  const reattached = await page.request.post(`/api/conversations/${conversation.id}/attachments`, { data: { documentId: uploaded.documentId } });
  expect(reattached.status()).toBe(201);

  const deleted = await page.request.delete(`/api/knowledge/${uploaded.documentId}`);
  expect(deleted.status()).toBe(204);
  expect((await page.request.get(`/api/knowledge/${uploaded.documentId}`)).status()).toBe(404);
  expect((await page.request.get(`/api/conversations/${conversation.id}/attachments`)).status()).toBe(200);
  expect((await (await page.request.get(`/api/conversations/${conversation.id}/attachments`)).json()).attachments.some((a: { documentId:string }) => a.documentId === uploaded.documentId)).toBe(false);
});
