-- Additive phase 3. Existing analyses, source archive and manual workflows are preserved.
create table public.automation_controls (
 user_id uuid primary key references auth.users on delete cascade, enabled boolean not null default false,
 daily_limit_cents integer not null default 1000 check(daily_limit_cents between 120 and 10000),
 monthly_limit_cents integer not null default 3000 check(monthly_limit_cents between 120 and 100000),
 updated_at timestamptz not null default now(),check(monthly_limit_cents>=daily_limit_cents)
);
create table public.scan_schedules (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 100),topic text not null check(length(topic) between 10 and 500),
 interval_days integer not null check(interval_days in (1,7)),budget_cents integer not null check(budget_cents between 120 and 200),
 enabled boolean not null default false,next_run_at timestamptz not null default now(),last_run_at timestamptz,last_error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index schedules_due on public.scan_schedules(next_run_at) where enabled;
alter table public.analysis_jobs add column schedule_id uuid references public.scan_schedules on delete set null;
alter table public.analysis_jobs add column topic_key text generated always as (regexp_replace(lower(trim(topic)),'[^a-z0-9åäö]+',' ','g')) stored;
create index research_reuse on public.analysis_jobs(user_id,topic_key,created_at desc);
create table public.ai_costs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('analysis','chat','agent','proposal')),
 spent_microusd integer not null default 0 check(spent_microusd>=0),
 reserved_microusd integer not null check(reserved_microusd>=0),state text not null default 'reserved' check(state in ('reserved','settled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index ai_costs_period on public.ai_costs(user_id,created_at);
insert into public.ai_costs(id,user_id,kind,spent_microusd,reserved_microusd,state,created_at)
 select id,user_id,'analysis',spent_microusd,case when status in ('queued','running') then budget_cents*10000-spent_microusd else reserved_microusd end,
 case when status in ('queued','running') then 'reserved' else 'settled' end,created_at from public.analysis_jobs;
create table public.daily_digests (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,day date not null,content jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,day)
);
create table public.outcome_feedback (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 opportunity_id uuid not null references public.opportunities on delete cascade,analysis_id uuid references public.analysis_jobs on delete set null,
 test_reference text not null check(length(trim(test_reference)) between 1 and 120),sample_size integer not null check(sample_size between 1 and 1000000),positive_results integer not null check(positive_results between 0 and sample_size),
 assumption text not null check(length(assumption) between 5 and 1500),result text not null check(length(result) between 5 and 2000),
 verdict text not null check(verdict in ('supported','refuted','inconclusive')),evidence_url text not null default '' check(evidence_url='' or evidence_url like 'https://%'),
 observed_at timestamptz not null check(observed_at<=now()+interval '5 minutes'),created_at timestamptz not null default now()
);
create unique index feedback_test_unique on public.outcome_feedback(user_id,opportunity_id,lower(trim(test_reference)));
create index feedback_opportunity on public.outcome_feedback(user_id,opportunity_id);
alter table public.opportunities add column verified_evidence_count integer not null default 0;
alter table public.leads add column opportunity_id uuid references public.opportunities on delete set null;
alter table public.leads add column next_action_at timestamptz;
alter table public.leads add column lawful_basis text not null default 'unknown' check(lawful_basis in ('unknown','consent','legitimate_interest'));
alter table public.leads add column consent_record text not null default '' check(length(consent_record)<=1500);
alter table public.leads add column do_not_contact boolean not null default false;
create table public.cash_entries (
 id uuid primary key,user_id uuid not null references auth.users on delete cascade,
 lead_id uuid references public.leads on delete set null,opportunity_id uuid references public.opportunities on delete set null,
 kind text not null check(kind in ('receipt','refund','cost')),amount_cents bigint not null check(amount_cents between 1 and 100000000000),
 occurred_on date not null check(occurred_on<=current_date),reference text not null check(length(reference) between 1 and 200),
 evidence_url text not null default '' check(evidence_url='' or evidence_url like 'https://%'),voided_at timestamptz,
 created_at timestamptz not null default now(),unique(user_id,reference)
);
create index cash_owner_date on public.cash_entries(user_id,occurred_on desc);
create table public.sales_drafts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 lead_id uuid not null references public.leads on delete cascade,subject text not null check(length(subject) between 1 and 200 and subject!~E'[\\r\\n]'),
 body text not null check(length(body) between 10 and 8000),recipient text not null check(length(recipient)<=320 and recipient!~E'[\\r\\n]'),
 status text not null default 'draft' check(status in ('draft','pending','approved','rejected','sending','sent','unknown','failed')),
 approval_id uuid references public.approvals,content_hash text not null,provider_message_id text,error text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index sales_draft_owner on public.sales_drafts(user_id,created_at desc);
-- Tokens have no authenticated grants or policies. Only a server client may read them.
create table public.email_connections (
 user_id uuid primary key references auth.users on delete cascade,email text not null,encrypted_tokens text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 entity text not null,record_id text not null,action text not null,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create index audit_owner_time on public.audit_events(user_id,created_at desc);
do $$ declare t text; begin foreach t in array array['automation_controls','scan_schedules','ai_costs','daily_digests','outcome_feedback','cash_entries','sales_drafts','email_connections','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t<>'email_connections' then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_select on public.%I for select to authenticated using((select auth.uid())=user_id)',t);
 end if;
 if t in ('automation_controls','scan_schedules','outcome_feedback','cash_entries','sales_drafts','daily_digests') then
 execute format('grant insert on public.%I to authenticated',t);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check((select auth.uid())=user_id)',t);
 end if;
 if t in ('automation_controls','scan_schedules','cash_entries','sales_drafts','daily_digests') then
 execute format('grant update on public.%I to authenticated',t);
 execute format('create policy owner_update on public.%I for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id)',t);
 end if;
 if t='scan_schedules' then
 execute 'grant delete on public.scan_schedules to authenticated';
 execute 'create policy owner_delete on public.scan_schedules for delete to authenticated using((select auth.uid())=user_id)';
 end if;
 end loop; end $$;
-- Minimized audit: identifiers, state transitions and field names; no message bodies, contact details or tokens.
create function public.audit_phase3() returns trigger language plpgsql security definer set search_path=public as $$
 declare n jsonb=to_jsonb(new);o jsonb=to_jsonb(old);m jsonb;begin
 if tg_op='UPDATE' and n=o then return new;end if;
 select coalesce(jsonb_agg(k),'[]') into m from jsonb_object_keys(coalesce(n,o)) k where (tg_op<>'UPDATE' or n->k is distinct from o->k) and k not in ('encrypted_tokens','body','recipient','consent_record','notes','email','name','company','result','assumption');
 insert into public.audit_events(user_id,entity,record_id,action,metadata) values(coalesce(n->>'user_id',o->>'user_id')::uuid,tg_table_name,coalesce(n->>'id',o->>'id',n->>'user_id',o->>'user_id'),tg_op,jsonb_build_object('changed_fields',m,'from_status',o->>'status','to_status',n->>'status'));
 return coalesce(new,old);end;$$;
revoke all on function public.audit_phase3() from public;
do $$declare t text;begin foreach t in array array['automation_controls','scan_schedules','analysis_jobs','leads','approvals','cash_entries','sales_drafts','outcome_feedback','email_connections'] loop
 execute format('create trigger phase3_audit after insert or update or delete on public.%I for each row execute function public.audit_phase3()',t);
 end loop;end$$;
create function public.budget_usage(p_user uuid,p_since timestamptz) returns bigint language sql stable security invoker set search_path=public as $$
 select coalesce(sum(reserved_microusd+case when created_at>=p_since then spent_microusd else 0 end),0)::bigint from public.ai_costs where user_id=p_user
$$;
-- Called only by bounded, ownership-checked RPCs/triggers. Not directly callable by clients.
create function public.book_ai_cost(p_user uuid,p_id uuid,p_amount integer,p_kind text) returns void language plpgsql security definer set search_path=public as $$
 declare c public.automation_controls;d bigint;m bigint;begin
 insert into public.automation_controls(user_id) values(p_user) on conflict do nothing;
 select * into c from public.automation_controls where user_id=p_user for update;
 select coalesce(sum(reserved_microusd+case when created_at>=date_trunc('day',now()) then spent_microusd else 0 end),0),coalesce(sum(reserved_microusd+case when created_at>=date_trunc('month',now()) then spent_microusd else 0 end),0) into d,m from public.ai_costs where user_id=p_user and id<>p_id;
 if d+p_amount>c.daily_limit_cents*10000 or m+p_amount>c.monthly_limit_cents*10000 then raise exception 'JARVIS_BUDGET_LIMIT';end if;
 insert into public.ai_costs(id,user_id,kind,reserved_microusd) values(p_id,p_user,p_kind,p_amount)
 on conflict(id) do update set reserved_microusd=p_amount,spent_microusd=0,state='reserved',created_at=now(),updated_at=now();
 end;$$;
revoke all on function public.book_ai_cost(uuid,uuid,integer,text) from public;
create function public.reserve_ai_cost(p_amount integer,p_kind text) returns uuid language plpgsql security definer set search_path=public as $$
 declare i uuid=gen_random_uuid();begin
 if auth.uid() is null or p_amount not between 1 and 2000000 or p_kind not in ('chat','agent','proposal') then raise exception 'Invalid cost reservation';end if;
 perform public.book_ai_cost(auth.uid(),i,p_amount,p_kind);return i;end;$$;
create function public.settle_ai_cost(p_id uuid,p_actual integer) returns void language plpgsql security definer set search_path=public as $$
 declare a public.ai_costs;begin
 select * into a from public.ai_costs where id=p_id and user_id=auth.uid() and kind<>'analysis' and state='reserved' for update;
 if not found or p_actual<0 or p_actual>a.reserved_microusd then raise exception 'Invalid settlement';end if;
 update public.ai_costs set spent_microusd=p_actual,reserved_microusd=0,state='settled',updated_at=now() where id=p_id;end;$$;
revoke all on function public.reserve_ai_cost(integer,text),public.settle_ai_cost(uuid,integer),public.budget_usage(uuid,timestamptz) from public;
grant execute on function public.reserve_ai_cost(integer,text),public.settle_ai_cost(uuid,integer),public.budget_usage(uuid,timestamptz) to authenticated;
create function public.analysis_cost_guard() returns trigger language plpgsql security definer set search_path=public as $$
 begin
 if tg_op='INSERT' then perform public.book_ai_cost(new.user_id,new.id,new.budget_cents*10000,'analysis');
 elsif new.status='running' and old.status not in ('running','queued') then perform public.book_ai_cost(new.user_id,new.id,new.budget_cents*10000,'analysis');
 end if;
 if new.status not in ('queued','running') then update public.ai_costs set spent_microusd=new.spent_microusd,reserved_microusd=new.reserved_microusd,state='settled',updated_at=now() where id=new.id and user_id=new.user_id;end if;
 return new;end;$$;
revoke all on function public.analysis_cost_guard() from public;
create trigger analysis_cost_guard before insert or update on public.analysis_jobs for each row execute function public.analysis_cost_guard();
create function public.phase3_reference_guard() returns trigger language plpgsql set search_path=public as $$
 declare n jsonb=to_jsonb(new);begin
 if n->>'opportunity_id' is not null and not exists(select 1 from public.opportunities where id=(n->>'opportunity_id')::uuid and user_id=new.user_id) then raise exception 'Opportunity owner mismatch';end if;
 if n->>'analysis_id' is not null and not exists(select 1 from public.analysis_jobs where id=(n->>'analysis_id')::uuid and user_id=new.user_id and (n->>'opportunity_id' is null or opportunity_id=(n->>'opportunity_id')::uuid)) then raise exception 'Analysis owner or opportunity mismatch';end if;
 if n->>'lead_id' is not null and not exists(select 1 from public.leads where id=(n->>'lead_id')::uuid and user_id=new.user_id) then raise exception 'Lead owner mismatch';end if;
 if n->>'schedule_id' is not null and not exists(select 1 from public.scan_schedules where id=(n->>'schedule_id')::uuid and user_id=new.user_id) then raise exception 'Schedule owner mismatch';end if;
 return new;end;$$;
do $$declare t text;begin foreach t in array array['leads','outcome_feedback','cash_entries','sales_drafts','analysis_jobs'] loop
 execute format('create trigger phase3_reference_guard before insert or update on public.%I for each row execute function public.phase3_reference_guard()',t);end loop;end$$;
create function public.pause_automations() returns trigger language plpgsql security definer set search_path=public as $$
 begin if not new.enabled then update public.analysis_jobs set cancel_requested=true where user_id=new.user_id and schedule_id is not null and status in ('queued','running');end if;return new;end;$$;
revoke all on function public.pause_automations() from public;
create trigger pause_automations after update on public.automation_controls for each row execute function public.pause_automations();
create function public.guard_schedule_count() returns trigger language plpgsql set search_path=public as $$
 begin perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,1));if (select count(*) from public.scan_schedules where user_id=new.user_id)>=5 then raise exception 'Maximum five schedules';end if;return new;end;$$;
