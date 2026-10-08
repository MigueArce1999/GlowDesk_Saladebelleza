-- 0080_inventario_productos.sql
-- Módulo de inventario de productos en Admin. No crea un catálogo paralelo: extiende `producto`
-- (0044 — hasta ahora solo usado por el asistente de voz para buscar/sugerir) con cantidad en
-- existencia y umbral mínimo, y agrega `movimiento_inventario` como bitácora de entradas,
-- salidas y ajustes — mismo criterio que ya usa el proyecto para cualquier cosa que cambie un
-- número con dinero/cantidad de por medio (movimiento_puntos, gasto_pago, caja_movimiento):
-- nunca se pisa el valor directo desde el cliente, siempre queda un registro de qué pasó.
--
-- Fuera de alcance a propósito (MVP): no se conecta todavía con `atencion_producto` para
-- descontar stock automáticamente al vender — esa línea sigue guardando categoria/nombre como
-- texto libre, sin producto_id, así que enlazarla es un cambio más grande que el módulo de
-- inventario en sí. Si hace falta, es un siguiente paso aparte.

-- --------------------------------------------------------------------------------------------
-- 1. Cantidad en existencia en el catálogo de productos
-- --------------------------------------------------------------------------------------------
alter table producto
  add column cantidad_actual numeric(12,2) not null default 0 check (cantidad_actual >= 0),
  add column cantidad_minima numeric(12,2) not null default 0 check (cantidad_minima >= 0),
  add column unidad_medida text not null default 'unidad';

comment on column producto.cantidad_actual is 'Existencia actual. Nunca se actualiza directo desde el cliente: siempre vía fn_ajustar_inventario, que deja bitácora en movimiento_inventario.';
comment on column producto.cantidad_minima is 'Umbral para avisar "hay que reabastecer" en el panel de inventario (0 = sin aviso).';

-- --------------------------------------------------------------------------------------------
-- 2. Bitácora de movimientos (entrada, salida, ajuste manual)
-- --------------------------------------------------------------------------------------------
create table movimiento_inventario (
  id uuid primary key default gen_random_uuid(),
  local_id uuid references local (id),
  producto_id uuid not null references producto (id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste')),
  -- Delta realmente aplicado a cantidad_actual (negativo en una salida, o en un ajuste a la baja)
  -- — nunca el valor crudo que mandó quien lo registró, para que sumar esta columna por producto
  -- siempre reconstruya el histórico real sin tener que distinguir el tipo aparte.
  cantidad numeric(12,2) not null check (cantidad <> 0),
  cantidad_resultante numeric(12,2) not null,
  motivo text,
  creado_por uuid references perfil (id),
  creado_en timestamptz not null default now()
);

create index movimiento_inventario_producto_idx on movimiento_inventario (producto_id, creado_en desc);

alter table movimiento_inventario enable row level security;

-- Mismo patrón que gasto_pago/caja_movimiento: solo administración ve y toca la bitácora de
-- inventario (nunca se expone a empleadas, que no deben poder "ajustar" existencias a mano).
create policy movimiento_inventario_admin on movimiento_inventario for all
  using (fn_es_admin()) with check (fn_es_admin());

grant select, insert on movimiento_inventario to authenticated;

-- local_id lo hereda de producto_id, igual que atencion_servicio/atencion_producto heredan de
-- atencion_id (ver 0050) — así nunca hay que mandarlo a mano desde la RPC.
create trigger movimiento_inventario_heredar_local
  before insert on movimiento_inventario
  for each row execute function fn_heredar_local('producto', 'producto_id');

-- RLS restrictiva por local — mismo criterio que toda tabla "privada" (admin-only) de 0050.
create policy movimiento_inventario_local_privado on movimiento_inventario as restrictive for all to public
  using (local_id = fn_local_id()) with check (local_id = coalesce(fn_local_id(), fn_local_publico()));

-- --------------------------------------------------------------------------------------------
-- 3. fn_ajustar_inventario: único camino para cambiar cantidad_actual. Calcula el delta real
--    según el tipo, nunca deja existencia negativa, y dentro de la misma transacción actualiza
--    producto y deja la fila en movimiento_inventario — las dos cosas quedan consistentes o
--    ninguna, igual que fn_completar_y_cobrar_atencion hace con pago/comision/puntos.
-- --------------------------------------------------------------------------------------------
create or replace function fn_ajustar_inventario(
  p_producto_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_motivo text default null
) returns producto
language plpgsql security definer set search_path = public as $$
declare
  v_producto producto;
  v_delta numeric(12,2);
  v_nueva numeric(12,2);
begin
  if not fn_es_admin() then
    raise exception 'Solo administración puede ajustar el inventario';
  end if;
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento inválido: %', p_tipo;
  end if;

  select * into v_producto from producto where id = p_producto_id for update;
  if v_producto is null then
    raise exception 'El producto no existe';
  end if;

  if p_tipo = 'entrada' then
    if p_cantidad <= 0 then
      raise exception 'La cantidad de una entrada debe ser mayor a cero';
    end if;
    v_nueva := v_producto.cantidad_actual + p_cantidad;
  elsif p_tipo = 'salida' then
    if p_cantidad <= 0 then
      raise exception 'La cantidad de una salida debe ser mayor a cero';
    end if;
    v_nueva := v_producto.cantidad_actual - p_cantidad;
    if v_nueva < 0 then
      raise exception 'No hay suficiente existencia: quedan % y se intentó sacar %', v_producto.cantidad_actual, p_cantidad;
    end if;
  else -- ajuste: p_cantidad es la existencia nueva, no un delta
    if p_cantidad < 0 then
      raise exception 'La existencia no puede quedar en negativo';
    end if;
    v_nueva := p_cantidad;
  end if;

  v_delta := v_nueva - v_producto.cantidad_actual;
  if v_delta = 0 then
    raise exception 'Este ajuste no cambia la existencia actual';
  end if;

  update producto set cantidad_actual = v_nueva, actualizado_en = now()
  where id = p_producto_id
  returning * into v_producto;

  insert into movimiento_inventario (producto_id, tipo, cantidad, cantidad_resultante, motivo, creado_por)
  values (p_producto_id, p_tipo, v_delta, v_nueva, nullif(trim(coalesce(p_motivo, '')), ''), auth.uid());

  return v_producto;
end;
$$;

grant execute on function fn_ajustar_inventario to authenticated;
