import {describe,it,expect} from 'vitest';
import {fillVisitorDays} from '@/lib/analytics/visitor-daily-series';
const date=new Date('2026-10-23T03:20:00.000Z');
describe('customer-visitor reporting days',()=>{
 it('fills exactly 30 UTC days, not a made-up DB event, preserving actual counters',()=>{
  const days=fillVisitorDays([{date:'2026-10-22',views:2,visits:1,taps:0,visitors:1,activeMinutes:3}],date);
  expect(days).toHaveLength(30);
  expect(days[0].date).toBe('2026-09-24');
  expect(days[28]).toEqual({date:'2026-10-22',views:2,visits:1,taps:0,visitors:1,activeMinutes:3});
  expect(days[29]).toEqual({date:'2026-10-23',views:0,visits:0,taps:0,visitors:0,activeMinutes:0});
 });
 it('discards dates outside reporting period and invalid counters',()=>{
  const out=fillVisitorDays([{date:'2026-01-01',views:17,visits:99,taps:0,visitors:2,activeMinutes:40},
    {date:'2026-10-23',views:-3,visits:NaN,taps:Infinity,visitors:2,activeMinutes:0}],date,2);
  expect(out).toHaveLength(2);expect(out[1].views).toBe(0);
  expect(out[1].visits).toBe(0);expect(out[1].visitors).toBe(2);
 });
 it('UTC dates are stable at month end and leap year',()=>{
  const out=fillVisitorDays([],new Date('2024-03-01T00:01:00Z'),3);
  expect(out.map(x=>x.date)).toEqual(['2024-02-28','2024-02-29','2024-03-01']);
 });
 it('rejects implausible series sizes',()=>{
  expect(()=>fillVisitorDays([],date,0)).toThrow('Invalid day range');
 });
});