create trigger guard_schedule_count before insert on public.scan_schedules for each row execute function public.guard_schedule_count();
-- The privileged worker can operate only scheduled analyses through these existing RPCs.
create function public.analysis_actor(p_id uuid) returns uuid language sql stable security invoker set search_path=public as $$
 select coalesce(auth.uid(),case when coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then (select user_id from public.analysis_jobs where id=p_id and schedule_id is not null) end)
$$;
revoke all on function public.analysis_actor(uuid) from public;
grant execute on function public.analysis_actor(uuid) to authenticated,service_role;
create function public.queue_due_scans() returns jsonb language plpgsql security invoker set search_path=public as $$
 declare s public.scan_schedules;j uuid;items jsonb='[]';begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Worker required';end if;
 for s in select x.* from public.scan_schedules x join public.automation_controls c using(user_id) where x.enabled and c.enabled and x.next_run_at<=now() order by x.next_run_at limit 3 for update of x skip locked loop
 begin
 if exists(select 1 from public.analysis_jobs where user_id=s.user_id and status in ('queued','running')) then continue;end if;
 insert into public.analysis_jobs(user_id,topic,budget_cents,schedule_id,lease_until) values(s.user_id,s.topic,s.budget_cents,s.id,now()+interval '5 minutes') returning id into j;
 update public.scan_schedules set last_run_at=now(),next_run_at=now()+make_interval(days=>s.interval_days),last_error=null where id=s.id;
 items=items||jsonb_build_array(jsonb_build_object('id',j,'user_id',s.user_id));
 exception when others then
 update public.scan_schedules set last_error=case when sqlerrm='JARVIS_BUDGET_LIMIT' then 'Dags- eller månadsbudget räcker inte. Ingen AI-kostnad uppstod.' else 'Körningen kunde inte köas. Kontrollera historik och inställningar.' end,next_run_at=now()+interval '1 day' where id=s.id;
 end;end loop;return items;end;$$;
