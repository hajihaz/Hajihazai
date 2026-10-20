import { expect, test } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

test.describe("HajiHaz AI streamlined chat UI", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Disposable local database only");

  test("global quick search opens via Ctrl+K, focuses query and closes with Escape", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/", {waitUntil:"domcontentloaded"});
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.keyboard.press("Control+k");
    const modal = page.getByRole("dialog", {name:"Search HajiHaz AI"});
    await expect(modal).toBeVisible();
    const input = modal.getByRole("combobox", {name:"Search HajiHaz AI"});
    await expect(input).toBeFocused();
    await input.fill("new chat");
    await expect(modal.getByRole("option", {name:"New chat ⌘N", exact:true})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
  });

  test("command menu starts a new chat, slash focuses composer, and sidebar stays usable", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/", {waitUntil:"domcontentloaded"});
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.keyboard.press("Control+k");
    const modal = page.getByRole("dialog", {name:"Search HajiHaz AI"});
    await modal.getByRole("combobox").fill("new chat");
    await modal.getByRole("option", {name:"New chat ⌘N", exact:true}).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole("heading",{name:"Where should we begin?"})).toBeVisible();
    await page.getByRole("heading",{name:"Where should we begin?"}).click();
    await page.keyboard.press("/");
    await expect(page.getByRole("textbox",{name:"Message",exact:true})).toBeFocused();
    await page.getByRole("textbox",{name:"Message",exact:true}).fill("A saved draft");
    await page.keyboard.press("/");
    await expect(page.getByRole("textbox",{name:"Message",exact:true})).toHaveValue("A saved draft/");
  });

  test("quick action writes a message by focusing the composer", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/", {waitUntil:"domcontentloaded"});
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.keyboard.press("Control+k");
    const modal = page.getByRole("dialog",{name:"Search HajiHaz AI"});
    await modal.getByRole("combobox").fill("focus message composer");
    await modal.getByRole("option",{name:/Write a message/}).click();
    await expect(modal).toHaveCount(0);
    const composer = page.getByRole("textbox",{name:"Message",exact:true});
    await expect(composer).toBeFocused();
    await page.keyboard.type("Ready to start");
    await expect(composer).toHaveValue("Ready to start");
  });

  test("quick search finds an existing owned conversation and opens it", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    const created = await page.request.post("/api/conversations", {data:{}});
    expect(created.status()).toBe(200);
    const {id} = await created.json();
    const title = "Alpine Navigation Research";
    const renamed = await page.request.patch("/api/conversations/" + id, {data:{title}});
    expect(renamed.status()).toBe(200);
    await page.goto("/", {waitUntil:"domcontentloaded"});
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.keyboard.press("Control+k");
    const modal = page.getByRole("dialog",{name:"Search HajiHaz AI"});
    await modal.getByRole("combobox").fill("Alpine Navigation");
    await modal.getByRole("option",{name:title}).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get("c")).toBe(id);
  });

  test("phone layout opens search in chat tools with no horizontal overflow", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    await page.setViewportSize({width:375,height:812});
    await page.goto("/",{waitUntil:"domcontentloaded"});
    // UI is server-rendered before React event handlers hydrate.
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.getByRole("button",{name:"More chat tools"}).click();
    await expect(page.getByRole("menu",{name:"Chat tools"})).toBeVisible();
    await page.getByRole("menuitem",{name:"Search chats and actions"}).click();
    const modal = page.getByRole("dialog",{name:"Search HajiHaz AI"});
    await expect(modal).toBeVisible();
    const dimensions = await modal.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      screen: window.innerWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.screen);
    await modal.getByRole("combobox").fill("image");
    await expect(modal.getByText("Create image", {exact:true})).toBeVisible();
  });

  test("assistant fenced code renders a readable copyable block in saved conversations", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    const result = await page.request.post("/api/conversations", {data:{}});
    expect(result.status()).toBe(200);
    const {id} = await result.json();
    await db.insert(messages).values({conversationId:id,role:"assistant",
      content:"Example:\n\n" + "```js\nconsole.log(42);\n```"});
    await page.goto("/?c=" + id,{waitUntil:"domcontentloaded"});
    await expect(page.getByText("console.log(42);",{exact:false})).toBeVisible();
    await expect(page.getByRole("button",{name:"Copy code"})).toBeVisible();
    await expect(page.getByText("js",{exact:true})).toBeVisible();
  });

});
