import { test, expect } from "@playwright/test";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("image generator UI", () => {
  test("opens, configures, generates, and displays an image", async ({
    page,
  }) => {
    const identifier = process.env.E2E_IDENTIFIER;
    const password = process.env.E2E_PASSWORD;
    const login =
      identifier && password
        ? await page.request.post("/api/auth/login", {
            data: { identifier, password },
          })
        : await page.request.post("/api/auth/guest");
    expect(login.ok()).toBeTruthy();

    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Create image" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create image" }).click();
    await expect(
      page.getByRole("dialog", { name: "Create image" }),
    ).toBeVisible();

    await page
      .getByLabel("Prompt")
      .fill("A refined black sports car on a rainy Tokyo street.");
    await page.getByRole("button", { name: "Cinematic" }).click();
    await page.getByLabel("Aspect ratio").selectOption("16:9");
    await page.getByLabel("Quality", { exact: true }).selectOption("2K");

    await page.route("**/api/images/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          image: TINY_PNG,
          mimeType: "image/png",
          imageSize: "2K",
          aspectRatio: "16:9",
        }),
      });
    });

    await page.getByRole("button", { name: "Generate image" }).click();
    await expect(page.getByAltText(/refined black sports car/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download PNG" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Regenerate" }).last(),
    ).toBeVisible();
  });
});
