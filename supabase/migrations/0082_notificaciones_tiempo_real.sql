-- 0082_notificaciones_tiempo_real.sql
-- Notificaciones en vivo para admin: nueva reserva, nueva venta (atención cobrada) y nueva
-- clienta registrada, con sonido — ver lib/notificaciones/useEventosEnVivo.ts.
--
-- A diferencia de GlowDesk Live (0062), que deliberadamente usa un "pulso" sin datos de negocio
-- porque esa suscripción es pública/anónima, acá quien escucha es siempre un admin autenticado:
-- reserva/atencion/cliente ya tienen RLS que solo deja ver las filas de SU local (reserva_select,
-- atencion_select, cliente_select — 0014/0050), y Realtime respeta esa misma RLS por suscriptor.
-- No hace falta ninguna tabla intermedia: suscribirse directo a las tablas reales es seguro aquí
-- porque el filtro de seguridad ya existe y ya se prueba en RLS, no en el canal.

-- replica identity full en atencion: sin esto, el payload "old" de un UPDATE solo trae la
-- primary key, y el frontend necesita old.estado para distinguir "se acaba de completar el
-- cobro" (dispara "nueva venta") de cualquier otra edición de la atención (notas, borrador key).
alter table atencion replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reserva'
  ) then
    alter publication supabase_realtime add table reserva;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atencion'
  ) then
    alter publication supabase_realtime add table atencion;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cliente'
  ) then
    alter publication supabase_realtime add table cliente;
  end if;
exception when undefined_object then
  -- En un Postgres local de pruebas (sin el proyecto Realtime de Supabase) la publicación
  -- supabase_realtime no existe; en un proyecto Supabase real siempre está creada de fábrica.
  raise notice 'Publicación supabase_realtime no existe en este entorno (esperado fuera de Supabase) — se omite.';
end $$;
