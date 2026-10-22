import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/api/admin/visitor-analytics/route.ts',import.meta.url),'utf8');
const panel=readFileSync(new URL('../components/admin-visitor-traffic.tsx',import.meta.url),'utf8');
describe('owner-only returning visitor analytics',()=>{
 it('groups by browser visitor and counts distinct visits, not refreshes or views',()=>{
  expect(source).toContain("WHERE kind='visit' AND created_at>=now()-interval '7 days'");
  expect(source).toMatch(/GROUP BY visitor_id\s+HAVING count\(DISTINCT session_id\)>=2/);
  expect(source).toContain('returningVisitors7d: count(returning.rows[0]?.returning_visitors_7d)');
  expect(panel).toContain('["Returning visitors · 7 days","returningVisitors7d"]');
 });
 it('protects admin-only report and never returns raw anonymous visitor/session IDs',()=>{
  expect(source).toContain('const sess = await requireAdmin()');
  expect(source).toContain('if (!sess) return new Response("Unauthorized", { status: 401 })');
  expect(source).not.toContain('visitorId:String(');
  expect(source).toContain('fillVisitorDays(');
 });
});
