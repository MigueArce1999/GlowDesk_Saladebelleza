import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Input, Select, Textarea } from '../../components/ui/Campos'
import { Card, Cargando, ErrorState } from '../../components/ui/Estados'
import { Modal } from '../../components/ui/Modal'
import { isDemoMode } from '../../lib/supabase'
import { ajustarInventario, actualizarProducto, crearProducto, listarInventario, listarMovimientos } from '../../lib/api/inventario'
import { formatoFecha } from '../../lib/format'
import type { MovimientoInventario, Producto, TipoMovimientoInventario } from '../../lib/types'

const UNIDADES = ['unidad', 'ml', 'g', 'kg', 'L']

function formatoPrecio(p: number | null): string {
  if (p == null) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p)
}

export function AdminInventario() {
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalAjuste, setModalAjuste] = useState<Producto | null>(null)
  const [modalMovimientos, setModalMovimientos] = useState<Producto | null>(null)

  function recargar() {
    setProductos(null)
    listarInventario().then(setProductos).catch((e) => setError(e.message))
  }

  useEffect(recargar, [])

  async function alternarActivo(p: Producto) {
    if (isDemoMode) return
    await actualizarProducto(p.id, { activo: !p.activo })
    recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-marca text-2xl font-semibold text-carbon">Inventario de productos</h1>
        <Button tamano="sm" onClick={() => setModalNuevo(true)}>+ Nuevo producto</Button>
      </div>

      <p className="text-sm text-carbon/60">
        El inventario se ajusta a mano (entrada, salida o conteo) — todavía no se descuenta solo cuando se vende un producto en Tienda.
      </p>

      {error && <ErrorState mensaje={error} />}
      {!productos ? (
        <Cargando />
      ) : productos.length === 0 ? (
        <p className="text-sm text-carbon/60">Aún no hay productos en el inventario.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {productos.map((p) => {
            const bajoMinimo = p.cantidad_minima > 0 && p.cantidad_actual <= p.cantidad_minima
            return (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <button className="text-left" onClick={() => setModalMovimientos(p)}>
                  <p className="font-medium text-carbon underline-offset-2 hover:underline">{p.nombre}</p>
                  <p className="text-xs text-carbon/60">{p.categoria ?? 'Sin categoría'} · {formatoPrecio(p.precio)}</p>
                </button>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${bajoMinimo ? 'bg-error/15 text-error' : 'bg-piedra/40 text-carbon'}`}
                  >
                    {p.cantidad_actual} {p.unidad_medida}{bajoMinimo ? ' · Reabastecer' : ''}
                  </span>
                  <button onClick={() => setModalAjuste(p)} className="text-xs font-semibold text-oliva underline underline-offset-2">
                    Ajustar
                  </button>
                  <button
                    onClick={() => alternarActivo(p)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${p.activo ? 'bg-exito/15 text-exito' : 'bg-carbon/10 text-carbon/60'}`}
                  >
                    {p.activo ? 'Activo' : 'Desactivado'}
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal abierto={modalNuevo} onCerrar={() => setModalNuevo(false)} titulo="Nuevo producto">
        <FormularioProducto
          onGuardado={() => {
            setModalNuevo(false)
            recargar()
          }}
        />
      </Modal>

      <Modal abierto={modalAjuste !== null} onCerrar={() => setModalAjuste(null)} titulo={`Ajustar existencia — ${modalAjuste?.nombre ?? ''}`}>
        {modalAjuste && (
          <FormularioAjuste
            producto={modalAjuste}
            onGuardado={() => {
              setModalAjuste(null)
              recargar()
            }}
          />
        )}
      </Modal>

      <Modal abierto={modalMovimientos !== null} onCerrar={() => setModalMovimientos(null)} titulo={`Movimientos — ${modalMovimientos?.nombre ?? ''}`}>
        {modalMovimientos && <ListaMovimientos productoId={modalMovimientos.id} />}
      </Modal>
    </div>
  )
}

function FormularioProducto({ onGuardado }: { onGuardado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [precio, setPrecio] = useState(0)
  const [cantidadMinima, setCantidadMinima] = useState(0)
  const [unidadMedida, setUnidadMedida] = useState('unidad')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (isDemoMode) { onGuardado(); return }
    setGuardando(true)
    setError(null)
    try {
      await crearProducto({
        nombre,
        categoria: categoria || null,
        precio: precio || null,
        cantidad_minima: cantidadMinima,
        unidad_medida: unidadMedida,
      })
      onGuardado()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      {error && <ErrorState mensaje={error} />}
      <Input id="nombre" etiqueta="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Input id="categoria" etiqueta="Categoría (opcional)" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
      <Input id="precio" etiqueta="Precio de venta (COP, opcional)" type="number" value={precio} onChange={(e) => setPrecio(Number(e.target.value))} />
      <Select id="unidad" etiqueta="Unidad de medida" value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)}>
        {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
      </Select>
      <Input
        id="cantidadMinima"
        etiqueta="Existencia mínima"
        type="number"
        value={cantidadMinima}
        onChange={(e) => setCantidadMinima(Number(e.target.value))}
        ayuda="Debajo de este número el producto se marca como 'Reabastecer'. Déjalo en 0 para no recibir aviso."
      />
      <p className="text-xs text-carbon/60">El producto se crea con existencia 0 — regístrala con "Ajustar" una vez guardado.</p>
      <Button type="submit" cargando={guardando}>Crear producto</Button>
    </form>
  )
}

function FormularioAjuste({ producto, onGuardado }: { producto: Producto; onGuardado: () => void }) {
  const [tipo, setTipo] = useState<TipoMovimientoInventario>('entrada')
  const [cantidad, setCantidad] = useState(0)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (isDemoMode) { onGuardado(); return }
    setGuardando(true)
    setError(null)
    try {
      await ajustarInventario(producto.id, tipo, cantidad, motivo || undefined)
      onGuardado()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      {error && <ErrorState mensaje={error} />}
      <p className="text-sm text-carbon/60">Existencia actual: <span className="font-semibold text-carbon">{producto.cantidad_actual} {producto.unidad_medida}</span></p>
      <Select id="tipo" etiqueta="Tipo de movimiento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimientoInventario)}>
        <option value="entrada">Entrada (compra, reposición)</option>
        <option value="salida">Salida (uso, merma)</option>
        <option value="ajuste">Ajuste — fijar la existencia real tras un conteo</option>
      </Select>
      <Input
        id="cantidad"
        etiqueta={tipo === 'ajuste' ? 'Existencia real (conteo)' : 'Cantidad'}
        type="number"
        required
        value={cantidad}
        onChange={(e) => setCantidad(Number(e.target.value))}
      />
      <Textarea id="motivo" etiqueta="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <Button type="submit" cargando={guardando}>Registrar movimiento</Button>
    </form>
  )
}

function ListaMovimientos({ productoId }: { productoId: string }) {
  const [movimientos, setMovimientos] = useState<MovimientoInventario[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarMovimientos(productoId).then(setMovimientos).catch((e) => setError(e.message))
  }, [productoId])

  if (error) return <ErrorState mensaje={error} />
  if (!movimientos) return <Cargando />
  if (movimientos.length === 0) return <p className="text-sm text-carbon/60">Sin movimientos registrados todavía.</p>

  return (
    <div className="flex flex-col gap-2">
      {movimientos.map((m) => (
        <div key={m.id} className="flex items-center justify-between rounded-lg bg-piedra/30 px-3 py-2 text-sm">
          <div>
            <p className="font-medium capitalize text-carbon">{m.tipo}{m.motivo ? ` · ${m.motivo}` : ''}</p>
            <p className="text-xs text-carbon/60">{formatoFecha(m.creado_en, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <div className="text-right">
            <p className={`font-semibold ${m.cantidad >= 0 ? 'text-exito' : 'text-error'}`}>{m.cantidad >= 0 ? '+' : ''}{m.cantidad}</p>
            <p className="text-xs text-carbon/60">Quedó en {m.cantidad_resultante}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
