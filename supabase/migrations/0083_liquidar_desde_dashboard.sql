-- 0083_liquidar_desde_dashboard.sql
-- Dashboard → Equipo: al tocar una profesional se abre un panel para ver y liquidar sus
-- comisiones del periodo, igual que ya existía en Admin → Comisiones y en "Mis ventas" de la
-- propia empleada — esto no es un módulo nuevo, es la MISMA vista_comision (y fn_crear_liquidacion,
-- sin tocar) alcanzable también desde el Dashboard, con el desglose por método de pago que pedía
-- el diseño ("Lo que se lleva, según cómo pagó el cliente").
--
-- atencion_id: para que el frontend pueda agrupar/enlazar sin adivinar cuál de los dos ids
-- (atencion_servicio_id / atencion_producto_id) trae el id de la atención.
--
-- metodos_pago: cómo se reparte ESTA comisión entre los métodos de pago de su atención,
-- prorrateado por la participación de cada pago en el total cobrado de esa atención — mismo
-- criterio que ya usa fn_completar_y_cobrar_atencion para prorratear la comisión contra lo
-- efectivamente cobrado (nunca el precio nominal). La inmensa mayoría de atenciones tiene un
-- solo pago, así que esto casi siempre es "100% un método"; con pago dividido, se reparte en
-- la misma proporción, como ya advierte el texto del panel.
drop view vista_comision;

create view vista_comision with (security_invoker = true) as
select
  co.id, co.atencion_servicio_id, co.atencion_producto_id, co.profesional_id, co.base_calculo,
  co.valor, co.estado, co.creado_en,
  coalesce(a_serv.id, a_prod.id) as atencion_id,
  ase.nombre_snapshot as servicio_nombre,
  ap.nombre as producto_nombre,
  coalesce(a_serv.cliente_id, a_prod.cliente_id) as cliente_id,
  c.nombre as cliente_nombre,
  (
    select jsonb_agg(jsonb_build_object('metodo', pg.metodo, 'monto', round(co.valor * pg.monto / tp.total, 2)))
    from pago pg
    where pg.atencion_id = coalesce(a_serv.id, a_prod.id)
  ) as metodos_pago
from comision co
left join atencion_servicio ase on ase.id = co.atencion_servicio_id
left join atencion a_serv on a_serv.id = ase.atencion_id
left join atencion_producto ap on ap.id = co.atencion_producto_id
left join atencion a_prod on a_prod.id = ap.atencion_id
join cliente c on c.id = coalesce(a_serv.cliente_id, a_prod.cliente_id)
left join lateral (
  select nullif(sum(monto), 0) as total from pago where atencion_id = coalesce(a_serv.id, a_prod.id)
) tp on true;

grant select on vista_comision to anon, authenticated;
