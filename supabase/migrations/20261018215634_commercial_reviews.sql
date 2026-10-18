-- Analysis reports retain the commercial snapshot. Approvals only record a
-- review decision; no external action or financial transaction is attached.
alter table public.approvals add column source_analysis_id uuid references public.analysis_jobs(id) on delete cascade;
create unique index approval_source_analysis on public.approvals(source_analysis_id) where source_analysis_id is not null;

create or replace function public.guard_approval() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='INSERT' then
  if new.status<>'pending' or new.decided_at is not null then raise exception 'Approvals must start pending'; end if;
  if new.source_analysis_id is not null and not exists(
   select 1 from public.analysis_jobs j where j.id=new.source_analysis_id and j.user_id=new.user_id and j.status='completed' and j.report->'commercial_brief'->>'status'='review'
  ) then raise exception 'Commercial analysis owner or state mismatch'; end if;
 end if;
 if tg_op='UPDATE' then
  if old.status<>'pending' then raise exception 'Decisions are immutable'; end if;
  if (to_jsonb(new)-array['status','decided_at','updated_at']) is distinct from (to_jsonb(old)-array['status','decided_at','updated_at']) then raise exception 'Approval content is immutable'; end if;
 end if;
 return new;
end; $$;

create function public.prepare_commercial_review() returns trigger language plpgsql security invoker set search_path=public as $$
declare b jsonb; t jsonb; description text; sources integer;
begin
 if new.status<>'completed' or old.status='completed' or new.opportunity_id is null then return new; end if;
 b=new.report->'commercial_brief';
 if b is null or b->>'status' is distinct from 'review' or b->>'version' is distinct from '1' then return new; end if;
 -- The saved report and real persisted source rows must agree before a review
 -- is proposed. This is still an unexecuted hypothesis, never proof of demand.
 select count(distinct url) into sources from public.analysis_sources where analysis_id=new.id and user_id=new.user_id;
 if sources<2 or (new.report->'scorecard'->>'total')::integer<50 or new.report->>'recommendation' in ('reject','insufficient_evidence') then return new; end if;
 t=b->'validation_test';
 if t is null or t='null'::jsonb then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,2));
 -- A repeated scan keeps its own report without filling the user's inbox with
 -- duplicate pending decisions for the same opportunity.
 if exists(select 1 from public.approvals a join public.analysis_jobs j on j.id=a.source_analysis_id and j.user_id=a.user_id where a.user_id=new.user_id and a.status='pending' and j.opportunity_id=new.opportunity_id) then return new; end if;
 description='AI-förberett valideringstest. Betalningsvilja och kund är inte verifierade.'||E'\n\nMålgrupp: '||left(b->'offer'->>'audience',600)||E'\nErbjudande att testa: '||left(b->'offer'->>'deliverable',1000)||E'\nPrisidé: '||coalesce(b->>'monthly_price_hypothesis_sek','okänd')||' SEK/månad, hypotetiskt.'||E'\n\nTest: '||left(t->>'test',1000)||E'\nMätetal: '||left(t->>'metric',600)||E'\nFortsätt om: '||left(t->>'pass_criterion',600)||E'\nStoppa om: '||left(t->>'stop_criterion',600)||E'\n\nGranska originalanalysens källor, risker, säljtext och leveransplan.'||E'\nGodkännandet dokumenterar endast ditt beslut om inriktning. Det skickar inget, startar inget test och godkänner inga köp. Exakta externa åtgärder kräver separat granskning.';
 insert into public.approvals(user_id,title,description,risk,action_type,amount,source_analysis_id)
 values(new.user_id,'Granska affärstest: '||left(new.report->'opportunity'->>'title',150),description,'medium','research',coalesce((t->>'estimated_cost_sek')::numeric,0),new.id)
 on conflict (source_analysis_id) where source_analysis_id is not null do nothing;
 return new;
end; $$;
revoke all on function public.prepare_commercial_review() from public,anon,authenticated,service_role;
create trigger prepare_commercial_review after update of status on public.analysis_jobs for each row when (new.status='completed' and old.status is distinct from new.status) execute function public.prepare_commercial_review();
-- Worker invoker permissions; owner RLS and existing approval guards remain.
grant insert on public.approvals to service_role;
