
create type if not exists public.withdrawal_status as enum('pending','risk_review','approved','processing','paid','rejected');
create table if not exists public.withdrawals(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 amount bigint not null check(amount>=70000),
 method text not null,
 receiver text not null,
 status public.withdrawal_status not null default 'pending',
 risk_score int not null default 0,
 provider_tx_id text unique,
 admin_note text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 paid_at timestamptz
);
alter table public.withdrawals enable row level security;
create policy "own withdrawals" on public.withdrawals for select to authenticated using(auth.uid()=user_id);
create table if not exists public.admin_logs(
 id uuid primary key default gen_random_uuid(), admin_id uuid references public.profiles(id),
 action text not null, target_id text, detail jsonb, created_at timestamptz default now()
);
alter table public.admin_logs enable row level security;
create policy "admin logs admin only" on public.admin_logs for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

create or replace function public.create_withdrawal(p_amount bigint,p_method text,p_receiver text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); bal bigint; wid uuid;
begin
 if uid is null then raise exception 'Bạn chưa đăng nhập'; end if;
 if p_amount<70000 then raise exception 'Tối thiểu 70.000 coin'; end if;
 if length(trim(p_receiver))<4 then raise exception 'Thông tin nhận tiền không hợp lệ'; end if;
 select balance into bal from profiles where id=uid for update;
 if bal is null or bal<p_amount then raise exception 'Số dư không đủ'; end if;
 update profiles set balance=balance-p_amount where id=uid;
 insert into withdrawals(user_id,amount,method,receiver,status) values(uid,p_amount,p_method,trim(p_receiver),'pending') returning id into wid;
 insert into ledger(user_id,amount,idempotency_key,type) values(uid,-p_amount,'withdraw-reserve-'||wid,'withdrawal');
 return jsonb_build_object('id',wid,'status','pending');
end$$;

create or replace function public.admin_set_withdrawal(p_id uuid,p_status withdrawal_status,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
 if not exists(select 1 from profiles where id=uid and role='admin') then raise exception 'Không có quyền'; end if;
 update withdrawals set status=p_status,admin_note=p_note,reviewed_at=now() where id=p_id and status not in ('paid','rejected');
 insert into admin_logs(admin_id,action,target_id,detail) values(uid,'withdrawal_status',p_id::text,jsonb_build_object('status',p_status,'note',p_note));
 return found;
end$$;

insert into app_settings(key,value) values
('ai_enabled','true'),('withdrawal_min','70000'),('review_delay_days','4')
on conflict(key) do nothing;
