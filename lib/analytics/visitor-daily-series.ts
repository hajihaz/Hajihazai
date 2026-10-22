/** Normalize sparse successful read-only SQL reporting into exactly 30 UTC days. */
export type VisitorDay = {date:string;views:number;visits:number;taps:number;visitors:number;activeMinutes:number};
const safeCount=(value:unknown):number=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):0};
export function fillVisitorDays(rows:VisitorDay[],now=new Date(),length=30):VisitorDay[]{
 if(!Number.isInteger(length)||length<1||length>366)throw new Error('Invalid day range');
 const base=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
 const result=new Map<string,VisitorDay>();
 for(let i=length-1;i>=0;i--){
  const date=new Date(base-i*86400000).toISOString().slice(0,10);
  result.set(date,{date,views:0,visits:0,taps:0,visitors:0,activeMinutes:0});
 }
 for(const row of rows){
  if(!result.has(row.date))continue;
  result.set(row.date,{date:row.date,views:safeCount(row.views),visits:safeCount(row.visits),
   taps:safeCount(row.taps),visitors:safeCount(row.visitors),activeMinutes:safeCount(row.activeMinutes)});
 }
 return [...result.values()];
}
