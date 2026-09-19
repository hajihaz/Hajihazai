/**
 * Regression tests — Haji family query retrieval.
 *
 * These queries were previously missing or returning wrong chunks because
 * family data was split across chunk boundaries in a single dense document.
 *
 * Fix: 6 focused documents created and assigned to the haji-core brain:
 *   - Haji Identity, Haji Family Tree, Haji Education,
 *     Haji Friends, Haji Businesses, Haji Goals and Personality
 *
 * These tests run against the production DB and verify that all 6 family
 * queries surface relevant content.
 *
 * Tests SKIP when DATABASE_URL is not set (CI without DB).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildKnowledgeContext } from "@/lib/memory/context";
import { getBrainBySlug } from "@/lib/db/brain-queries";

const HAJI_ID = "385b652a-e30f-4a22-b26b-415840e4ec11";
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("Haji family retrieval regression", () => {
  let hajiCoreId: string;

  beforeAll(async () => {
    const brain = await getBrainBySlug("haji-core");
    expect(brain).not.toBeNull();
    hajiCoreId = brain!.id;
  });

  async function ask(query: string) {
    const ctx = await buildKnowledgeContext(HAJI_ID, { query, brainId: hajiCoreId });
    return { count: ctx.count, block: ctx.block };
  }

  it("returns Safina Thangam info for 'Who is Safina Thangam?'", async () => {
    const { count, block } = await ask("Who is Safina Thangam?");
    expect(count).toBeGreaterThan(0);
    expect(block.toLowerCase()).toContain("safina thangam");
    // Must identify the relationship
    expect(block.toLowerCase()).toMatch(/aunt|mother.*sister|maternal/i);
  });

  it("returns Hamza info for 'Who is Hamza?'", async () => {
    const { count, block } = await ask("Who is Hamza?");
    expect(count).toBeGreaterThan(0);
    expect(block.toLowerCase()).toContain("hamza");
    // Hamza is Aunt Safina's son — a cousin of Haji
    expect(block.toLowerCase()).toMatch(/safina|cousin|kabeer/i);
  });

  it("returns Sahabuddin info for 'Who is Sahabuddin?'", async () => {
    const { count, block } = await ask("Who is Sahabuddin?");
    expect(count).toBeGreaterThan(0);
    expect(block.toLowerCase()).toContain("sahabuddin");
    // Must explain the relationship (Aunt Safina's son, close bond with Haji)
    expect(block.toLowerCase()).toMatch(/safina|cousin|close bond/i);
  });

  it("returns Hidhayaa info for 'Who is Hidhayaa?'", async () => {
    const { count, block } = await ask("Who is Hidhayaa?");
    expect(count).toBeGreaterThan(0);
    expect(block.toLowerCase()).toContain("hidhayaa");
    // Hidhayaa is Haji's sister
    expect(block.toLowerCase()).toMatch(/sister|married/i);
  });

  it("identifies the maternal aunt for 'Who is Haji's mother's sister?'", async () => {
    const { count, block } = await ask("Who is Haji's mother's sister?");
    expect(count).toBeGreaterThan(0);
    // Must surface Safina Thangam as the mother's sister
    expect(block.toLowerCase()).toContain("safina");
    expect(block.toLowerCase()).toMatch(/maternal aunt|mother.*sister|shehnaz.*sister/i);
  });

  it("returns family tree for 'List Haji family tree'", async () => {
    const { count, block } = await ask("List Haji family tree");
    expect(count).toBeGreaterThan(0);
    const lower = block.toLowerCase();
    // Core family members must all appear
    expect(lower).toContain("hussain sahib");   // father
    expect(lower).toContain("shehnaaz");          // mother
    expect(lower).toContain("hidhayaa");         // sister
    expect(lower).toContain("safina");           // aunt
    expect(lower).toContain("sahabuddin");       // cousin
  });

  it("retrieves multiple chunks (no single-chunk limit)", async () => {
    // KNOWLEDGE_MAX_CHARS = 6000 must allow > 1 chunk
    const { count } = await ask("Tell me about Haji's family and relatives");
    expect(count).toBeGreaterThan(1);
  });
});
