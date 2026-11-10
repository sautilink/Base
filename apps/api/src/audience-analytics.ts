import type { Pool } from 'pg';

export type AudienceDay = { day: string; newVisitors: number; messages: number; menuClicks: number };
export type AudienceAnalytics = {
  visitors: number; subscribers: number; unsubscribed: number;
  active7d: number; active30d: number; firstSeenAt: string | null;
  daily: AudienceDay[];
};

/** Ownership and aggregation use one SQL snapshot. Raw audience rows never leave the API. */
export async function loadAudienceAnalytics(db: Pick<Pool, 'query'>, botId: string, ownerId: string): Promise<AudienceAnalytics | null> {
  const result = await db.query<AudienceAnalytics>(`with owned as (
      select id from public.base_bots where id=$1 and owner_id=$2
    ), audience as (
      select a.* from base_private.bot_audience a join owned b on b.id=a.bot_id
    ), days as (
      select ((now() at time zone 'UTC')::date-i)::date as day from generate_series(0,29) i
    ), growth as (
      select (first_seen_at at time zone 'UTC')::date as day,count(*)::int as n from audience
      where first_seen_at >= ((now() at time zone 'UTC')::date-29)::timestamp at time zone 'UTC' group by 1
    ) select
      (select count(*)::int from audience) as visitors,
      (select count(*)::int from audience where subscription_state='subscribed') as subscribers,
      (select count(*)::int from audience where subscription_state='unsubscribed') as unsubscribed,
      (select count(*)::int from audience where last_seen_at>=now()-interval '7 days') as "active7d",
      (select count(*)::int from audience where last_seen_at>=now()-interval '30 days') as "active30d",
      (select min(first_seen_at) from audience) as "firstSeenAt",
      (select jsonb_agg(jsonb_build_object('day',to_char(d.day,'YYYY-MM-DD'),
        'newVisitors',coalesce(g.n,0),'messages',coalesce(a.messages,0),'menuClicks',coalesce(a.menu_clicks,0)) order by d.day)
       from days d left join growth g on g.day=d.day
       left join base_private.bot_activity_daily a on a.day=d.day and a.bot_id=b.id) as daily
    from owned b`, [botId, ownerId]);
  return result.rows[0] ?? null;
}
