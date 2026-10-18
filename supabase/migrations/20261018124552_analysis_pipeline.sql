create table public.analysis_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 topic text not null check(length(topic) between 10 and 500), notes text not null default '' check(length(notes)<=1500),
 private_context text not null default '' check(length(private_context)<=8000),
 budget_cents integer not null check(budget_cents between 120 and 200), include_sales boolean not null default false,
 status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled','budget_exceeded')),
 active_role text check(active_role in ('scout','research','validator','strategist','finance','sales','critic','jarvis')),
 results jsonb not null default '[]'::jsonb check(jsonb_typeof(results)='array' and jsonb_array_length(results)<=8),
 report jsonb, spent_microusd integer not null default 0 check(spent_microusd>=0), reserved_microusd integer not null default 0 check(reserved_microusd>=0),
 attempted_calls integer not null default 0 check(attempted_calls between 0 and 10), cancel_requested boolean not null default false, error text, lease_token uuid, lease_until timestamptz,
 opportunity_id uuid references public.opportunities on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(spent_microusd+reserved_microusd<=budget_cents*10000)
);
create unique index one_active_analysis_per_user on public.analysis_jobs(user_id) where status in ('queued','running');
create index analysis_history on public.analysis_jobs(user_id,created_at desc);
create table public.analysis_steps (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 analysis_id uuid not null references public.analysis_jobs on delete cascade, role text not null, position integer not null check(position between 0 and 7),
 result jsonb not null, created_at timestamptz not null default now(), unique(analysis_id,role), unique(analysis_id,position)
);
create table public.analysis_sources (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 analysis_id uuid not null references public.analysis_jobs on delete cascade, source_key text not null,
 url text not null check(url like 'https://%'), title text not null, excerpt text not null default '', provider text not null,
 retrieved_at timestamptz not null, unique(analysis_id,source_key)
);
create table public.analysis_claims (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 analysis_id uuid not null references public.analysis_jobs on delete cascade, role text not null,
 kind text not null check(kind in ('fact','estimate','hypothesis')), statement text not null,
 source_urls jsonb not null, quote text not null, verification text not null check(verification in ('source_quote','unverified')), warning text
);
alter table public.opportunities add column origin_analysis_id uuid references public.analysis_jobs on delete set null;
do $$ declare t text; begin foreach t in array array['analysis_jobs','analysis_steps','analysis_sources','analysis_claims'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 execute format('grant select,insert on public.%I to authenticated',t);
 if t in ('analysis_jobs','analysis_sources') then
 execute format('create policy owner_change on public.%I for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t);
 execute format('grant update on public.%I to authenticated',t);
 end if;
 if t<>'analysis_jobs' then execute format('create index on public.%I(user_id,analysis_id)',t); end if;
 end loop; end $$;
create or replace function public.guard_analysis_owner() returns trigger language plpgsql set search_path=public as $$
 begin if not exists(select 1 from public.analysis_jobs where id=new.analysis_id and user_id=new.user_id) then raise exception 'Analysis must belong to record owner'; end if; return new; end; $$;
create trigger guard_analysis_step before insert on public.analysis_steps for each row execute function public.guard_analysis_owner();
create trigger guard_analysis_source before insert or update on public.analysis_sources for each row execute function public.guard_analysis_owner();
create trigger guard_analysis_claim before insert on public.analysis_claims for each row execute function public.guard_analysis_owner();
create or replace function public.claim_analysis(p_id uuid,p_token uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
 declare j public.analysis_jobs; begin
 select * into j from public.analysis_jobs where id=p_id and user_id=auth.uid() for update;
 if not found then return null; end if;
 if j.status not in ('queued','failed') and not (j.status='running' and j.lease_until<now()) then return null; end if;
 if j.spent_microusd+j.reserved_microusd>=j.budget_cents*10000 then raise exception 'Analysis budget exhausted'; end if;
 update public.analysis_jobs set status='running',error=null,lease_token=p_token,lease_until=now()+interval '5 minutes',updated_at=now() where id=p_id returning * into j;
 return to_jsonb(j); end; $$;
create or replace function public.checkpoint_analysis(p_id uuid,p_token uuid,p_position integer,p_result jsonb,p_spent integer,p_reserved integer) returns void language plpgsql security invoker set search_path=public as $$
 declare j public.analysis_jobs; s jsonb; c jsonb; expected text;
 begin
 select * into j from public.analysis_jobs where id=p_id and user_id=auth.uid() and lease_token=p_token and status='running' and lease_until>now() for update;
 if not found then raise exception 'Analysis lease unavailable'; end if;
 expected=(case when j.include_sales then array['scout','research','validator','strategist','finance','sales','critic','jarvis'] else array['scout','research','validator','strategist','finance','critic','jarvis'] end)[p_position+1];
 if jsonb_array_length(j.results)<>p_position or expected is null or p_result->>'role'<>expected then raise exception 'Invalid analysis step order'; end if;
 if p_spent<j.spent_microusd or p_reserved<0 or p_spent+p_reserved>j.budget_cents*10000 then raise exception 'Invalid analysis budget'; end if;
 insert into public.analysis_steps(user_id,analysis_id,role,position,result) values(j.user_id,p_id,expected,p_position,p_result);
 for s in select * from jsonb_array_elements(p_result->'sources') loop
 insert into public.analysis_sources(user_id,analysis_id,source_key,url,title,excerpt,provider,retrieved_at) values(j.user_id,p_id,md5(s->>'url'),s->>'url',s->>'title',s->>'excerpt',s->>'provider',(s->>'retrieved_at')::timestamptz) on conflict(analysis_id,source_key) do nothing;
 end loop;
 for c in select * from jsonb_array_elements(p_result->'claims') loop
 insert into public.analysis_claims(user_id,analysis_id,role,kind,statement,source_urls,quote,verification,warning) values(j.user_id,p_id,expected,c->>'kind',c->>'statement',c->'source_urls',c->>'quote',c->>'verification',c->>'warning');
 end loop;
 update public.analysis_jobs set results=results||jsonb_build_array(p_result),spent_microusd=p_spent,reserved_microusd=p_reserved,updated_at=now() where id=p_id;
 end; $$;
-- Audit table has no direct INSERT policy; final activity is produced by the opportunity trigger.
create or replace function public.finish_analysis(p_id uuid,p_token uuid,p_report jsonb,p_spent integer,p_reserved integer) returns uuid language plpgsql security invoker set search_path=public as $$
 declare j public.analysis_jobs; opportunity uuid; begin
 select * into j from public.analysis_jobs where id=p_id and user_id=auth.uid() and lease_token=p_token and status='running' and lease_until>now() for update;
 if not found then raise exception 'Analysis lease unavailable'; end if;
 if jsonb_array_length(j.results)<>(case when j.include_sales then 8 else 7 end) or j.results->-1->>'role'<>'jarvis' then raise exception 'Analysis is incomplete'; end if;
 if j.cancel_requested then raise exception 'Analysis cancelled'; end if;
 if p_spent<j.spent_microusd or p_reserved<0 or p_spent+p_reserved>j.budget_cents*10000 then raise exception 'Invalid analysis budget'; end if;
 insert into public.opportunities(user_id,title,description,sector,score,value,status,source_url,origin_analysis_id)
 values(j.user_id,p_report->'opportunity'->>'title','AI-analys. Betalningsvilja är ej validerad. '||(p_report->>'summary'),j.topic,(p_report->'scorecard'->>'total')::integer,0,'new','',p_id) returning id into opportunity;
 update public.analysis_jobs set status='completed',report=p_report,active_role=null,opportunity_id=opportunity,spent_microusd=p_spent,reserved_microusd=p_reserved,lease_until=null,updated_at=now() where id=p_id;
 return opportunity; end; $$;
revoke all on function public.claim_analysis(uuid,uuid),public.checkpoint_analysis(uuid,uuid,integer,jsonb,integer,integer),public.finish_analysis(uuid,uuid,jsonb,integer,integer) from public;
grant execute on function public.claim_analysis(uuid,uuid),public.checkpoint_analysis(uuid,uuid,integer,jsonb,integer,integer),public.finish_analysis(uuid,uuid,jsonb,integer,integer) to authenticated;
create or replace function public.guard_opportunity_analysis() returns trigger language plpgsql set search_path=public as $$
 begin if new.origin_analysis_id is not null and not exists(select 1 from public.analysis_jobs where id=new.origin_analysis_id and user_id=new.user_id) then raise exception 'Source analysis must belong to opportunity owner'; end if; return new; end; $$;
create trigger guard_opportunity_analysis before insert or update on public.opportunities for each row execute function public.guard_opportunity_analysis();
create or replace function public.guard_analysis_opportunity() returns trigger language plpgsql set search_path=public as $$
 begin if new.opportunity_id is not null and not exists(select 1 from public.opportunities where id=new.opportunity_id and user_id=new.user_id) then raise exception 'Opportunity must belong to analysis owner'; end if; return new; end; $$;
create trigger guard_analysis_opportunity before insert or update on public.analysis_jobs for each row execute function public.guard_analysis_opportunity();
-- List histories without sending every step/source blob for every past analysis.
-- Invoker security preserves base-table RLS on PostgreSQL 15+.
create view public.analysis_summaries with(security_invoker=true) as
 select id,user_id,topic,budget_cents,include_sales,status,active_role,
 jsonb_array_length(results) as step_count,report,attempted_calls,spent_microusd,reserved_microusd,
 error,cancel_requested,created_at,updated_at,lease_until,opportunity_id
 from public.analysis_jobs;
grant select on public.analysis_summaries to authenticated;
