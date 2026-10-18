-- Enforce decision history and cross-tenant references even for direct SDK calls.
create or replace function public.guard_approval() returns trigger language plpgsql set search_path=public as $$
 begin
 if tg_op='INSERT' and (new.status<>'pending' or new.decided_at is not null) then raise exception 'Approvals must start pending'; end if;
 if tg_op='UPDATE' then
  if old.status<>'pending' then raise exception 'Decisions are immutable'; end if;
  if new.title<>old.title or new.description<>old.description or new.risk<>old.risk or new.action_type<>old.action_type or new.amount<>old.amount or new.user_id<>old.user_id or new.id<>old.id then raise exception 'Approval content is immutable'; end if;
 end if;
 return new; end; $$;
create trigger guard_approval before insert or update on public.approvals for each row execute function public.guard_approval();
create or replace function public.guard_run_owner() returns trigger language plpgsql set search_path=public as $$
 begin
 if new.agent_id is not null and not exists(select 1 from public.agents where id=new.agent_id and user_id=new.user_id) then raise exception 'Agent must belong to run owner'; end if;
 return new; end; $$;
create trigger guard_run_owner before insert or update on public.agent_runs for each row execute function public.guard_run_owner();
-- Explicit grants; RLS remains the authority for every row.
grant usage on schema public to authenticated;
grant select on public.agents,public.opportunities,public.signals,public.leads,public.approvals,public.activities,public.agent_runs,public.messages,public.settings to authenticated;
grant insert on public.agents,public.opportunities,public.signals,public.leads,public.approvals,public.agent_runs,public.messages,public.settings to authenticated;
grant update on public.agents,public.opportunities,public.signals,public.leads,public.approvals,public.agent_runs,public.settings to authenticated;
grant delete on public.agents,public.opportunities,public.signals,public.leads to authenticated;
revoke all on public.ai_requests from authenticated,anon;
