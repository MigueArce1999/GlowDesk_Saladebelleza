-- 0085_arreglar_timeout_vista_comision.sql
-- "Mis ventas y ganancias" (empleada/Ventas.tsx) está dando "canceling statement due to
-- statement timeout" al cargar, incluso para el filtro "Hoy" — las empleadas ya no pueden ver
-- sus comisiones de ningún periodo.
--
-- Causa: vista_comision (0083) calcula metodos_pago con DOS subconsultas independientes contra
-- `pago` por cada fila (una para el total `tp` vía lateral join, otra para el jsonb_agg `pg`) —
-- cada una vuelve a evaluar la policy pago_select, que llama fn_atencion_visible() y esa función
-- hace hasta 4 exists() más. Con meses de datos acumulados, ese costo por fila (duplicado) ya no
-- cabe en el statement_timeout de Supabase, aunque el filtro de fecha debería limitar las filas —
-- el plan no siempre logra empujar el filtro de profesional_id/creado_en antes de pagar ese costo
-- por fila. Se arregla reduciendo a UN solo scan/evaluación de RLS contra `pago` por fila (el
-- total ahora sale de un sum(...) over(), ventana sobre el mismo resultado, no de una segunda
-- consulta) y agregando el índice compuesto que le permite al planner resolver "mis comisiones de
-- hoy/esta semana" con un index scan directo en vez de escanear toda la tabla `comision`.

create index if not exists comision_profesional_creado_idx on comision (profesional_id, creado_en);

drop view if exists vista_comision;

create view vista_comision with (security_invoker = true) as
select
  co.id, co.atencion_servicio_id, co.atencion_producto_id, co.profesional_id, co.base_calculo,
  co.valor, co.estado, co.creado_en,
  coalesce(a_serv.id, a_prod.id) as atencion_id,
  ase.nombre_snapshot as servicio_nombre,
  ap.nombre as producto_nombre,
  coalesce(a_serv.cliente_id, a_prod.cliente_id) as cliente_id,
  c.nombre as cliente_nombre,
  pagos.metodos_pago
from comision co
left join atencion_servicio ase on ase.id = co.atencion_servicio_id
left join atencion a_serv on a_serv.id = ase.atencion_id
left join atencion_producto ap on ap.id = co.atencion_producto_id
left join atencion a_prod on a_prod.id = ap.atencion_id
join cliente c on c.id = coalesce(a_serv.cliente_id, a_prod.cliente_id)
left join lateral (
  select jsonb_agg(jsonb_build_object('metodo', pg.metodo, 'monto', round(co.valor * pg.monto / pg.total, 2))) as metodos_pago
  from (
    select metodo, monto, nullif(sum(monto) over (), 0) as total
    from pago
    where atencion_id = coalesce(a_serv.id, a_prod.id)
  ) pg
) pagos on true;

grant select on vista_comision to anon, authenticated;
