import { test, expect } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";

test("document attachment and artifact persist together for one conversation", async ({ page }) => {
  const identifier = process.env.E2E_IDENTIFIER;
  const password = process.env.E2E_PASSWORD;
  test.skip(!identifier || !password, "Set E2E_IDENTIFIER and E2E_PASSWORD for the isolated document/artifact journey.");

  await ensureE2EAuthenticated(page.request);

  const conversationResponse = await page.request.post("/api/conversations", { data: {} });
  expect(conversationResponse.status()).toBe(200);
  const conversation = await conversationResponse.json();

  const payload = "Document-artifact workflow E2E " + Date.now() + "\nSource material remains attached to this conversation.";
  const upload = await page.request.post("/api/knowledge/upload", {
    multipart: {
      file: { name: "workflow-e2e.txt", mimeType: "text/plain", buffer: Buffer.from(payload) },
      title: "Workflow E2E Source",
    },
  });
  expect(upload.status()).toBe(200);
  const uploaded = await upload.json();
  expect(uploaded.documentId).toBeTruthy();

  const attached = await page.request.post("/api/conversations/" + conversation.id + "/attachments", {
    data: { documentId: uploaded.documentId },
  });
  expect(attached.status()).toBe(201);

  const artifact = await page.request.post("/api/artifacts", {
    data: {
      conversationId: conversation.id,
      sourceDocumentId: uploaded.documentId,
      title: "Workflow E2E Artifact",
      content: "Generated from the attached source material.",
    },
  });
  expect(artifact.status()).toBe(201);
  const createdArtifact = await artifact.json();
  expect(createdArtifact.artifact.id).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });

  const attachments = await page.request.get("/api/conversations/" + conversation.id + "/attachments");
  expect(attachments.status()).toBe(200);
  expect((await attachments.json()).attachments.some((a: { documentId: string }) => a.documentId === uploaded.documentId)).toBe(true);

  const artifacts = await page.request.get("/api/artifacts?conversationId=" + conversation.id);
  expect(artifacts.status()).toBe(200);
  expect((await artifacts.json()).artifacts.some((a: { id: string }) => a.id === createdArtifact.artifact.id)).toBe(true);

  const detail = await page.request.get("/api/artifacts/" + createdArtifact.artifact.id);
  expect(detail.status()).toBe(200);
  const artifactDetail = (await detail.json()).artifact;
  expect(artifactDetail.content).toContain("attached source material");
  expect(artifactDetail.sourceDocumentId).toBe(uploaded.documentId);

  const deletedArtifact = await page.request.delete("/api/artifacts/" + createdArtifact.artifact.id);
  expect(deletedArtifact.status()).toBe(204);
  const detached = await page.request.delete("/api/conversations/" + conversation.id + "/attachments?documentId=" + encodeURIComponent(uploaded.documentId));
  expect(detached.status()).toBe(204);
  const deletedDocument = await page.request.delete("/api/knowledge/" + uploaded.documentId);
  expect(deletedDocument.status()).toBe(204);
});