revoke all on function public.queue_due_scans() from public;
grant execute on function public.queue_due_scans() to service_role;
-- Financial entries are append-only except a documented void. No automatic transaction is made.
create function public.guard_cash_change() returns trigger language plpgsql set search_path=public as $$
 begin if new.voided_at is not distinct from old.voided_at and (to_jsonb(new)-array['lead_id','opportunity_id'])=(to_jsonb(old)-array['lead_id','opportunity_id']) then return new;end if;
 if (to_jsonb(new)-array['voided_at','lead_id','opportunity_id'])<>(to_jsonb(old)-array['voided_at','lead_id','opportunity_id']) or old.voided_at is not null or new.voided_at is null then raise exception 'Cash entries are immutable; void and add a correction';end if;return new;end;$$;
create trigger guard_cash_change before update on public.cash_entries for each row execute function public.guard_cash_change();
-- Lock the exact reviewed content. Approval decisions do not execute a send.
create function public.guard_sales_draft() returns trigger language plpgsql set search_path=public as $$
 declare a public.approvals;begin
 if tg_op='INSERT' and (new.status<>'draft' or new.approval_id is not null) then raise exception 'Draft must start unapproved';end if;
 if tg_op='UPDATE' then
 if old.approval_id is not null and new.approval_id is distinct from old.approval_id then raise exception 'Approval snapshot is immutable';end if;
 if new.status<>old.status and not ((old.status='draft' and new.status='pending') or (old.status='pending' and new.status in ('approved','rejected')) or (old.status='approved' and new.status='sending') or (old.status='sending' and new.status in ('sent','unknown','failed'))) then raise exception 'Invalid draft state transition';end if;
 if old.status in ('sending','sent','unknown','failed') and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Send history is immutable';end if;
 if (new.subject,new.body,new.recipient,new.lead_id,new.content_hash,new.user_id,new.id,new.created_at) is distinct from (old.subject,old.body,old.recipient,old.lead_id,old.content_hash,old.user_id,old.id,old.created_at) then raise exception 'Create a new draft to change reviewed content';end if;
 if new.status='pending' then select * into a from public.approvals where id=new.approval_id and user_id=new.user_id and status='pending' and action_type='outreach';if not found or position(new.content_hash in a.description)=0 or position(new.body in a.description)=0 or position(new.recipient in a.description)=0 then raise exception 'Approval snapshot required';end if;end if;
 if new.status='approved' then select * into a from public.approvals where id=new.approval_id and user_id=new.user_id and status='approved';if not found then raise exception 'Explicit approval required';end if;end if;
 if new.status in ('sending','sent','unknown','failed') and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Only server can send';end if;
 end if;return new;end;$$;
