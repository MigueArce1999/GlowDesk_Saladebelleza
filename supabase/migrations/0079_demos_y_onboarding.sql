-- 0079_demos_y_onboarding.sql
-- Tiendas DEMO (prueba de 10 días) frente a tiendas ESTÁNDAR, y onboarding por enlace único.
--
--  * local.plan = 'demo' | 'estandar'. Una demo vive en la instalación compartida de la base
--    (/t/<slug>), usa la vista por defecto de GlowDesk (sin personalizar marca, home ni
--    contenido) y deja de funcionar cuando pasa local.demo_hasta.
--  * La consola activa una solicitud → fn_activar_demo crea el local demo y un enlace único
--    (onboarding_demo.token). Con ese enlace la persona crea su acceso, cuenta su negocio y
--    elige servicios (pantallas "Connect" del Figma). Al registrarse con el correo de la
--    solicitud queda como ADMIN de su tienda.
--  * Una demo vencida es invisible para todos menos la consola: fn_local_id / fn_local_publico
--    no la devuelven, así que todas las políticas por local la bloquean sin tocar cada tabla.

-- ---------------------------------------------------------------------------
-- 1. Plan del local
-- ---------------------------------------------------------------------------
alter table local add column if not exists plan text not null default 'estandar';
alter table local drop constraint if exists local_plan_valido;
alter table local add constraint local_plan_valido check (plan in ('demo', 'estandar'));
alter table local add column if not exists demo_hasta date;
alter table local add column if not exists tipo_negocio text;
alter table local add column if not exists tamano_equipo text;
alter table local add column if not exists onboarding_completado boolean not null default true;

comment on column local.plan is 'demo = prueba de 10 días en la instalación compartida (sin personalización); estandar = cliente con su instalación.';
comment on column local.demo_hasta is 'Último día de la prueba (inclusive). Solo aplica a plan demo.';

create or replace function fn_local_vigente(p_local uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from local l
    where l.id = p_local and l.activo
      and (l.plan <> 'demo' or l.demo_hasta is null or l.demo_hasta >= (now() at time zone 'America/Bogota')::date)
  )
$$;

create or replace function fn_local_es_demo(p_local uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan = 'demo' from local where id = p_local), false)
$$;

-- ---------------------------------------------------------------------------
-- 2. Demo vencida = sin local efectivo (bloquea todas las políticas por local)
-- ---------------------------------------------------------------------------
create or replace function fn_local_id() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_req uuid;
  v uuid;
  n int;
  v_clave text;
  v_cache text;
begin
  if v_uid is null then
    return null;
  end if;
  v_req := fn_local_id_request();
  v_clave := v_uid::text || '|' || coalesce(v_req::text, '-');
  v_cache := current_setting('glowdesk.local_cache', true);
  if v_cache is not null and v_cache <> '' and split_part(v_cache, '=', 1) = v_clave then
    return nullif(split_part(v_cache, '=', 2), '')::uuid;
  end if;

  if v_req is not null then
    select m.local_id into v from membresia m
    where m.usuario_id = v_uid and m.local_id = v_req and m.activo;
  else
    select m.local_id into v from membresia m
    join perfil p on p.id = m.usuario_id and p.local_id = m.local_id
    where m.usuario_id = v_uid and m.activo;
    if v is null then
      select count(*) into n from membresia m where m.usuario_id = v_uid and m.activo;
      if n = 1 then
        select m.local_id into v from membresia m where m.usuario_id = v_uid and m.activo;
      end if;
    end if;
  end if;

  if v is not null and not fn_local_vigente(v) then
    v := null;
  end if;

  perform set_config('glowdesk.local_cache', v_clave || '=' || coalesce(v::text, ''), true);
  return v;
end;
$$;

-- Local pedido por el header, solo si sigue vigente (para visitantes anónimos).
create or replace function fn_local_request_vigente() returns uuid
language sql stable security definer set search_path = public as $$
  select case when fn_local_vigente(r) then r end
  from (select fn_local_id_request() as r) x
$$;

create or replace function fn_local_publico() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(fn_local_request_vigente(), fn_local_id())
$$;

create or replace function fn_local_efectivo() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v uuid;
  n int;
