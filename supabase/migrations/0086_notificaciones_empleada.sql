-- 0086_notificaciones_empleada.sql
-- Notificación en tiempo real para empleadas: cuando admin cierra el cobro de un servicio o
-- colaboración suyo (fn_completar_y_cobrar_atencion ya inserta una fila en `comision` por cada
-- profesional que participó — colaboraciones incluidas), ella se entera al instante con sonido
-- y, si el navegador lo permite, vibración — ver lib/notificaciones/useEventosEnVivo.ts
-- (useComisionesEnVivo).
--
-- `atencion` no tiene profesional_id (vive en atencion_servicio/atencion_producto), así que no
-- se puede filtrar una suscripción de Realtime "solo mis atenciones" directo en esa tabla. Pero
-- `comision` sí tiene profesional_id, ya protegido por RLS (comision_select, 0014) — mismo
-- criterio de seguridad que ya usa 0082 para admin, solo que acá el filtro es por fila en vez de
-- por local completo.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comision'
  ) then
    alter publication supabase_realtime add table comision;
  end if;
exception when undefined_object then
  raise notice 'Publicación supabase_realtime no existe en este entorno (esperado fuera de Supabase) — se omite.';
end $$;