create trigger guard_sales_draft before insert or update on public.sales_drafts for each row execute function public.guard_sales_draft();
create unique index one_draft_per_approval on public.sales_drafts(approval_id) where approval_id is not null;
create function public.decide_sales_draft() returns trigger language plpgsql security definer set search_path=public as $$
 begin if new.status<>old.status then update public.sales_drafts set status=case when new.status='approved' then 'approved' else 'rejected' end,updated_at=now() where approval_id=new.id and user_id=new.user_id and status='pending';end if;return new;end;$$;
revoke all on function public.decide_sales_draft() from public;
create trigger decide_sales_draft after update on public.approvals for each row execute function public.decide_sales_draft();
create function public.claim_sales_send(p_id uuid,p_user uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
 declare d public.sales_drafts;l public.leads;begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Server required';end if;
 select * into d from public.sales_drafts where id=p_id and user_id=p_user for update;
 if not found or d.status<>'approved' then return null;end if;
 select * into l from public.leads where id=d.lead_id and user_id=p_user for update;
 if not found or l.do_not_contact or l.lawful_basis<>'consent' or length(trim(l.consent_record))<5 or l.email<>d.recipient or not exists(select 1 from public.approvals where id=d.approval_id and user_id=p_user and status='approved') then raise exception 'Contact consent or approval unavailable';end if;
 update public.sales_drafts set status='sending',updated_at=now() where id=p_id;return to_jsonb(d);end;$$;
revoke all on function public.claim_sales_send(uuid,uuid) from public;
grant execute on function public.claim_sales_send(uuid,uuid) to service_role;
-- No public RPC may invoke trigger helpers directly.
revoke all on function public.phase3_reference_guard(),public.guard_schedule_count(),public.guard_cash_change(),public.guard_sales_draft() from public;
-- Existing tables and functions need explicit worker grants; no anonymous access is added.
grant select,insert,update on public.analysis_jobs,public.analysis_steps,public.analysis_sources,public.analysis_claims,public.opportunities to service_role;
grant select,update on public.leads,public.approvals to service_role;

create function public.business_similarity(a text,b text) returns numeric language sql immutable set search_path=public as $$
 with x as (select distinct w from regexp_split_to_table(lower(a),'[^a-z0-9åäö]+') w where length(w)>2), y as (select distinct w from regexp_split_to_table(lower(b),'[^a-z0-9åäö]+') w where length(w)>2)
 select (select count(*) from (select w from x intersect select w from y) i)::numeric/greatest(1,(select count(*) from (select w from x union select w from y) u))
$$;
revoke all on function public.business_similarity(text,text) from public;
grant execute on function public.business_similarity(text,text) to authenticated,service_role;

create or replace function public.claim_analysis(p_id uuid,p_token uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
 declare j public.analysis_jobs; begin
 select * into j from public.analysis_jobs where id=p_id and user_id=public.analysis_actor(p_id) for update;
 if not found then return null; end if;
 if j.schedule_id is not null and (not exists(select 1 from public.scan_schedules s join public.automation_controls c using(user_id) where s.id=j.schedule_id and s.user_id=j.user_id and s.enabled and c.enabled) or j.cancel_requested) then return null;end if;
 if j.status not in ('queued','failed') and not (j.status='running' and j.lease_until<now()) then return null; end if;
 if j.spent_microusd+j.reserved_microusd>=j.budget_cents*10000 then raise exception 'Analysis budget exhausted'; end if;
 update public.analysis_jobs set status='running',error=null,lease_token=p_token,lease_until=now()+interval '5 minutes',updated_at=now() where id=p_id returning * into j;
 return to_jsonb(j); end; $$;
create or replace function public.checkpoint_analysis(p_id uuid,p_token uuid,p_position integer,p_result jsonb,p_spent integer,p_reserved integer) returns void language plpgsql security invoker set search_path=public as $$
 declare j public.analysis_jobs; s jsonb; c jsonb; expected text;
 begin
 select * into j from public.analysis_jobs where id=p_id and user_id=public.analysis_actor(p_id) and lease_token=p_token and status='running' and lease_until>now() for update;
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
create or replace function public.finish_analysis(p_id uuid,p_token uuid,p_report jsonb,p_spent integer,p_reserved integer) returns uuid language plpgsql security invoker set search_path=public as $$
 declare j public.analysis_jobs; opportunity uuid; evidence integer; begin
 select * into j from public.analysis_jobs where id=p_id and user_id=public.analysis_actor(p_id) and lease_token=p_token and status='running' and lease_until>now() for update;
 if not found then raise exception 'Analysis lease unavailable'; end if;
 if jsonb_array_length(j.results)<>(case when j.include_sales then 8 else 7 end) or j.results->-1->>'role'<>'jarvis' then raise exception 'Analysis is incomplete'; end if;
 if j.cancel_requested then raise exception 'Analysis cancelled'; end if;
 if p_spent<j.spent_microusd or p_reserved<0 or p_spent+p_reserved>j.budget_cents*10000 then raise exception 'Invalid analysis budget'; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,2));
 select count(distinct statement) into evidence from public.analysis_claims where analysis_id=p_id and user_id=j.user_id and verification='source_quote';
 select id into opportunity from public.opportunities where user_id=j.user_id and origin_analysis_id is not null and (regexp_replace(lower(title),'[^a-z0-9åäö]+',' ','g')=regexp_replace(lower(p_report->'opportunity'->>'title'),'[^a-z0-9åäö]+',' ','g') or (sector=j.topic and public.business_similarity(title,p_report->'opportunity'->>'title')>=0.65)) order by created_at limit 1 for update;
 if opportunity is null then
 insert into public.opportunities(user_id,title,description,sector,score,value,status,source_url,origin_analysis_id,verified_evidence_count)
 values(j.user_id,p_report->'opportunity'->>'title','AI-analys. Betalningsvilja är ej validerad. '||(p_report->>'summary'),j.topic,(p_report->'scorecard'->>'total')::integer,0,'new','',p_id,evidence) returning id into opportunity;
 else
 update public.opportunities set description='Uppdaterad AI-analys. Betalningsvilja är ej validerad. '||(p_report->>'summary'),score=(p_report->'scorecard'->>'total')::integer,origin_analysis_id=p_id,verified_evidence_count=evidence,updated_at=now() where id=opportunity and user_id=j.user_id;
 end if;
 update public.analysis_jobs set status='completed',report=p_report,active_role=null,opportunity_id=opportunity,spent_microusd=p_spent,reserved_microusd=p_reserved,lease_until=null,updated_at=now() where id=p_id;
 return opportunity; end; $$;
