-- FormalizaAI MVP: datos privados por usuario.
-- Las tablas se exponen solo a usuarios autenticados y cada politica valida
-- la propiedad de la fila con auth.uid().

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 120),
  region text,
  actividad text,
  telefono text,
  empresa text,
  estado text not null default 'Inicio',
  porcentaje smallint not null default 0 check (porcentaje between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  respuestas jsonb not null default '{}'::jsonb,
  resultado jsonb not null default '{}'::jsonb,
  porcentaje smallint not null check (porcentaje between 0 and 100),
  riesgo text not null,
  created_at timestamptz not null default now()
);

create table public.document_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  portfolio jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  source text not null default 'local' check (source in ('local', 'xai', 'system', 'error')),
  created_at timestamptz not null default now()
);

create index diagnoses_user_id_created_at_idx
  on public.diagnoses (user_id, created_at desc);
create index chat_messages_user_id_created_at_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.diagnoses enable row level security;
alter table public.document_portfolios enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.diagnoses from anon, authenticated;
revoke all on table public.document_portfolios from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert on table public.diagnoses to authenticated;
grant select, insert, update, delete on table public.document_portfolios to authenticated;
grant select, insert, delete on table public.chat_messages to authenticated;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "diagnoses_select_own"
  on public.diagnoses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "diagnoses_insert_own"
  on public.diagnoses for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "portfolios_select_own"
  on public.document_portfolios for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "portfolios_insert_own"
  on public.document_portfolios for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "portfolios_update_own"
  on public.document_portfolios for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "portfolios_delete_own"
  on public.document_portfolios for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "chat_select_own"
  on public.chat_messages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "chat_insert_own"
  on public.chat_messages for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "chat_delete_own"
  on public.chat_messages for delete to authenticated
  using ((select auth.uid()) = user_id);
