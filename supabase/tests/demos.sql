-- 0075: demos de 10 días + onboarding por enlace único. Corre después de solicitudes.sql.
\set ON_ERROR_STOP on
create or replace function pg_temp.como(p_uid uuid, p_local uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
  perform set_config('request.jwt.claim.role', case when p_uid is null then 'anon' else 'authenticated' end, false);
  perform set_config('request.headers', case when p_local is null then '{}' else json_build_object('x-local-id', p_local)::text end, false);
  perform set_config('glowdesk.local_cache', '', false);
end;
$$;
create or replace function pg_temp.afirmar(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FALLO DE PRUEBA: %', p_msg; end if;
  raise notice 'OK: %', p_msg;
end;
$$;

select pg_temp.afirmar((select count(*) from local where plan <> 'estandar') = 0, 'los locales existentes quedan como estándar');

-- Nueva solicitud y activación desde la consola.
select pg_temp.como(null, null);
set role anon;
insert into solicitud_acceso (nombre_contacto, email, whatsapp, negocio, tipo_negocio, ciudad, sedes, tamano_equipo, acepta_terminos)
values ('Dana Ríos', 'Dana@Spa.co', '3001112233', 'Spa Ñandú', 'Spa', 'Medellín', '1', '2-5', true);
reset role;

-- Un admin de salón no puede activar demos.
select pg_temp.como('aaaaaaaa-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b');
set role authenticated;
do $$ begin
  perform fn_activar_demo((select id from solicitud_acceso where negocio = 'Spa Ñandú'));
  raise exception 'FALLO DE PRUEBA: admin de salón activó una demo';
exception when raise_exception then
  if sqlerrm like 'FALLO%' then raise; end if;
  raise notice 'OK: solo la plataforma activa demos';
end $$;
reset role;

select pg_temp.como('aaaaaaaa-0000-0000-0000-0000000000aa', null);
set role authenticated;
select fn_activar_demo((select id from solicitud_acceso where negocio = 'Spa Ñandú')) as j1 \gset
select fn_activar_demo((select id from solicitud_acceso where negocio = 'Spa Ñandú')) as j2 \gset
reset role;
select pg_temp.afirmar((:'j1'::jsonb->>'slug') = 'spa-nandu', 'slug limpio a partir del nombre');
select pg_temp.afirmar(:'j1'::jsonb->>'token' = (:'j2'::jsonb->>'token'), 'activar dos veces es idempotente (mismo enlace)');
select pg_temp.afirmar(length(:'j1'::jsonb->>'token') = 64, 'token largo e impredecible');
select pg_temp.afirmar((select count(*) from local where slug like 'spa-nandu%') = 1, 'no duplica el local');
select pg_temp.afirmar((select plan = 'demo' and demo_hasta = (now() at time zone 'America/Bogota')::date + 10 and not onboarding_completado
  from local where slug = 'spa-nandu'), 'local demo con 10 días');
select pg_temp.afirmar((select estado = 'activada' and prueba_hasta is not null from solicitud_acceso where negocio = 'Spa Ñandú'), 'solicitud marcada activada');

-- El enlace (anónimo) muestra la info.
select pg_temp.como(null, null);
set role anon;
select pg_temp.afirmar((select (fn_onboarding_info(:'j1'::jsonb->>'token'))->>'valido') = 'true'
  and (select (fn_onboarding_info(:'j1'::jsonb->>'token'))->>'email') = 'dana@spa.co', 'enlace válido muestra el correo');
select pg_temp.afirmar((fn_onboarding_info('no-existe'))->>'valido' = 'false', 'token inventado no es válido');
select pg_temp.afirmar((fn_info_tienda('spa-nandu'))->>'plan' = 'demo', 'info pública de la tienda dice demo');
reset role;

-- Se registra con el enlace → admin de su demo.
insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-0000-0000-000000000001', 'dana@spa.co',
        jsonb_build_object('nombre', 'Dana', 'onboarding', :'j1'::jsonb->>'token'));
select pg_temp.afirmar((select rol = 'admin' from membresia where usuario_id = 'dddddddd-0000-0000-0000-000000000001'
  and local_id = (select id from local where slug = 'spa-nandu')), 'registrarse con el enlace da admin de la demo');

-- Pasos 1 y 2.
select pg_temp.como(null, null);
set role anon;
select pg_temp.afirmar((fn_onboarding_guardar(:'j1'::jsonb->>'token', 'Spa Ñandú Centro', 'Spa', '2-5',
  array['Uñas', 'Masaje']))->>'servicios_creados' = '5', 'crea el catálogo inicial por áreas');
reset role;
select pg_temp.afirmar((select nombre = 'Spa Ñandú Centro' and onboarding_completado from local where slug = 'spa-nandu'), 'guarda el nombre del negocio');
select pg_temp.afirmar((select count(*) from servicio s join local l on l.id = s.local_id where l.slug = 'spa-nandu' and s.tipo_precio = 'a_valorar') = 5,
  'servicios iniciales quedan a valorar');

-- Como admin de la demo: ve sus tiendas, opera, pero no personaliza.
select pg_temp.como('dddddddd-0000-0000-0000-000000000001', (select id from local where slug = 'spa-nandu'));
set role authenticated;
select pg_temp.afirmar((select count(*) from fn_mis_tiendas() where plan = 'demo' and vigente) = 1, 'fn_mis_tiendas lista la demo');
select pg_temp.afirmar(fn_es_admin(), 'es admin de su demo');
select pg_temp.afirmar((select count(*) from servicio) = 5, 've sus servicios');
update servicio set precio = 50000, tipo_precio = 'fijo' where nombre = 'Manicure';
select pg_temp.afirmar((select precio from servicio where nombre = 'Manicure') = 50000, 'puede editar servicios');
update configuracion_homepage set hero_imagen_url = 'https://x/y.png';
select pg_temp.afirmar(not exists (select 1 from configuracion_homepage where hero_imagen_url = 'https://x/y.png'), 'una demo no personaliza la home');
reset role;

-- Vence: deja de tener acceso.
update local set demo_hasta = (now() at time zone 'America/Bogota')::date - 1 where slug = 'spa-nandu';
select pg_temp.como('dddddddd-0000-0000-0000-000000000001', (select id from local where slug = 'spa-nandu'));
set role authenticated;
select pg_temp.afirmar(fn_local_id() is null, 'demo vencida no tiene local efectivo');
select pg_temp.afirmar(not fn_es_admin(), 'demo vencida ya no es admin');
select pg_temp.afirmar((select count(*) from servicio) = 0, 'demo vencida no ve datos');
select pg_temp.afirmar((select count(*) from fn_mis_tiendas() where not vigente) = 1, 'sigue listada como vencida');
reset role;
select pg_temp.como(null, (select id from local where slug = 'spa-nandu'));
set role anon;
select pg_temp.afirmar(fn_local_publico() is null, 'público tampoco ve la demo vencida');
reset role;

-- La plataforma la pasa a estándar: vuelve a funcionar sin vencimiento.
select pg_temp.como('aaaaaaaa-0000-0000-0000-0000000000aa', null);
set role authenticated;
select fn_pasar_a_estandar((select id from local where slug = 'spa-nandu'));
reset role;
select pg_temp.como('dddddddd-0000-0000-0000-000000000001', (select id from local where slug = 'spa-nandu'));
set role authenticated;
select pg_temp.afirmar(fn_es_admin(), 'al pasar a estándar recupera el acceso');
reset role;

-- Otros salones siguen igual.
select pg_temp.como('aaaaaaaa-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.afirmar(fn_es_admin() and fn_local_id() = 'b0000000-0000-0000-0000-00000000000b', 'salones estándar no se ven afectados');
reset role;
select pg_temp.como(null, null);
\echo '=== OK: demos y onboarding ==='
