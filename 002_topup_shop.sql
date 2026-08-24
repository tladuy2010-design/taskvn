create type public.topup_status as enum('pending','paid','rejected','expired');
create table if not exists public.topups(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 amount bigint not null check(amount>=10000), transfer_code text unique not null, status public.topup_status not null default 'pending',
 provider text, provider_tx_id text unique, provider_payload jsonb, admin_note text, created_at timestamptz not null default now(), paid_at timestamptz
);
alter table public.topups enable row level security;
create policy "own topups" on public.topups for select to authenticated using(auth.uid()=user_id);
create policy "admin topups" on public.topups for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in('admin','moderator')));
create or replace function public.create_topup(p_amount bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); r public.topups; code text;
begin if uid is null then raise exception 'Bạn chưa đăng nhập'; end if; if p_amount<10000 then raise exception 'Tối thiểu 10.000đ'; end if; code:='TVN'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
insert into public.topups(user_id,amount,transfer_code) values(uid,p_amount,code) returning * into r; return jsonb_build_object('id',r.id,'amount',r.amount,'transfer_code',r.transfer_code,'status',r.status); end $$;

create or replace function public.approve_topup(p_topup_id uuid,p_note text default null) returns boolean language plpgsql security definer set search_path=public as $$
declare t public.topups; ok boolean;
begin if not exists(select 1 from public.profiles where id=auth.uid() and role in('admin','moderator')) then raise exception 'Không có quyền'; end if; select * into t from public.topups where id=p_topup_id for update; if not found or t.status<>'pending' then return false; end if; insert into public.ledger(user_id,amount,idempotency_key,type) values(t.user_id,t.amount,'topup-'||t.id,'deposit') on conflict(idempotency_key) do nothing; update public.profiles set balance=balance+t.amount where id=t.user_id; update public.topups set status='paid',admin_note=p_note,paid_at=now() where id=t.id; return true; end $$;

create or replace function public.reject_topup(p_topup_id uuid,p_note text) returns boolean language plpgsql security definer set search_path=public as $$
begin if not exists(select 1 from public.profiles where id=auth.uid() and role in('admin','moderator')) then raise exception 'Không có quyền'; end if; update public.topups set status='rejected',admin_note=coalesce(p_note,'Từ chối') where id=p_topup_id and status='pending'; return found; end $$;
insert into public.app_settings(key,value) values
('topup_bank','"Vietcombank"'),('topup_account','"YOUR_ACCOUNT"'),('topup_owner','"TASKVN"'),('topup_note','"Chuyển đúng nội dung do hệ thống cấp"') on conflict(key) do nothing;
