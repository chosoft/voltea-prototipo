-- Esquema del prototipo Voltea · Equipo 6 · Experimentación y Estrategia de Negocio (Icesi 2026-2)
-- Visitantes (rol anon): solo pueden INSERTAR. Nadie anónimo puede leer.
-- Backoffice: usuarios autenticados cuyo correo esté en public.admins.

create table if not exists public.admins (
  email text primary key,
  creado timestamptz not null default now()
);

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  sesion text not null check (char_length(sesion) between 8 and 64),
  tipo text not null check (tipo in (
    'visita','seccion_vista','cta_click','calculadora_usada','plan_armado',
    'formulario_iniciado','lead_enviado','cupo_apartado','faq_abierta'
  )),
  datos jsonb not null default '{}'::jsonb check (pg_column_size(datos) < 4000),
  entrevistador text check (char_length(entrevistador) <= 40),
  origen text check (char_length(origen) <= 80),
  dispositivo text check (char_length(dispositivo) <= 20)
);
create index if not exists eventos_sesion_idx on public.eventos (sesion);
create index if not exists eventos_creado_idx on public.eventos (creado desc);

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  sesion text not null check (char_length(sesion) between 8 and 64),
  nombre text not null check (char_length(nombre) between 2 and 80),
  negocio text not null check (char_length(negocio) between 2 and 100),
  tipo_negocio text check (char_length(tipo_negocio) <= 40),
  ciudad text check (char_length(ciudad) <= 40),
  whatsapp text not null check (char_length(whatsapp) between 7 and 20),
  correo text check (correo is null or char_length(correo) <= 120),
  rol text check (char_length(rol) <= 40),
  factura_mensual integer check (factura_mensual between 0 and 500000000),
  franja_preferida text check (char_length(franja_preferida) <= 40),
  fecha_preferida date,
  modulos jsonb not null default '[]'::jsonb check (pg_column_size(modulos) < 2000),
  total_mensual integer check (total_mensual between 0 and 10000000),
  acepta_precio boolean not null default false,
  consentimiento boolean not null check (consentimiento),
  cupo_apartado boolean not null default false,
  comentario text check (char_length(comentario) <= 500),
  entrevistador text check (char_length(entrevistador) <= 40),
  origen text check (char_length(origen) <= 80)
);

alter table public.admins enable row level security;
alter table public.eventos enable row level security;
alter table public.leads enable row level security;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.email = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "anon inserta eventos" on public.eventos;
create policy "anon inserta eventos" on public.eventos for insert to anon, authenticated with check (true);
drop policy if exists "admin lee eventos" on public.eventos;
create policy "admin lee eventos" on public.eventos for select to authenticated using (public.es_admin());
drop policy if exists "admin borra eventos" on public.eventos;
create policy "admin borra eventos" on public.eventos for delete to authenticated using (public.es_admin());

drop policy if exists "anon inserta leads" on public.leads;
create policy "anon inserta leads" on public.leads for insert to anon, authenticated with check (true);
drop policy if exists "admin lee leads" on public.leads;
create policy "admin lee leads" on public.leads for select to authenticated using (public.es_admin());
drop policy if exists "admin borra leads" on public.leads;
create policy "admin borra leads" on public.leads for delete to authenticated using (public.es_admin());

drop policy if exists "admin se ve" on public.admins;
create policy "admin se ve" on public.admins for select to authenticated using (public.es_admin());

-- Marcar el lead de una sesión como "cupo apartado" sin darle UPDATE general al anónimo.
create or replace function public.apartar_cupo(p_sesion text) returns void
language sql security definer set search_path = public as $$
  update public.leads set cupo_apartado = true where sesion = p_sesion;
$$;
revoke all on function public.apartar_cupo(text) from public;
grant execute on function public.apartar_cupo(text) to anon, authenticated;

revoke all on public.eventos, public.leads, public.admins from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant insert on public.eventos, public.leads to anon, authenticated;
grant select, delete on public.eventos, public.leads to authenticated;
grant select on public.admins to authenticated;
