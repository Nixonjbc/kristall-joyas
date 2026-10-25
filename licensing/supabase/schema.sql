-- Kristall / plataforma de licencias, esquema inicial v0.1
-- Ejecutar exclusivamente en un proyecto Supabase administrado por el propietario.
-- NO crea usuarios, no habilita licencias y NO contiene secretos.
-- Las tablas no deben consultarse directamente desde la PWA.
create extension if not exists pgcrypto;

create table if not exists public.license_products (
 id text primary key check (id in ('joyerias','editorial-maestro')),
 display_name text not null
);
insert into public.license_products(id,display_name)
values ('joyerias','Joyerías'),('editorial-maestro','Editorial Maestro')
on conflict (id) do nothing;

create table if not exists public.license_businesses (
 id uuid primary key default gen_random_uuid(),
 product_id text not null references public.license_products(id),
 slug text not null,
 display_name text not null,
 created_at timestamptz not null default now(),
 unique(product_id,slug)
);

create table if not exists public.licenses (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null unique references public.license_businesses(id),
 status text not null default 'pending' check(status in ('pending','active','suspended','revoked')),
 monthly_price_cents integer not null check(monthly_price_cents >= 0),
 currency text not null default 'USD',
 paid_through date,
 authorized_installation_hash text,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.license_activation_codes (
 id uuid primary key default gen_random_uuid(),
 license_id uuid not null references public.licenses(id),
 code_hash text not null unique,
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);

create table if not exists public.license_payments (
 id uuid primary key default gen_random_uuid(),
 license_id uuid not null references public.licenses(id),
 period_start date not null,
 period_end date not null,
 amount_cents integer not null check(amount_cents >= 0),
 currency text not null default 'USD',
 confirmed_at timestamptz not null default now(),
 note text,
 check(period_end >= period_start)
);

create table if not exists public.license_audit (
 id bigint generated always as identity primary key,
 license_id uuid references public.licenses(id),
 action text not null,
 actor_uid uuid,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

-- Defensa por defecto: incluso usuarios autenticados no pueden leer/escribir
-- licencias directamente. Toda operación irá por funciones servidoras
-- que verifiquen el administrador, emitan tokens firmados y registren auditoría.
alter table public.license_products enable row level security;
alter table public.license_businesses enable row level security;
alter table public.licenses enable row level security;
alter table public.license_activation_codes enable row level security;
alter table public.license_payments enable row level security;
alter table public.license_audit enable row level security;

revoke all on public.license_products from anon, authenticated;
revoke all on public.license_businesses from anon, authenticated;
revoke all on public.licenses from anon, authenticated;
revoke all on public.license_activation_codes from anon, authenticated;
revoke all on public.license_payments from anon, authenticated;
revoke all on public.license_audit from anon, authenticated;
revoke all on sequence public.license_audit_id_seq from anon, authenticated;

-- Pendiente en fase siguiente:
-- 1) panel con MFA real, 2) endpoints protegidos,
-- 3) emisión/verificación de códigos y tokens firmados,
-- 4) pruebas de reloj, offline, revocación, y transferencia.
