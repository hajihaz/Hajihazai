import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { fillVisitorDays } from "@/lib/analytics/visitor-daily-series";

export const runtime = "nodejs";

const count = (v: unknown) => Number(v ?? 0) || 0;

/** Authenticated admin-only, read-only aggregation. Never returns raw clickstreams. */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse("admin-traffic:" + sess.adminId, 40, 60_000);
  if (limited) return limited;

  try {
    const [overall, days, pages, actions, customerDays, returning] = await Promise.all([
      db.execute(sql`
        SELECT
          count(*) FILTER (WHERE kind='view' AND created_at>=now()-interval '24 hours') as views_24h,
          count(*) FILTER (WHERE kind='view' AND created_at>=now()-interval '7 days') as views_7d,
          count(*) FILTER (WHERE kind='view' AND created_at>=now()-interval '30 days') as views_30d,
          count(*) FILTER (WHERE kind='visit' AND created_at>=now()-interval '24 hours') as visits_24h,
          count(*) FILTER (WHERE kind='visit' AND created_at>=now()-interval '7 days') as visits_7d,
          count(*) FILTER (WHERE kind='visit' AND created_at>=now()-interval '30 days') as visits_30d,
          count(distinct visitor_id) FILTER (WHERE created_at>=now()-interval '7 days') as visitors_7d,
          count(distinct visitor_id) FILTER (WHERE created_at>=now()-interval '30 days') as visitors_30d,
          count(*) FILTER (WHERE kind='tap' AND created_at>=now()-interval '7 days') as taps_7d,
          coalesce(sum(duration_seconds) FILTER (WHERE kind='active_time' AND created_at>=now()-interval '7 days'),0) as active_seconds_7d
        FROM product_traffic_event
        WHERE created_at>=now()-interval '30 days'
      `),
      db.execute(sql`
        SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD') as date,
          count(*) FILTER (WHERE kind='view') as views,
          count(*) FILTER (WHERE kind='visit') as visits,
          count(*) FILTER (WHERE kind='tap') as taps,
          count(distinct visitor_id) as visitors,
          coalesce(sum(duration_seconds) FILTER (WHERE kind='active_time'),0) as active_seconds
        FROM product_traffic_event WHERE created_at>=now()-interval '30 days'
        GROUP BY date_trunc('day',created_at) ORDER BY date_trunc('day',created_at)
      `),
      db.execute(sql`
        SELECT path,count(*) as views
        FROM product_traffic_event
        WHERE kind='view' AND created_at>=now()-interval '7 days'
        GROUP BY path ORDER BY views DESC LIMIT 20
      `),
      db.execute(sql`
        SELECT target,count(*) as taps
        FROM product_traffic_event
        WHERE kind='tap' AND target IS NOT NULL AND created_at>=now()-interval '7 days'
        GROUP BY target ORDER BY taps DESC LIMIT 20
      `),
      db.execute(sql`
        SELECT to_char(date_trunc('day',t.created_at),'YYYY-MM-DD') as date,
          t.user_id, coalesce(max(u.name),max(u.email),'Customer') as customer,
          count(*) FILTER (WHERE t.kind='visit') as visits,
          count(*) FILTER (WHERE t.kind='view') as views
        FROM product_traffic_event t
        LEFT JOIN "user" u ON u.id=t.user_id
        WHERE t.created_at>=now()-interval '7 days' AND t.user_id IS NOT NULL
        GROUP BY date_trunc('day',t.created_at), t.user_id
        ORDER BY date_trunc('day',t.created_at) DESC, visits DESC LIMIT 150
      `),
      db.execute(sql`
        SELECT count(*) AS returning_visitors_7d FROM (
          SELECT visitor_id FROM product_traffic_event
          WHERE kind='visit' AND created_at>=now()-interval '7 days'
          GROUP BY visitor_id
          HAVING count(DISTINCT session_id)>=2
        ) recent_repeat_browsers
      `),
    ]);
    const r = overall.rows[0] ?? {};
    return Response.json({
      generatedAt: new Date().toISOString(),
      scope: "consenting visits only",
      summary: {
        views24h: count(r.views_24h), views7d: count(r.views_7d), views30d: count(r.views_30d),
        visits24h: count(r.visits_24h), visits7d: count(r.visits_7d), visits30d: count(r.visits_30d),
        visitors7d: count(r.visitors_7d), visitors30d: count(r.visitors_30d),
        returningVisitors7d: count(returning.rows[0]?.returning_visitors_7d),
        taps7d: count(r.taps_7d), activeMinutes7d: Math.round(count(r.active_seconds_7d)/60),
      },
      daily: fillVisitorDays(days.rows.map(x => ({
        date: String(x.date), views: count(x.views), visits: count(x.visits), taps: count(x.taps),
        visitors: count(x.visitors), activeMinutes: Math.round(count(x.active_seconds)/60),
      }))),
      topPages: pages.rows.map(x=>({path:String(x.path),views:count(x.views)})),
      topTaps: actions.rows.map(x=>({target:String(x.target),taps:count(x.taps)})),
      customerDaily: customerDays.rows.map(x=>({
        date:String(x.date), userId:String(x.user_id), customer:String(x.customer),
        visits:count(x.visits), views:count(x.views),
      })),
    }, { headers: {"Cache-Control":"private, no-store"} });
  } catch (error) {
    console.error("[traffic-admin] aggregation unavailable", error);
    return Response.json({error:"Traffic report unavailable until analytics schema is installed."},
      {status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