begin
  v := coalesce(fn_local_id(), fn_local_request_vigente());
  if v is not null then
    return v;
  end if;
  if fn_local_id_request() is not null then
    return null; -- pidió un local concreto que no está vigente: no adivinar otro
  end if;
  select count(*) into n from local where activo;
  if n = 1 then
    select id into v from local where activo limit 1;
    return v;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Una demo no personaliza: home y contenido quedan en la vista por defecto
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['configuracion_homepage', 'contenido_pagina'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on %I', t || '_demo_sin_personalizar_ins', t);
    execute format('drop policy if exists %I on %I', t || '_demo_sin_personalizar_upd', t);
    execute format('drop policy if exists %I on %I', t || '_demo_sin_personalizar_del', t);
    execute format('create policy %I on %I as restrictive for insert with check (not fn_local_es_demo(local_id) or fn_es_super_admin())', t || '_demo_sin_personalizar_ins', t);
    execute format('create policy %I on %I as restrictive for update using (not fn_local_es_demo(local_id) or fn_es_super_admin())', t || '_demo_sin_personalizar_upd', t);
    execute format('create policy %I on %I as restrictive for delete using (not fn_local_es_demo(local_id) or fn_es_super_admin())', t || '_demo_sin_personalizar_del', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Información pública de una tienda (para arrancar la base por /t/<slug>)
-- ---------------------------------------------------------------------------
create or replace function fn_info_tienda(p_slug text default null, p_id uuid default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id,
    'nombre', l.nombre,
    'slug', l.slug,
    'plan', l.plan,
    'demo_hasta', l.demo_hasta,
    'vigente', fn_local_vigente(l.id),
    'activo', l.activo,
    'onboarding_completado', l.onboarding_completado
  )
  from local l
  where (p_slug is not null and l.slug = lower(trim(p_slug)))
     or (p_id is not null and l.id = p_id)
  limit 1
$$;
grant execute on function fn_info_tienda(text, uuid) to anon, authenticated;

-- Tiendas a las que pertenece la persona (selector después de iniciar sesión).
create or replace function fn_mis_tiendas() returns table (
  local_id uuid, nombre text, slug text, plan text, demo_hasta date, vigente boolean,
  url_sitio text, logo_url text, rol rol_usuario
)
language sql stable security definer set search_path = public as $$
  select l.id, l.nombre, l.slug, l.plan, l.demo_hasta, fn_local_vigente(l.id), l.url_sitio,
         case when l.plan = 'demo' then null else l.logo_url end, m.rol
  from membresia m
  join local l on l.id = m.local_id
  where m.usuario_id = auth.uid() and m.activo and l.activo
  order by case m.rol when 'admin' then 0 when 'empleada' then 1 else 2 end, l.nombre
$$;
grant execute on function fn_mis_tiendas() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Enlace único de onboarding
-- ---------------------------------------------------------------------------
create table if not exists onboarding_demo (
  token text primary key,
  solicitud_id uuid references solicitud_acceso (id) on delete set null,
  local_id uuid not null references local (id) on delete cascade,
  email text not null,
  nombre_contacto text,
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null default now() + interval '7 days',
  cuenta_en timestamptz,
  completado_en timestamptz
);
create index if not exists onboarding_demo_email_idx on onboarding_demo (lower(email));
create index if not exists onboarding_demo_solicitud_idx on onboarding_demo (solicitud_id);

alter table onboarding_demo enable row level security;
revoke all on onboarding_demo from anon, authenticated;
grant select on onboarding_demo to authenticated;
drop policy if exists onboarding_demo_super_admin on onboarding_demo;
create policy onboarding_demo_super_admin on onboarding_demo for select using (fn_es_super_admin());

create or replace function fn_slug_unico(p_texto text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_base text;
  v text;
  i int := 1;
begin
  v_base := lower(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
  v_base := trim(both '-' from regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'tienda'; end if;
  v_base := left(v_base, 40);
  v := v_base;
  while exists (select 1 from local where slug = v) loop
    i := i + 1;
    v := v_base || '-' || i;
  end loop;
  return v;
end;
$$;

-- La consola acepta una solicitud: local demo de 10 días + enlace único. Idempotente.
create or replace function fn_activar_demo(p_solicitud_id uuid, p_dias int default 10)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s solicitud_acceso;
  v_local uuid;
  v_token text;
  v_hasta date := (now() at time zone 'America/Bogota')::date + greatest(1, p_dias);
begin
  if not fn_es_super_admin() then
    raise exception 'Solo la plataforma puede activar demos.';
  end if;
  select * into s from solicitud_acceso where id = p_solicitud_id for update;
  if not found then
    raise exception 'La solicitud no existe.';
  end if;

  select o.local_id, o.token into v_local, v_token
  from onboarding_demo o where o.solicitud_id = s.id
  order by o.creado_en desc limit 1;

  if v_local is null then
    v_local := fn_provisionar_local(s.negocio, fn_slug_unico(s.negocio));
    update local set
      plan = 'demo', demo_hasta = v_hasta, tipo_negocio = s.tipo_negocio, tamano_equipo = s.tamano_equipo,
      onboarding_completado = false, email_contacto = s.email,
      razon_social = s.razon_social, nit = s.nit
    where id = v_local;
  else
    update local set demo_hasta = greatest(coalesce(demo_hasta, v_hasta), v_hasta) where id = v_local;
  end if;

  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into onboarding_demo (token, solicitud_id, local_id, email, nombre_contacto)
    values (v_token, s.id, v_local, lower(trim(s.email)), s.nombre_contacto);
  else
    update onboarding_demo set expira_en = greatest(expira_en, now() + interval '7 days') where token = v_token;
  end if;

  update solicitud_acceso
    set estado = 'activada', prueba_hasta = (select demo_hasta from local where id = v_local)
  where id = s.id;

  return jsonb_build_object(
    'local_id', v_local,
    'slug', (select slug from local where id = v_local),
    'token', v_token,
    'demo_hasta', (select demo_hasta from local where id = v_local)
  );
end;
$$;
grant execute on function fn_activar_demo(uuid, int) to authenticated;

-- Pasar una tienda de demo a estándar (cuando paga): queda sin vencimiento.
create or replace function fn_pasar_a_estandar(p_local uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not fn_es_super_admin() then
    raise exception 'Solo la plataforma puede cambiar el plan.';
  end if;
  update local set plan = 'estandar', demo_hasta = null where id = p_local;
end;
$$;
grant execute on function fn_pasar_a_estandar(uuid) to authenticated;

-- Lo que ve la página /configurar/<token> antes de iniciar sesión.
create or replace function fn_onboarding_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o onboarding_demo;
  l local;
  s solicitud_acceso;
begin
  select * into o from onboarding_demo where token = p_token;
  if not found then
    return jsonb_build_object('valido', false, 'motivo', 'no_existe');
  end if;
  select * into l from local where id = o.local_id;
  if o.solicitud_id is not null then
    select * into s from solicitud_acceso where id = o.solicitud_id;
  end if;
  return jsonb_build_object(
    'valido', o.expira_en > now() and l.activo,
    'motivo', case when o.expira_en <= now() then 'expirado' when not l.activo then 'inactivo' end,
    'email', o.email,
    'nombre_contacto', o.nombre_contacto,
    'cuenta_existe', exists (select 1 from auth.users u where lower(u.email) = o.email),
    'cuenta_lista', o.cuenta_en is not null,
    'completado', o.completado_en is not null,
    'local_id', l.id,
    'slug', l.slug,
    'negocio', l.nombre,
    'tipo_negocio', l.tipo_negocio,
    'tamano_equipo', coalesce(l.tamano_equipo, s.tamano_equipo),
    'demo_hasta', l.demo_hasta
  );
end;
$$;
grant execute on function fn_onboarding_info(text) to anon, authenticated;

-- Quien abre el enlace y ya tiene sesión con el correo de la solicitud queda como admin.
create or replace function fn_onboarding_reclamar(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o onboarding_demo;
  v_email text;
begin
  select * into o from onboarding_demo where token = p_token;
  if not found or o.expira_en <= now() then
    raise exception 'El enlace no es válido o ya venció.';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null or v_email <> o.email then
    raise exception 'Este enlace es para %. Inicia sesión con ese correo.', o.email;
  end if;
  insert into membresia (usuario_id, local_id, rol) values (auth.uid(), o.local_id, 'admin')
  on conflict (usuario_id, local_id) do update set rol = 'admin', activo = true, actualizado_en = now();
  insert into cliente (usuario_id, nombre, email, local_id)
  select auth.uid(), coalesce(pf.nombre, o.nombre_contacto, split_part(v_email, '@', 1)), v_email, o.local_id
  from perfil pf where pf.id = auth.uid()
    and not exists (select 1 from cliente c where c.usuario_id = auth.uid() and c.local_id = o.local_id);
  perform fn_espejar_perfil_legado(auth.uid(), o.local_id, 'admin');
  update onboarding_demo set cuenta_en = coalesce(cuenta_en, now()) where token = p_token;
  return jsonb_build_object('local_id', o.local_id, 'slug', (select slug from local where id = o.local_id));
end;
$$;
grant execute on function fn_onboarding_reclamar(text) to authenticated;

-- Pasos 1 y 2: datos del negocio y áreas de servicio (catálogo inicial a valorar).
create or replace function fn_onboarding_guardar(
  p_token text,
  p_negocio text,
  p_tipo text,
  p_equipo text,
  p_areas text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o onboarding_demo;
  v_area text;
  v_cat uuid;
  v_orden int := 0;
  v_servicios int := 0;
  v_svc text[];
  v_nombre_svc text;
begin
  select * into o from onboarding_demo where token = p_token for update;
  if not found or o.expira_en <= now() then
    raise exception 'El enlace no es válido o ya venció.';
  end if;
  if length(trim(coalesce(p_negocio, ''))) < 2 then
    raise exception 'Escribe el nombre del negocio.';
  end if;
  if cardinality(coalesce(p_areas, '{}')) > 20 then
    raise exception 'Demasiadas áreas.';
  end if;

  update local set
    nombre = left(trim(p_negocio), 120),
    nombre_corto = left(upper(regexp_replace(trim(p_negocio), '(\w)\w*\s*', '\1', 'g')), 4),
    tipo_negocio = left(nullif(trim(coalesce(p_tipo, '')), ''), 60),
    tamano_equipo = left(nullif(trim(coalesce(p_equipo, '')), ''), 20),
    onboarding_completado = true
  where id = o.local_id;

  -- Catálogo inicial solo la primera vez (si la tienda aún no tiene servicios).
  if not exists (select 1 from servicio where local_id = o.local_id) then
    foreach v_area in array coalesce(p_areas, '{}') loop
      v_area := left(trim(v_area), 60);
      continue when v_area = '';
      v_orden := v_orden + 1;
      select id into v_cat from categoria_servicio where local_id = o.local_id and nombre = v_area;
      if v_cat is null then
        insert into categoria_servicio (nombre, orden_visualizacion, local_id)
        values (v_area, v_orden, o.local_id) returning id into v_cat;
      end if;
      v_svc := case v_area
        when 'Cabello' then array['Corte', 'Blower', 'Color', 'Tratamiento capilar']
        when 'Uñas' then array['Manicure', 'Pedicure', 'Semipermanente']
        when 'Cejas y pestañas' then array['Diseño de cejas', 'Depilación con hilo', 'Lifting de pestañas']
        when 'Maquillaje' then array['Maquillaje social', 'Maquillaje de novia']
        when 'Estética' then array['Limpieza facial', 'Depilación con cera']
        when 'Masaje' then array['Masaje relajante', 'Masaje descontracturante']
        when 'Barbería' then array['Corte de cabello', 'Arreglo de barba', 'Corte y barba']
        else array[]::text[]
      end;
      foreach v_nombre_svc in array v_svc loop
        insert into servicio (categoria_id, nombre, duracion_minutos, tipo_precio, precio, local_id)
        values (v_cat, v_nombre_svc, 60, 'a_valorar', null, o.local_id);
        v_servicios := v_servicios + 1;
      end loop;
    end loop;
  end if;

  update onboarding_demo set completado_en = now() where token = p_token;
  return jsonb_build_object('local_id', o.local_id, 'slug', (select slug from local where id = o.local_id), 'servicios_creados', v_servicios);
end;
$$;
grant execute on function fn_onboarding_guardar(text, text, text, text, text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Registro: el correo de un onboarding vigente entra como ADMIN de su demo
-- ---------------------------------------------------------------------------
create or replace function fn_manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_local uuid;
  v_n int;
  v_onb onboarding_demo;
  v_rol rol_usuario := 'cliente';
begin
  v_nombre := coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1));

  -- Solo cuando se registra desde el enlace (token en metadata) o sin pedir otro local.
  select * into v_onb from onboarding_demo
  where email = lower(new.email) and expira_en > now()
    and (token = new.raw_user_meta_data ->> 'onboarding'
         or (coalesce(new.raw_user_meta_data ->> 'local_id', '') = '' and fn_local_id_request() is null))
  order by (token = new.raw_user_meta_data ->> 'onboarding') desc nulls last, creado_en desc limit 1;

  if found then
    v_local := v_onb.local_id;
    v_rol := 'admin';
    v_nombre := coalesce(new.raw_user_meta_data ->> 'nombre', v_onb.nombre_contacto, v_nombre);
  else
    begin
      v_local := nullif(new.raw_user_meta_data ->> 'local_id', '')::uuid;
    exception when invalid_text_representation then
      v_local := null;
    end;
    if v_local is null then
      v_local := fn_local_id_request();
    end if;
    if v_local is null then
      select count(*) into v_n from local where activo;
      if v_n = 1 then
        select id into v_local from local where activo limit 1;
      end if;
    end if;
  end if;

  if v_local is null or not exists (select 1 from local where id = v_local and activo) then
    raise exception 'Falta el identificador del local para crear la cuenta.';
  end if;

  insert into perfil (id, nombre, rol, local_id) values (new.id, v_nombre, v_rol, v_local);
  insert into membresia (usuario_id, local_id, rol) values (new.id, v_local, v_rol)
  on conflict (usuario_id, local_id) do update set rol = excluded.rol;
  insert into cliente (usuario_id, nombre, email, telefono, local_id)
  values (new.id, v_nombre, new.email, new.raw_user_meta_data ->> 'telefono', v_local);
  if v_onb.token is not null then
    update onboarding_demo set cuenta_en = now() where token = v_onb.token;
  end if;
  return new;
end;
$$;