grant execute on function public.claim_analysis(uuid,uuid),public.checkpoint_analysis(uuid,uuid,integer,jsonb,integer,integer),public.finish_analysis(uuid,uuid,jsonb,integer,integer) to service_role;

grant execute on function public.budget_usage(uuid,timestamptz) to service_role;

create function public.cash_totals() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('receipts_cents',coalesce(sum(amount_cents) filter(where kind='receipt'),0),'refunds_cents',coalesce(sum(amount_cents) filter(where kind='refund'),0),'costs_cents',coalesce(sum(amount_cents) filter(where kind='cost'),0)) from public.cash_entries where user_id=auth.uid() and voided_at is null
$$;
create function public.opportunity_to_lead(p_id uuid) returns uuid language plpgsql security invoker set search_path=public as $$
 declare o public.opportunities;i uuid;begin
 select * into o from public.opportunities where id=p_id and user_id=auth.uid() for update;if not found then return null;end if;
 select id into i from public.leads where user_id=auth.uid() and opportunity_id=p_id order by created_at limit 1;
 if i is null then insert into public.leads(user_id,name,company,notes,opportunity_id,value) values(auth.uid(),'Ej identifierad','Målgrupp: '||left(o.title,150),'Research-lead, ingen kund eller kontakt är verifierad. '||left(o.description,1500),p_id,0) returning id into i;end if;return i;end;$$;
