-- 0087_editar_venta_productos.sql
-- "Editar venta" (admin → Ventas) solo dejaba corregir las líneas de SERVICIO de la atención —
-- si lo que estaba mal era un producto (categoría, nombre, cantidad, precio, quién lo vendió en
-- Tienda), no había forma de arreglarlo sin borrar la venta entera. Se extiende fn_editar_venta
-- para aceptar también líneas de atencion_producto, con el mismo criterio que ya usa para
-- servicios: no toca el pago ya recibido, solo corrige la línea y recalcula su comisión (si es
-- venta de Tienda) como si esa línea sola cubriera su propio monto — sin prorratear contra el
-- pago real, igual que ya hace la rama de servicios.
--
-- fn_venta_protegida también se extiende: una venta con una comisión de Tienda ya liquidada
-- queda protegida igual que una con comisión de servicio liquidada (antes solo miraba
-- atencion_servicio, dejando pasar por alto el caso de Tienda).

create or replace function fn_venta_protegida(p_atencion_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from atencion_servicio ase
    join comision c on c.atencion_servicio_id = ase.id
    where ase.atencion_id = p_atencion_id and c.estado = 'liquidada'
  ) or exists (
    select 1 from atencion_producto ap
    join comision c on c.atencion_producto_id = ap.id
    where ap.atencion_id = p_atencion_id and c.estado = 'liquidada'
  )
$$;

-- Agregar un parámetro cambia la firma (nombre + tipos de argumentos): "create or replace"
-- no reemplaza la función vieja en ese caso, deja las DOS coexistiendo como sobrecargas —
-- de ahí el drop explícito antes de recrearla con el nuevo parámetro.
drop function if exists fn_editar_venta(uuid, uuid, text, jsonb);

