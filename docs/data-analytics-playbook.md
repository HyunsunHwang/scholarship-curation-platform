# Data Analytics Playbook

## Event Schema

Core raw table: `public.analytics_events`

- `event_name`: event type (ex. `page_view`, `search_submitted`, `bookmark_toggled`, `scholarship_opened`, `apply_clicked`)
- `occurred_at`: event timestamp
- `user_id`: authenticated user id (`null` if anonymous)
- `page_path`: page path where event happened
- `scholarship_id`: optional scholarship id for scholarship-level events
- `search_query`: optional query text
- `sort_key`: optional selected sort option
- `scope_filter`: optional selected scope tab
- `metadata`: free-form JSON payload for extra context

## Event Dictionary (Recommended Minimum)

- `page_view`
  - Fires when a page is opened
  - Suggested metadata: `{ "source": "direct|internal_link" }`
- `search_submitted`
  - Fires when user applies search input
  - Suggested metadata: `{ "result_count": 24 }`
- `sort_changed`
  - Fires when sort option changes
  - Suggested metadata: `{ "from": "deadline", "to": "latest" }`
- `filter_changed`
  - Fires when scope filter changes
  - Suggested metadata: `{ "scope": "all|campus|external" }`
- `bookmark_toggled`
  - Fires when bookmark add/remove action is completed
  - Suggested metadata: `{ "bookmarked": true }`
- `scholarship_opened`
  - Fires when scholarship detail is opened
  - Suggested metadata: `{ "from": "home|matched|mypage" }`
- `apply_clicked`
  - Fires when apply CTA is clicked
  - Suggested metadata: `{ "outbound_host": "..." }`

## Collection API

Use RPC `public.track_analytics_event(...)` for event ingestion.

Example:

```sql
select public.track_analytics_event(
  p_event_name := 'search_submitted',
  p_page_path := '/',
  p_search_query := '한국장학재단',
  p_sort_key := 'deadline',
  p_scope_filter := 'all',
  p_metadata := '{"result_count": 12}'::jsonb
);
```

## Daily Aggregation

Run `public.refresh_analytics_daily(p_target_date)` once per day (or hourly if needed).

- `public.analytics_daily_kpi`: service-wide daily KPI
- `public.analytics_scholarship_daily_kpi`: scholarship-level daily KPI
- `public.analytics_search_term_daily`: top search terms per day

Example:

```sql
select public.refresh_analytics_daily((now() at time zone 'Asia/Seoul')::date - 1);
```

## Operations Checklist

- Keep raw event table append-only.
- Build dashboards from daily mart tables, not directly from raw.
- Track data quality:
  - event volume by day/hour
  - null ratio for key columns (`event_name`, `page_path`)
  - duplicate spike detection
- Document every metric formula in one place.