revoke all on function public.cash_totals(),public.opportunity_to_lead(uuid) from public;
grant execute on function public.cash_totals(),public.opportunity_to_lead(uuid) to authenticated;
create function public.submit_sales_draft(p_id uuid) returns uuid language plpgsql security invoker set search_path=public as $$
 declare d public.sales_drafts;a uuid;begin
 select * into d from public.sales_drafts where id=p_id and user_id=auth.uid() for update;
 if not found or d.status<>'draft' then raise exception 'Unsubmitted draft required';end if;
 insert into public.approvals(user_id,title,description,risk,action_type,amount) values(d.user_id,'Granska mejl: '||d.subject,'Mottagare: '||d.recipient||E'\nÄmne: '||d.subject||E'\n\n'||d.body||E'\n\nInnehållskontroll: '||d.content_hash||E'\nGodkännande skickar inget. Ett separat klick på Skicka krävs.','medium','outreach',0) returning id into a;
 update public.sales_drafts set status='pending',approval_id=a,updated_at=now() where id=p_id;return a;end;$$;
revoke all on function public.submit_sales_draft(uuid) from public;
grant execute on function public.submit_sales_draft(uuid) to authenticated;

create function public.cash_trend() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_agg(jsonb_build_object('day',d::date,'net_cents',coalesce((select sum(case when kind='receipt' then amount_cents else -amount_cents end) from public.cash_entries c where c.user_id=auth.uid() and c.voided_at is null and c.occurred_on=d::date),0)) order by d) from generate_series(current_date-29,current_date,interval '1 day') d
$$;
revoke all on function public.cash_trend() from public;
grant execute on function public.cash_trend() to authenticated;