create or replace function fn_editar_venta(
  p_atencion_id uuid,
  p_cliente_id uuid,
  p_notas text,
  p_lineas jsonb, -- [{id, profesional_id, precio_snapshot, descuento, cantidad}]
  p_productos jsonb default '[]'::jsonb -- [{id, categoria, nombre, cantidad, precio_unitario, vendedora_id}]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_anterior uuid;
  v_local_id uuid;
  v_config_negocio configuracion_negocio;
  v_linea jsonb;
  v_ase atencion_servicio;
  v_precio numeric(12,2);
  v_descuento numeric(12,2);
  v_cantidad int;
  v_profesional_id uuid;
  v_monto numeric(12,2);
  v_regla regla_comision;
  v_regla_encontrada boolean;
  v_valor_comision numeric(12,2);
  v_comision_id uuid;
  v_producto jsonb;
  v_ap atencion_producto;
  v_categoria text;
  v_nombre text;
  v_precio_unitario numeric(12,2);
  v_vendedora_id uuid;
begin
  if not fn_es_admin() then
    raise exception 'Solo administración puede editar una venta';
  end if;

  select cliente_id, local_id into v_cliente_anterior, v_local_id from atencion where id = p_atencion_id;
  if v_cliente_anterior is null then
    raise exception 'La venta ya no existe';
  end if;

  if fn_venta_protegida(p_atencion_id) then
    raise exception 'Esta venta ya fue liquidada a la profesional; no se puede editar. Habla con administración si de verdad hay que corregirla.';
  end if;

  update atencion set cliente_id = p_cliente_id, notas = p_notas where id = p_atencion_id;

  for v_linea in select jsonb_array_elements(p_lineas) loop
    select * into v_ase from atencion_servicio
    where id = (v_linea ->> 'id')::uuid and atencion_id = p_atencion_id;
    if not found then
      raise exception 'Esa línea ya no pertenece a esta venta';
    end if;

    v_precio := coalesce((v_linea ->> 'precio_snapshot')::numeric, v_ase.precio_snapshot);
    v_descuento := coalesce((v_linea ->> 'descuento')::numeric, v_ase.descuento);
    v_cantidad := coalesce((v_linea ->> 'cantidad')::int, v_ase.cantidad);
    v_profesional_id := coalesce((v_linea ->> 'profesional_id')::uuid, v_ase.profesional_id);

    update atencion_servicio
    set precio_snapshot = v_precio, descuento = v_descuento, cantidad = v_cantidad, profesional_id = v_profesional_id
    where id = v_ase.id;

    v_monto := round((v_precio - v_descuento) * v_cantidad, 2);
    select id into v_comision_id from comision where atencion_servicio_id = v_ase.id;

    if v_ase.es_colaboracion then
      -- Ganancia completa (100%) para quien colaboró, igual que al cobrar (0020).
      if v_comision_id is not null then
        update comision set profesional_id = v_profesional_id, base_calculo = v_monto, valor = v_monto,
          regla_aplicada = jsonb_build_object('tipo', 'colaboracion_100', 'valor', 100)
        where id = v_comision_id;
      else
        insert into comision (atencion_servicio_id, profesional_id, regla_aplicada, base_calculo, valor)
        values (v_ase.id, v_profesional_id, jsonb_build_object('tipo', 'colaboracion_100', 'valor', 100), v_monto, v_monto);
      end if;
    else
      select * into v_regla from regla_comision
      where profesional_id = v_profesional_id
        and (servicio_id = v_ase.servicio_id or servicio_id is null)
        and vigente_hasta is null
      order by servicio_id nulls last
      limit 1;
      v_regla_encontrada := found;

      if v_regla_encontrada and v_monto > 0 then
        v_valor_comision := case when v_regla.tipo = 'porcentaje'
          then round(v_monto * v_regla.valor / 100, 2)
          else v_regla.valor end;

        if v_comision_id is not null then
          update comision set profesional_id = v_profesional_id, regla_aplicada = to_jsonb(v_regla),
            base_calculo = v_monto, valor = v_valor_comision
          where id = v_comision_id;
        else
          insert into comision (atencion_servicio_id, profesional_id, regla_aplicada, base_calculo, valor)
          values (v_ase.id, v_profesional_id, to_jsonb(v_regla), v_monto, v_valor_comision);
        end if;
      elsif v_comision_id is not null then
        -- Ya no hay regla vigente para la nueva profesional/servicio: sin comisión.
        delete from comision where id = v_comision_id;
      end if;
    end if;
  end loop;

  -- Productos (0087): misma filosofía que servicios — cada línea se trata como si ella sola
  -- cubriera su propio monto, sin prorratear contra lo efectivamente cobrado (acá no se toca el
  -- pago). Solo las marcadas es_venta_tienda generan/actualizan comisión; el resto son inventario
  -- de la visita, sin comisión que recalcular.
  if jsonb_array_length(p_productos) > 0 then
    select * into v_config_negocio from configuracion_negocio where local_id = v_local_id;
  end if;

  for v_producto in select jsonb_array_elements(p_productos) loop
    select * into v_ap from atencion_producto
    where id = (v_producto ->> 'id')::uuid and atencion_id = p_atencion_id;
    if not found then
      raise exception 'Ese producto ya no pertenece a esta venta';
    end if;

    v_categoria := coalesce(v_producto ->> 'categoria', v_ap.categoria);
    v_nombre := coalesce(v_producto ->> 'nombre', v_ap.nombre);
    v_cantidad := coalesce((v_producto ->> 'cantidad')::int, v_ap.cantidad);
    v_precio_unitario := coalesce((v_producto ->> 'precio_unitario')::numeric, v_ap.precio_unitario);
    v_vendedora_id := coalesce(nullif(v_producto ->> 'vendedora_id', '')::uuid, v_ap.vendedora_id);

    if v_ap.es_venta_tienda and v_vendedora_id is null then
      raise exception 'Una venta de Tienda necesita quién la vendió';
    end if;

    update atencion_producto
    set categoria = v_categoria, nombre = v_nombre, cantidad = v_cantidad, precio_unitario = v_precio_unitario, vendedora_id = v_vendedora_id
    where id = v_ap.id;

    select id into v_comision_id from comision where atencion_producto_id = v_ap.id;

    if v_ap.es_venta_tienda then
      v_monto := round(v_precio_unitario * v_cantidad, 2);
      if v_monto > 0 then
        v_valor_comision := round(v_monto * coalesce(v_config_negocio.comision_tienda_porcentaje, 10) / 100, 2);
        if v_comision_id is not null then
          update comision set profesional_id = v_vendedora_id,
            regla_aplicada = jsonb_build_object('tipo', 'tienda_producto', 'porcentaje', coalesce(v_config_negocio.comision_tienda_porcentaje, 10), 'origen', 'tienda'),
            base_calculo = v_monto, valor = v_valor_comision
          where id = v_comision_id;
        else
          insert into comision (atencion_producto_id, profesional_id, regla_aplicada, base_calculo, valor)
          values (
            v_ap.id, v_vendedora_id,
            jsonb_build_object('tipo', 'tienda_producto', 'porcentaje', coalesce(v_config_negocio.comision_tienda_porcentaje, 10), 'origen', 'tienda'),
            v_monto, v_valor_comision
          );
        end if;
      elsif v_comision_id is not null then
        delete from comision where id = v_comision_id;
      end if;
    end if;
  end loop;

  perform fn_recalcular_contadores_cliente(v_cliente_anterior);
  if p_cliente_id <> v_cliente_anterior then
    perform fn_recalcular_contadores_cliente(p_cliente_id);
  end if;
end;
$$;

grant execute on function fn_editar_venta to authenticated;
