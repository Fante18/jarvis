-- Apply in a new Supabase project. All access is scoped to auth.uid().
create extension if not exists pgcrypto;
create table public.agents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null, description text not null default '', kind text not null check(kind in ('research','opportunity','sales')),
 status text not null default 'paused' check(status in ('active','paused')), budget_cents integer not null default 50 check(budget_cents between 1 and 100000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.opportunities (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 title text not null, description text not null default '', sector text not null, score integer not null check(score between 0 and 100),
 value numeric not null default 0 check(value between 0 and 1e12), status text not null default 'new' check(status in ('new','analyzing','qualified','archived')),
 source_url text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.signals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 title text not null, description text not null default '', sector text not null, strength text not null check(strength in ('high','medium','low')),
 source_url text not null check(source_url like 'https://%'), published_at timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.leads (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null, company text not null, email text not null default '', value numeric not null default 0 check(value between 0 and 1e12),
 stage text not null default 'new' check(stage in ('new','contacted','proposal','won','lost')), notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.approvals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 title text not null, description text not null, risk text not null check(risk in ('low','medium','high')),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 action_type text not null check(action_type in ('research','outreach','investment')), amount numeric not null default 0 check(amount between 0 and 1e12),
 decided_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((status='pending' and decided_at is null) or (status<>'pending' and decided_at is not null))
);
create table public.activities (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 title text not null, description text not null default '', kind text not null, created_at timestamptz not null default now()
);
create table public.agent_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 agent_id uuid references public.agents on delete set null, status text not null check(status in ('running','completed','failed')),
 output text not null default '', error text, tokens integer not null default 0, completed_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index one_running_agent_per_user on public.agent_runs(user_id) where status='running';
create table public.messages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 role text not null check(role in ('user','assistant')), content text not null, created_at timestamptz not null default now()
);
create table public.settings (
 user_id uuid primary key references auth.users on delete cascade, workspace_name text not null default 'Min arbetsyta',
 focus_sectors text not null default 'AI, SaaS, hållbarhet', currency text not null default 'SEK' check(currency='SEK'), updated_at timestamptz not null default now()
);
create table public.ai_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 created_at timestamptz not null default now()
);
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
create or replace function public.audit_record() returns trigger language plpgsql security definer set search_path=public as $$
 begin
 insert into public.activities(user_id,title,description,kind) values(coalesce(new.user_id,old.user_id),case tg_op when 'INSERT' then 'Ny post skapad' when 'UPDATE' then 'Post uppdaterad' else 'Post borttagen' end,tg_table_name||' · '||coalesce(to_jsonb(new)->>'title',to_jsonb(new)->>'name',to_jsonb(old)->>'title',to_jsonb(old)->>'name',''),tg_table_name);
 return coalesce(new,old); end; $$;
do $$ declare t text; begin
 foreach t in array array['agents','opportunities','signals','leads','approvals','activities','agent_runs','messages','settings','ai_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create index on public.%I(user_id)',t);
 execute format('create policy owner_select on public.%I for select to authenticated using (auth.uid()=user_id)',t);
 if t<>'activities' then
 execute format('create policy owner_insert on public.%I for insert to authenticated with check (auth.uid()=user_id)',t);
 end if;
 if t=any(array['agents','opportunities','signals','leads','approvals','agent_runs','settings']) then
 execute format('create policy owner_update on public.%I for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id)',t);
 end if;
 if t=any(array['agents','opportunities','signals','leads']) then
 execute format('create policy owner_delete on public.%I for delete to authenticated using (auth.uid()=user_id)',t);
 end if;
 if t=any(array['agents','opportunities','signals','leads','approvals','settings']) then
 execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()',t);
 end if;
 if t=any(array['agents','opportunities','signals','leads','approvals']) then
 execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_record()',t);
 end if;
 end loop; end $$;
-- Atomic per-account AI rate limit; no service-role credential required.
create or replace function public.reserve_ai_request() returns boolean language plpgsql security definer set search_path=public as $$
 declare n integer; begin
 if auth.uid() is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select count(*) into n from public.ai_requests where user_id=auth.uid() and created_at>now()-interval '1 hour';
 if n>=10 then return false; end if;
 insert into public.ai_requests(user_id) values(auth.uid()); return true;
 end; $$;
revoke all on function public.reserve_ai_request() from public;
grant execute on function public.reserve_ai_request() to authenticated;
revoke all on function public.audit_record() from public;
-- Private, user-scoped research file storage. No public download URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('research','research',false,5242880,array['application/pdf','text/plain','text/csv']) on conflict(id) do nothing;
create policy research_read on storage.objects for select to authenticated using(bucket_id='research' and (storage.foldername(name))[1]=auth.uid()::text);
create policy research_insert on storage.objects for insert to authenticated with check(bucket_id='research' and (storage.foldername(name))[1]=auth.uid()::text);
create policy research_delete on storage.objects for delete to authenticated using(bucket_id='research' and (storage.foldername(name))[1]=auth.uid()::text);