grant select on public.agent_runs to service_role;
-- Revoke platform default function grants as well as PUBLIC inheritance; grant only intended entry points.
revoke all on function public.audit_phase3(),public.budget_usage(uuid,timestamptz),public.book_ai_cost(uuid,uuid,integer,text),public.reserve_ai_cost(integer,text),public.settle_ai_cost(uuid,integer),public.analysis_cost_guard(),public.phase3_reference_guard(),public.pause_automations(),public.guard_schedule_count(),public.analysis_actor(uuid),public.queue_due_scans(),public.guard_cash_change(),public.guard_sales_draft(),public.decide_sales_draft(),public.claim_sales_send(uuid,uuid),public.business_similarity(text,text),public.cash_totals(),public.cash_trend(),public.opportunity_to_lead(uuid),public.submit_sales_draft(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_ai_cost(integer,text),public.settle_ai_cost(uuid,integer),public.cash_totals(),public.cash_trend(),public.opportunity_to_lead(uuid),public.submit_sales_draft(uuid) to authenticated;
grant execute on function public.budget_usage(uuid,timestamptz),public.analysis_actor(uuid),public.business_similarity(text,text) to authenticated,service_role;
grant execute on function public.queue_due_scans(),public.claim_sales_send(uuid,uuid) to service_role;
create index scan_schedules_owner on public.scan_schedules(user_id,created_at);
create index analysis_schedule_reference on public.analysis_jobs(schedule_id);
create index leads_opportunity_reference on public.leads(opportunity_id);
create index cash_lead_reference on public.cash_entries(lead_id);
create index cash_opportunity_reference on public.cash_entries(opportunity_id);
create index feedback_opportunity_reference on public.outcome_feedback(opportunity_id);
create index feedback_analysis_reference on public.outcome_feedback(analysis_id);
create index drafts_lead_reference on public.sales_drafts(lead_id);
