alter table public.agent_runs add column input text not null default '';
alter table public.agent_runs add column model text not null default '';
alter table public.opportunities add column origin_run_id uuid references public.agent_runs(id) on delete set null;
alter table public.signals add column origin_run_id uuid references public.agent_runs(id) on delete set null;
alter table public.approvals add column origin_run_id uuid references public.agent_runs(id) on delete set null;
-- Atomic report persistence: either all generated drafts and the completed run
-- are saved, or no output is saved. This function uses the caller's RLS context.
create or replace function public.complete_agent_run(p_run_id uuid,p_report jsonb,p_tokens integer)
returns void language plpgsql security invoker set search_path=public as $$
 declare owner_id uuid; item jsonb;
 begin
 select user_id into owner_id from public.agent_runs where id=p_run_id and user_id=auth.uid() and status='running' for update;
 if owner_id is null then raise exception 'Active run not found'; end if;
 if jsonb_typeof(p_report->'signals') is distinct from 'array' or jsonb_typeof(p_report->'opportunities') is distinct from 'array' or jsonb_typeof(p_report->'approvals') is distinct from 'array' then raise exception 'Invalid report'; end if;
 if jsonb_array_length(p_report->'signals')>3 or jsonb_array_length(p_report->'opportunities')>3 or jsonb_array_length(p_report->'approvals')>3 then raise exception 'Report too large'; end if;
 for item in select * from jsonb_array_elements(p_report->'signals') loop
  insert into public.signals(origin_run_id,user_id,title,description,sector,strength,source_url,published_at) values(p_run_id,owner_id,item->>'title',item->>'description',item->>'sector',item->>'strength',item->>'source_url',now());
 end loop;
 for item in select * from jsonb_array_elements(p_report->'opportunities') loop
  insert into public.opportunities(origin_run_id,user_id,title,description,sector,score,value,status,source_url) values(p_run_id,owner_id,item->>'title',item->>'description',item->>'sector',(item->>'score')::integer,(item->>'value')::numeric,'new',coalesce(item->>'source_url',''));
 end loop;
 for item in select * from jsonb_array_elements(p_report->'approvals') loop
  insert into public.approvals(origin_run_id,user_id,title,description,risk,action_type,amount,status) values(p_run_id,owner_id,item->>'title',item->>'description',item->>'risk',item->>'action_type',(item->>'amount')::numeric,'pending');
 end loop;
 update public.agent_runs set status='completed',output=p_report->>'summary',tokens=greatest(0,p_tokens),completed_at=now() where id=p_run_id;
 end; $$;
create or replace function public.save_chat_exchange(p_question text,p_answer text)
returns void language plpgsql security invoker set search_path=public as $$
 begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(p_question) not between 1 and 4000 or length(p_answer) not between 1 and 15000 then raise exception 'Invalid message size'; end if;
 insert into public.messages(user_id,role,content) values(auth.uid(),'user',p_question),(auth.uid(),'assistant',p_answer);
 end; $$;
revoke all on function public.complete_agent_run(uuid,jsonb,integer) from public;
revoke all on function public.save_chat_exchange(text,text) from public;
grant execute on function public.complete_agent_run(uuid,jsonb,integer) to authenticated;
grant execute on function public.save_chat_exchange(text,text) to authenticated;
create or replace function public.guard_origin_run() returns trigger language plpgsql set search_path=public as $$
 begin
 if new.origin_run_id is not null and not exists(select 1 from public.agent_runs where id=new.origin_run_id and user_id=new.user_id) then raise exception 'Source run must belong to record owner'; end if;
 return new; end; $$;
create trigger guard_origin_run before insert or update on public.opportunities for each row execute function public.guard_origin_run();
create trigger guard_origin_run before insert or update on public.signals for each row execute function public.guard_origin_run();
create trigger guard_origin_run before insert or update on public.approvals for each row execute function public.guard_origin_run();
