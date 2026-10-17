-- 0081_vista_atencion_producto_comision.sql
-- vista_atencion_producto (0019) no traía vendedora_id/es_venta_tienda (agregados en 0075) ni
-- su comisión: "Productos vendidos" en Admin → Ventas listaba la venta de Tienda, pero sin quién
-- la vendió ni cuánto le quedó de comisión — la comisión SÍ se generaba bien (vista_comision ya
-- la expone en "Mis ventas" de la empleada), solo faltaba mostrarla también acá, en el mismo
-- lugar donde admin ya revisa servicios cobrados. Mismo criterio que vista_atencion_servicio:
-- trae comision_total ya sumada, para no repetir ese join en el frontend.
drop view vista_atencion_producto;

create view vista_atencion_producto with (security_invoker = true) as
select
  ap.id, ap.atencion_id, ap.categoria, ap.nombre, ap.cantidad, ap.precio_unitario,
  (ap.cantidad * ap.precio_unitario) as subtotal,
  ap.vendedora_id, vp.nombre as vendedora_nombre, ap.es_venta_tienda,
  coalesce((select sum(co.valor) from comision co where co.atencion_producto_id = ap.id), 0) as comision_total,
  a.cliente_id, c.nombre as cliente_nombre, a.estado as atencion_estado,
  a.creado_en as atencion_creado_en, a.completado_en as atencion_completado_en
from atencion_producto ap
join atencion a on a.id = ap.atencion_id
join cliente c on c.id = a.cliente_id
left join vista_profesional vp on vp.id = ap.vendedora_id;

grant select on vista_atencion_producto to anon, authenticated;
