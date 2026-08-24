create extension if not exists pgcrypto;
create type public.user_role as enum('user','admin','moderator','banned'); create type public.task_status as enum('active','paused','closed'); create type public.claim_status as enum('started','pending_verification','verified','manual_review','rejected','paid'); create type public.ledger_type as enum('task_reward','deposit','withdrawal','adjustment','refund');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text,display_name text,role public.user_role default 'user',balance bigint not null default 0 check(balance>=0),referral_code text unique,level int default 1,exp int default 0,created_at timestamptz default now());
create table public.tasks(id uuid primary key default gen_random_uuid(),title text not null,description text,provider text not null,external_task_id text,url text not null,reward bigint not null check(reward>0),status public.task_status default 'active',created_at timestamptz default now());
create table public.task_claims(id uuid primary key default gen_random_uuid(),task_id uuid references public.tasks on delete cascade,user_id uuid references public.profiles on delete cascade,provider text,external_claim_id text,status public.claim_status default 'started',risk_score int default 0,verification_payload jsonb,started_at timestamptz default now(),verified_at timestamptz,payout_at timestamptz,paid_at timestamptz,reward bigint default 0);
create table public.ledger(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles on delete cascade,claim_id uuid references public.task_claims,amount bigint not null,idempotency_key text unique not null,type public.ledger_type not null,created_at timestamptz default now());
create table public.app_settings(key text primary key,value jsonb not null);
insert into public.app_settings values('risk_threshold','70'),('payout_enabled','true') on conflict do nothing;
alter table public.profiles enable row level security; alter table public.tasks enable row level security; alter table public.task_claims enable row level security; alter table public.ledger enable row level security;
create policy "own profile" on public.profiles for select to authenticated using(auth.uid()=id); create policy "active tasks" on public.tasks for select to authenticated using(status='active'); create policy "own claims" on public.task_claims for select to authenticated using(auth.uid()=user_id); create policy "own claim insert" on public.task_claims for insert to authenticated with check(auth.uid()=user_id); create policy "own ledger" on public.ledger for select to authenticated using(auth.uid()=user_id);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,email,display_name,referral_code) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','TaskVN User'),'TVN-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))); return new; end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create or replace function public.pay_verified_claim_now(p_claim_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r record; ins int;
begin
  select c.id,c.user_id,c.reward,c.status,c.risk_score
    into r
    from public.task_claims c
   where c.id=p_claim_id
   for update;
  if not found or r.status <> 'verified' then return false; end if;
  if r.risk_score >= 70 then
    update public.task_claims set status='manual_review' where id=p_claim_id;
    return false;
  end if;
  insert into public.ledger(user_id,claim_id,amount,idempotency_key,type)
  values(r.user_id,r.id,r.reward,'claim-payout-'||r.id,'task_reward')
  on conflict(idempotency_key) do nothing;
  get diagnostics ins=row_count;
  if ins=1 then
    update public.profiles set balance=balance+r.reward where id=r.user_id;
  end if;
  update public.task_claims
     set status='paid', paid_at=now(), payout_at=now()
   where id=p_claim_id;
  return true;
end$$;

alter table public.tasks add column if not exists task_type text not null default 'code' check(task_type in ('code','review'));
create table if not exists public.task_proofs(
 id uuid primary key default gen_random_uuid(), claim_id uuid references public.task_claims(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade, storage_path text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 admin_note text, created_at timestamptz default now(), reviewed_at timestamptz);
alter table public.task_proofs enable row level security;
create policy "own proofs" on public.task_proofs for select to authenticated using(auth.uid()=user_id);
create policy "own proof insert" on public.task_proofs for insert to authenticated with check(auth.uid()=user_id);

create table if not exists public.task_codes(
 id uuid primary key default gen_random_uuid(), task_id uuid references public.tasks(id) on delete cascade,
 code text unique not null, used boolean default false, used_by uuid references public.profiles(id), used_at timestamptz);
alter table public.task_codes enable row level security;
create policy "task codes server only" on public.task_codes for select to authenticated using(false);

create or replace function public.approve_review_claim(p_claim_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare r record;
begin
 select c.id,c.reward,c.status,c.risk_score into r from public.task_claims c where c.id=p_claim_id for update;
 if not found or r.status <> 'started' then return false; end if;
 if r.risk_score >= 70 then update public.task_claims set status='manual_review' where id=p_claim_id; return false; end if;
 update public.task_claims set status='verified',verified_at=now(),payout_at=now()+interval '4 days' where id=p_claim_id;
 return true;
end$$;

-- Admin hierarchy
alter table public.profiles add column if not exists is_owner boolean not null default false;

-- The owner flag is intentionally server-managed. Do NOT expose an UPDATE policy for it.
create or replace function public.is_admin_owner()
returns boolean language sql security definer stable set search_path=public as $$
  select coalesce((select is_owner from public.profiles where id=auth.uid()),false);
$$;
