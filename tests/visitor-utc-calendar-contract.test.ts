import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/api/admin/visitor-analytics/route.ts',import.meta.url),'utf8');
const panel=readFileSync(new URL('../components/admin-visitor-traffic.tsx',import.meta.url),'utf8');
describe('owner traffic calendar boundaries',()=>{
 it('defines a shared UTC calendar start instead of rolling 720 hours',()=>{
  expect(source).toContain("date_trunc('day',now() AT TIME ZONE 'UTC') - interval '29 days'");
  expect(source).toContain('const firstDayUtc = sql`');
  expect(source).not.toContain("interval '30 days'");
  expect(source.match(/created_at>=\$\{firstDayUtc\}/g)?.length).toBeGreaterThanOrEqual(5);
 });
 it('groups daily chart and signed-in customer report by UTC dates, not server-local dates',()=>{
  expect(source).toContain("date_trunc('day',created_at AT TIME ZONE 'UTC')");
  expect(source).toContain("date_trunc('day',t.created_at AT TIME ZONE 'UTC')");
  expect(source).not.toContain("date_trunc('day',created_at)");
  expect(source).not.toContain("date_trunc('day',t.created_at)");
 });
 it('keeps short windows rolling and labels 30-day totals accurately',()=>{
  expect(source).toContain("now()-interval '24 hours'");
  expect(source).toContain("now()-interval '7 days'");
  expect(panel).toContain('Visits · 30 UTC days');
  expect(panel).toContain('Page views · 30 UTC days');
  expect(panel).toContain('Visits · last 24h');
 });
});
