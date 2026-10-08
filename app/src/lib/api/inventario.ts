import { isDemoMode, LOCAL_ID, supabase, supabaseRequerido } from '../supabase'
import { demoMovimientosInventario, demoProductosInventario } from '../demoData'
import type { MovimientoInventario, Producto, TipoMovimientoInventario } from '../types'

// Igual que listarServiciosAdmin (catalogo.ts): el panel de administración necesita ver también
// los productos desactivados, no solo los que se buscan desde el asistente de voz.
export async function listarInventario(): Promise<Producto[]> {
  if (isDemoMode) return demoProductosInventario
  const { data, error } = await supabase!.from('producto').select('*').order('nombre')
  if (error) throw error
  return data as Producto[]
}

export async function crearProducto(datos: {
  nombre: string
  categoria?: string | null
  precio?: number | null
  cantidad_minima?: number
  unidad_medida?: string
}): Promise<Producto> {
  if (isDemoMode) throw new Error('No disponible en modo demostración')
  const client = supabaseRequerido()
  const { data, error } = await client.from('producto').insert({ ...datos, local_id: LOCAL_ID }).select('*').single()
  if (error) throw error
  return data as Producto
}

export async function actualizarProducto(
  id: string,
  datos: Partial<Pick<Producto, 'nombre' | 'categoria' | 'precio' | 'cantidad_minima' | 'unidad_medida' | 'activo'>>,
): Promise<void> {
  if (isDemoMode) return
  const client = supabaseRequerido()
  const { error } = await client.from('producto').update(datos).eq('id', id)
  if (error) throw error
}

// Único camino para cambiar cantidad_actual — ver fn_ajustar_inventario (0080): calcula el
// delta real, nunca deja existencia negativa, y deja bitácora en movimiento_inventario en la
// misma transacción.
export async function ajustarInventario(
  productoId: string,
  tipo: TipoMovimientoInventario,
  cantidad: number,
  motivo?: string,
): Promise<Producto> {
  if (isDemoMode) throw new Error('No disponible en modo demostración')
  const client = supabaseRequerido()
  const { data, error } = await client.rpc('fn_ajustar_inventario', {
    p_producto_id: productoId,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_motivo: motivo ?? null,
  })
  if (error) throw error
  return data as Producto
}

export async function listarMovimientos(productoId: string): Promise<MovimientoInventario[]> {
  if (isDemoMode) return demoMovimientosInventario.filter((m) => m.producto_id === productoId)
  const { data, error } = await supabase!
    .from('movimiento_inventario')
    .select('*, producto:producto_id(nombre)')
    .eq('producto_id', productoId)
    .order('creado_en', { ascending: false })
  if (error) throw error
  return (data ?? []).map((m: any) => ({ ...m, producto_nombre: m.producto?.nombre }))
}
