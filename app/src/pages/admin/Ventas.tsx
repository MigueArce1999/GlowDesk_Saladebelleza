import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SelectorRangoPersonalizado } from '../../components/analytics/SelectorRangoPersonalizado'
import { Button } from '../../components/ui/Button'
import { CampoMoneda, Input, Select, Textarea } from '../../components/ui/Campos'
import { Cargando, EmptyState, ErrorState } from '../../components/ui/Estados'
import { Modal } from '../../components/ui/Modal'
import { EstadoAtencionBadge } from '../../components/ui/StatusBadge'
import { buscarClientes } from '../../lib/api/empleada'
import { listarProfesionales } from '../../lib/api/catalogo'
import { editarVenta, eliminarVenta, listarProductosVendidos, listarVentasDetalle, obtenerNotasVenta } from '../../lib/api/admin'
import type { ProductoVenta } from '../../lib/api/admin'
import { formatoFecha, formatoFechaCorta, formatoMoneda, rangoPeriodo, type PeriodoResumen } from '../../lib/format'
import type { Cliente, Profesional, VentaLinea } from '../../lib/types'

const TODAS = 'todas'
const PERSONALIZADO = 'personalizado'
type Periodo = PeriodoResumen | typeof PERSONALIZADO

export function AdminVentas() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  // Días exactos elegidos en el calendario (yyyy-MM-dd) — solo tiene valor cuando periodo ===
  // 'personalizado'; se conserva aunque se vuelva a un preset, para que si reabren el calendario
  // sigan viendo el rango que ya habían elegido (mismo criterio que el Dashboard).
  const [rangoPersonalizado, setRangoPersonalizadoState] = useState<{ desde: string; hasta: string } | null>(null)
  const [calendarioAbierto, setCalendarioAbierto] = useState(false)
  const [profesionalFiltro, setProfesionalFiltro] = useState(TODAS)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [ventas, setVentas] = useState<VentaLinea[] | null>(null)
  const [productos, setProductos] = useState<ProductoVenta[] | null>(null)
  const [equipo, setEquipo] = useState<Profesional[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ventaEditando, setVentaEditando] = useState<string | null>(null)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  // "mes" (rangoPeriodo) siempre es el mes EN CURSO desde el día 1 hasta hoy — nunca deja ver un
  // mes ya pasado completo. Un rango personalizado sí deja elegir cualquier par de fechas,
  // incluidas las de meses anteriores (0077).
  function rango(): { desde: string; hasta: string } {
    if (periodo === PERSONALIZADO && rangoPersonalizado) {
      // Offset -05:00 explícito, mismo motivo que rangoPeriodo (lib/format.ts): sin él, Postgres
      // interpreta el rango como UTC y lo corre 5 horas.
      return { desde: `${rangoPersonalizado.desde}T00:00:00-05:00`, hasta: `${rangoPersonalizado.hasta}T23:59:59-05:00` }
    }
    return rangoPeriodo(periodo === PERSONALIZADO ? 'mes' : periodo)
  }

  function cargar() {
    const { desde, hasta } = rango()
    const filtroProfesional = profesionalFiltro === TODAS ? null : profesionalFiltro
    setVentas(null)
    setProductos(null)
    listarVentasDetalle(desde, hasta, filtroProfesional).then(setVentas).catch((e) => setError(e.message))
    listarProductosVendidos(desde, hasta).then(setProductos).catch((e) => setError(e.message))
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, rangoPersonalizado, profesionalFiltro])

  useEffect(() => {
    listarProfesionales().then(setEquipo).catch(() => {})
  }, [])

  // Buscador por nombre de clienta (0076): filtro en el cliente sobre lo ya cargado para este
  // periodo — el nombre ya viene en cada fila (v.cliente_nombre/p.clienteNombre), así que no
  // hace falta una consulta nueva. Igual que el buscador de Clientes.tsx (toLowerCase + includes).
  const qCliente = busquedaCliente.trim().toLowerCase()
  const ventasFiltradas = qCliente ? (ventas ?? []).filter((v) => v.cliente_nombre.toLowerCase().includes(qCliente)) : ventas
  // "Productos vendidos" no tiene su propio filtro de empleada en el servidor (listarProductosVendidos
  // no recibe profesionalId): se filtra acá, igual que ya se hace con el buscador de clienta, para que
  // al elegir una empleada arriba también se reduzca esta tabla a lo que ELLA vendió en Tienda —
  // nunca lo que vendieron sus compañeras, aunque sea la misma atención.
  const productosPorEmpleada = profesionalFiltro === TODAS ? productos : (productos ?? []).filter((p) => p.vendedoraId === profesionalFiltro)
  const productosFiltrados = qCliente ? (productosPorEmpleada ?? []).filter((p) => p.clienteNombre.toLowerCase().includes(qCliente)) : productosPorEmpleada

  // Clientas distintas que coinciden con la búsqueda, para enlazar directo a su perfil (pestaña
  // "Historial" ahí ya agrupa todas sus visitas y "Resumen" ya tiene el gasto acumulado
  // histórico real — no se duplica esa suma aquí, el total de abajo es solo de este periodo).
  const clientesCoincidentes = qCliente
    ? [...new Map(
        [...(ventasFiltradas ?? []).map((v) => [v.cliente_id, v.cliente_nombre] as const),
         ...(productosFiltrados ?? []).map((p) => [p.clienteId, p.clienteNombre] as const)],
      )].map(([id, nombre]) => ({ id, nombre }))
    : []

  const totalVendido = ventasFiltradas?.reduce((acc, v) => acc + (v.precio_snapshot - v.descuento) * v.cantidad, 0) ?? 0
  const totalComision = ventasFiltradas?.reduce((acc, v) => acc + v.comision_total, 0) ?? 0
  const totalProductos = productosFiltrados?.reduce((acc, p) => acc + p.subtotal, 0) ?? 0
  const totalComisionTienda = productosFiltrados?.reduce((acc, p) => acc + p.comisionTotal, 0) ?? 0
  // Comisión total de la empleada filtrada: servicios + Tienda juntos, su ganancia real del
  // periodo (lo que ve reflejado en "Mis ventas" de su propio portal, vista_comision, ya suma
  // las dos fuentes — acá se muestra lo mismo para que admin corrobore sin tener que entrar
  // a su cuenta).
  const nombreEmpleadaFiltrada = profesionalFiltro === TODAS ? null : equipo.find((p) => p.id === profesionalFiltro)?.nombre
  const totalComisionEmpleada = totalComision + totalComisionTienda

  async function borrarVenta(atencionId: string) {
    if (!confirm('¿Borrar esta venta por completo? Se eliminan sus servicios, el pago registrado, su comisión y los puntos que generó. Esto no se puede deshacer.')) return
    setBorrandoId(atencionId)
    setErrorAccion(null)
    try {
      await eliminarVenta(atencionId)
      cargar()
    } catch (e: any) {
      setErrorAccion(e.message)
    } finally {
      setBorrandoId(null)
    }
  }

  // Cada fila es una línea de servicio; una venta con varios servicios ocupa varias filas
  // seguidas (mismo atencion_id, mismo creado_en). Las acciones se muestran una sola vez por
  // venta, en su primera línea, para no repetir el mismo botón. Se calcula UNA vez (en vez de
  // un Set mutado fila a fila) porque la tabla de escritorio y las tarjetas de mobile recorren
  // ambas las mismas líneas en el mismo render — un Set compartido entre las dos vistas haría
  // que la segunda viera todo como "ya con acciones".
  const primeraLineaPorAtencion = new Map<string, string>()
  for (const v of ventasFiltradas ?? []) {
    if (!primeraLineaPorAtencion.has(v.atencion_id)) primeraLineaPorAtencion.set(v.atencion_id, v.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-marca text-2xl font-semibold text-carbon">Ventas y cobros</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busquedaCliente}
            onChange={(e) => setBusquedaCliente(e.target.value)}
            placeholder="Buscar clienta por nombre…"
            aria-label="Buscar clienta por nombre"
            className="min-w-0 flex-1 rounded-lg border border-piedra px-3 py-1.5 text-sm sm:max-w-xs"
          />
          <select
            value={profesionalFiltro}
            onChange={(e) => setProfesionalFiltro(e.target.value)}
            className="rounded-full border border-piedra bg-blanco px-3 py-1 text-xs font-semibold text-carbon"
            aria-label="Filtrar por empleada"
          >
            <option value={TODAS}>Todas las empleadas</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          {(['hoy', 'ayer', 'semana', 'mes'] as PeriodoResumen[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${periodo === p ? 'bg-oliva text-blanco' : 'bg-piedra/40 text-carbon'}`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setCalendarioAbierto(true)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${periodo === PERSONALIZADO ? 'bg-oliva text-blanco' : 'bg-piedra/40 text-carbon'}`}
          >
            {periodo === PERSONALIZADO && rangoPersonalizado
              ? `${formatoFechaCorta(rangoPersonalizado.desde)} – ${formatoFechaCorta(rangoPersonalizado.hasta)}`
              : 'Elegir fechas 📅'}
          </button>
        </div>
      </div>
      <p className="text-sm text-carbon/60">
        Cada fila es un servicio cobrado. "Le quedó al negocio" descuenta la comisión ya generada para
        quien lo realizó. Una línea marcada "Colaboración" es la ganancia completa (100%) de quien ayudó,
        sumada al total igual que cualquier otro servicio. La apertura/cierre de caja con arqueo de
        efectivo es un módulo de Fase 2.
      </p>

      {nombreEmpleadaFiltrada && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-oliva/10 px-4 py-3">
          <p className="text-sm text-carbon">
            <span className="font-semibold">{nombreEmpleadaFiltrada}</span> en este periodo: {formatoMoneda(totalComision)} de comisión por
            servicios + {formatoMoneda(totalComisionTienda)} de comisión por Tienda
          </p>
          <p className="text-sm font-semibold text-oliva">Total: {formatoMoneda(totalComisionEmpleada)}</p>
        </div>
      )}

      {qCliente && (
        clientesCoincidentes.length === 0 ? (
          <p className="rounded-lg bg-piedra/20 px-4 py-3 text-sm text-carbon/60">
            Ninguna clienta con ese nombre tiene servicios o productos en este periodo. Cambia el periodo de arriba o revisa su perfil completo en Clientas.
          </p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-oliva/10 px-4 py-3">
            {clientesCoincidentes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-carbon">
                  <span className="font-semibold">{c.nombre}</span> — en este periodo: {formatoMoneda(totalVendido + totalProductos)} gastado
                </p>
                <Link to={`/admin/clientes/${c.id}`} className="text-xs font-semibold text-oliva hover:underline">
                  Ver perfil completo (historial y gasto acumulado real) →
                </Link>
              </div>
            ))}
          </div>
        )
      )}

      {error && <ErrorState mensaje={error} />}
      {errorAccion && <ErrorState mensaje={errorAccion} />}
      {!ventasFiltradas ? (
        <Cargando />
      ) : ventasFiltradas.length === 0 ? (
        <EmptyState titulo={qCliente ? 'Sin servicios para esa búsqueda en este periodo' : 'No hay ventas registradas en este periodo'} />
      ) : (
        <>
          {/* Mobile (< md): tarjetas colapsables — la tabla de 9 columnas de abajo obligaba a
              scroll horizontal para leer cada fila. Desktop sigue viendo la tabla de siempre. */}
          <div className="flex flex-col gap-2 md:hidden">
            {ventasFiltradas.map((v) => {
              const vendido = (v.precio_snapshot - v.descuento) * v.cantidad
              const negocio = vendido - v.comision_total
              const mostrarAcciones = primeraLineaPorAtencion.get(v.atencion_id) === v.id
              return (
                <TarjetaVenta
                  key={v.id}
                  linea={v}
                  vendido={vendido}
                  negocio={negocio}
                  mostrarAcciones={mostrarAcciones}
                  borrando={borrandoId === v.atencion_id}
                  onEditar={() => setVentaEditando(v.atencion_id)}
                  onBorrar={() => borrarVenta(v.atencion_id)}
                />
              )
            })}
            <div className="flex items-center justify-between rounded-xl bg-oliva px-4 py-3 text-blanco">
              <span className="text-xs font-semibold opacity-80">Total del periodo</span>
              <div className="text-right">
                <p className="text-base font-bold">{formatoMoneda(totalVendido)}</p>
                <p className="text-[11px] opacity-80">Comisión: {formatoMoneda(totalComision)}</p>
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-piedra md:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-piedra/30 text-left text-xs uppercase tracking-wide text-carbon/60">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Servicio</th>
                <th className="px-3 py-2">Profesional</th>
                <th className="px-3 py-2 text-right">Precio cobrado</th>
                <th className="px-3 py-2 text-right">Comisión</th>
                <th className="px-3 py-2 text-right">Le quedó al negocio</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map((v) => {
                const vendido = (v.precio_snapshot - v.descuento) * v.cantidad
                const negocio = vendido - v.comision_total
                const mostrarAcciones = primeraLineaPorAtencion.get(v.atencion_id) === v.id
                return (
                  <tr key={v.id} className="border-t border-piedra/60">
                    <td className="px-3 py-2 text-carbon/70">{formatoFecha(v.atencion_completado_en ?? v.atencion_creado_en)}</td>
                    <td className="px-3 py-2 font-medium text-carbon">{v.cliente_nombre}</td>
                    <td className="px-3 py-2 text-carbon">
                      {v.nombre_snapshot}
                      {v.es_colaboracion && (
                        <span className="ml-2 rounded-full bg-champan/30 px-2 py-0.5 text-xs font-semibold text-carbon/70">Colaboración</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-carbon/70">{v.profesional_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-carbon">{formatoMoneda(vendido)}</td>
                    <td className="px-3 py-2 text-right text-carbon/70">{formatoMoneda(v.comision_total)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-oliva">{formatoMoneda(negocio)}</td>
                    <td className="px-3 py-2"><EstadoAtencionBadge estado={v.atencion_estado} /></td>
                    <td className="px-3 py-2">
                      {mostrarAcciones && (
                        <div className="flex gap-3 whitespace-nowrap">
                          <button onClick={() => setVentaEditando(v.atencion_id)} className="text-xs font-semibold text-oliva hover:underline">
                            Editar
                          </button>
                          <button
                            onClick={() => borrarVenta(v.atencion_id)}
                            disabled={borrandoId === v.atencion_id}
                            className="text-xs font-semibold text-error hover:underline disabled:opacity-50"
                          >
                            {borrandoId === v.atencion_id ? 'Borrando…' : 'Borrar'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-piedra bg-piedra/20 font-semibold">
                <td className="px-3 py-2" colSpan={4}>Total</td>
                <td className="px-3 py-2 text-right">{formatoMoneda(totalVendido)}</td>
                <td className="px-3 py-2 text-right">{formatoMoneda(totalComision)}</td>
                <td className="px-3 py-2 text-right text-oliva">{formatoMoneda(totalVendido - totalComision)}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      )}

      <h2 className="mt-2 font-marca text-lg font-semibold text-carbon">Productos vendidos</h2>
      {!productosFiltrados ? (
        <Cargando filas={2} />
      ) : productosFiltrados.length === 0 ? (
        <EmptyState titulo={qCliente ? 'Sin productos para esa búsqueda en este periodo' : 'No hay productos vendidos en este periodo'} />
      ) : (
        <>
          <div className="flex flex-col gap-2 md:hidden">
            {productosFiltrados.map((p) => (
              <TarjetaProducto key={p.id} producto={p} />
            ))}
            <div className="flex items-center justify-between rounded-xl bg-oliva px-4 py-3 text-blanco">
              <span className="text-xs font-semibold opacity-80">Total Tienda del periodo</span>
              <div className="text-right">
                <p className="text-base font-bold">{formatoMoneda(totalProductos)}</p>
                <p className="text-[11px] opacity-80">Comisión: {formatoMoneda(totalComisionTienda)}</p>
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-piedra md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-piedra/30 text-left text-xs uppercase tracking-wide text-carbon/60">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Vendido en Tienda por</th>
                <th className="px-3 py-2 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p) => (
                <tr key={p.id} className="border-t border-piedra/60">
                  <td className="px-3 py-2 text-carbon/70">{formatoFecha(p.fecha)}</td>
                  <td className="px-3 py-2 font-medium text-carbon">{p.clienteNombre}</td>
                  <td className="px-3 py-2 text-carbon/70">{p.categoria}</td>
                  <td className="px-3 py-2 text-carbon">{p.nombre}</td>
                  <td className="px-3 py-2 text-right text-carbon/70">x{p.cantidad}</td>
                  <td className="px-3 py-2 text-right font-semibold text-oliva">{formatoMoneda(p.subtotal)}</td>
                  <td className="px-3 py-2 text-carbon/70">
                    {p.esVentaTienda ? (p.vendedoraNombre ?? '—') : <span className="text-carbon/30">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-carbon/70">
                    {p.esVentaTienda ? formatoMoneda(p.comisionTotal) : <span className="text-carbon/30">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-piedra bg-piedra/20 font-semibold">
                <td className="px-3 py-2" colSpan={5}>Total</td>
                <td className="px-3 py-2 text-right text-oliva">{formatoMoneda(totalProductos)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right">{formatoMoneda(totalComisionTienda)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      )}

      <Modal abierto={calendarioAbierto} onCerrar={() => setCalendarioAbierto(false)} titulo="Elegir periodo">
        <SelectorRangoPersonalizado
          valorInicial={rangoPersonalizado}
          onCancelar={() => setCalendarioAbierto(false)}
          onAplicar={(desde, hasta) => {
            setRangoPersonalizadoState({ desde, hasta })
            setPeriodo(PERSONALIZADO)
            setCalendarioAbierto(false)
          }}
        />
      </Modal>

      {ventaEditando && (
        <EditarVentaModal
          atencionId={ventaEditando}
          lineas={ventas?.filter((v) => v.atencion_id === ventaEditando) ?? []}
          equipo={equipo}
          onCerrar={() => setVentaEditando(null)}
          onGuardado={() => {
            setVentaEditando(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

interface LineaEdicion {
  id: string
  nombreSnapshot: string
  profesionalId: string
  precio: number | null
  descuento: number | null
  cantidad: number
}

function EditarVentaModal({
  atencionId,
  lineas,
  equipo,
  onCerrar,
  onGuardado,
}: {
  atencionId: string
  lineas: VentaLinea[]
  equipo: Profesional[]
  onCerrar: () => void
  onGuardado: () => void
}) {
  const primera = lineas[0]
  const [clienteId, setClienteId] = useState(primera?.cliente_id ?? '')
  const [clienteNombre, setClienteNombre] = useState(primera?.cliente_nombre ?? '')
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [queryCliente, setQueryCliente] = useState('')
  const [resultadosCliente, setResultadosCliente] = useState<Cliente[]>([])

  const [notas, setNotas] = useState('')
  const [cargandoNotas, setCargandoNotas] = useState(true)

  const [lineasEdicion, setLineasEdicion] = useState<LineaEdicion[]>(
    lineas.map((l) => ({ id: l.id, nombreSnapshot: l.nombre_snapshot, profesionalId: l.profesional_id, precio: l.precio_snapshot, descuento: l.descuento, cantidad: l.cantidad })),
  )

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerNotasVenta(atencionId)
      .then((n) => setNotas(n ?? ''))
      .finally(() => setCargandoNotas(false))
  }, [atencionId])

  useEffect(() => {
    if (!queryCliente.trim()) { setResultadosCliente([]); return }
    const t = setTimeout(() => {
      buscarClientes(queryCliente.trim()).then(setResultadosCliente).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [queryCliente])

  function actualizarLinea(id: string, cambios: Partial<LineaEdicion>) {
    setLineasEdicion((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)))
  }

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      await editarVenta({
        atencionId,
        clienteId,
        notas: notas.trim() || null,
        lineas: lineasEdicion.map((l) => ({
          id: l.id,
          profesionalId: l.profesionalId,
          precioSnapshot: l.precio ?? 0,
          descuento: l.descuento ?? 0,
          cantidad: l.cantidad,
        })),
      })
      onGuardado()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Editar venta">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-carbon/50">
          El dinero ya cobrado (el pago) no se toca al editar — si el precio de un servicio estaba mal
          digitado, esto corrige la venta y su comisión, pero el monto realmente recibido en caja queda
          igual. Si de verdad se cobró otro monto, avisa para ajustar el pago aparte.
        </p>
        {error && <ErrorState mensaje={error} />}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-carbon">Cliente</label>
          {!buscandoCliente ? (
            <div className="flex items-center justify-between rounded-lg border border-piedra bg-marfil px-3 py-2.5">
              <span className="text-sm text-carbon">{clienteNombre}</span>
              <button onClick={() => setBuscandoCliente(true)} className="text-xs font-semibold text-oliva hover:underline">Cambiar</button>
            </div>
          ) : (
            <div className="relative">
              <input
                autoFocus
                value={queryCliente}
                onChange={(e) => setQueryCliente(e.target.value)}
                placeholder="Buscar por nombre o teléfono"
                className="w-full rounded-lg border border-piedra bg-blanco px-3 py-2.5 text-sm text-carbon outline-none focus:border-oliva"
              />
              {resultadosCliente.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-piedra bg-blanco shadow-lg">
                  {resultadosCliente.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteId(c.id); setClienteNombre(c.nombre); setBuscandoCliente(false); setQueryCliente('') }}
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-piedra/40"
                    >
                      <span className="font-medium text-carbon">{c.nombre}</span>
                      {c.telefono && <span className="text-xs text-carbon/60">{c.telefono}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-carbon">Servicios</p>
          {lineasEdicion.map((l) => (
            <div key={l.id} className="flex flex-col gap-3 rounded-xl border border-piedra p-3">
              <p className="text-sm font-medium text-carbon">{l.nombreSnapshot}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select id={`prof-${l.id}`} etiqueta="Profesional" value={l.profesionalId} onChange={(e) => actualizarLinea(l.id, { profesionalId: e.target.value })}>
                  {equipo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
                <CampoMoneda id={`precio-${l.id}`} etiqueta="Precio cobrado" value={l.precio} onChange={(v) => actualizarLinea(l.id, { precio: v })} />
                <CampoMoneda id={`descuento-${l.id}`} etiqueta="Descuento" value={l.descuento} onChange={(v) => actualizarLinea(l.id, { descuento: v })} />
              </div>
              <div className="w-32">
                <Input
                  id={`cantidad-${l.id}`}
                  etiqueta="Cantidad"
                  type="number"
                  min={1}
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(l.id, { cantidad: Math.max(1, Number(e.target.value)) })}
                />
              </div>
            </div>
          ))}
        </div>

        <Textarea id="notasVenta" etiqueta="Nota interna" value={notas} onChange={(e) => setNotas(e.target.value)} disabled={cargandoNotas} />

        <div className="flex justify-end gap-2">
          <Button variante="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} cargando={guardando}>Guardar cambios</Button>
        </div>
      </div>
    </Modal>
  )
}

// --- Tarjetas colapsables (mobile) -------------------------------------------------------
// La tabla de 9 columnas obligaba a hacer scroll horizontal para leer un solo servicio en el
// celular. Acá cada venta es una tarjeta: lo esencial (clienta, servicio, precio) siempre
// visible, el resto (comisión, estado, acciones) se despliega al tocarla. Solo < md: desktop
// sigue viendo exactamente la misma tabla de siempre.

function TarjetaVenta({
  linea,
  vendido,
  negocio,
  mostrarAcciones,
  borrando,
  onEditar,
  onBorrar,
}: {
  linea: VentaLinea
  vendido: number
  negocio: number
  mostrarAcciones: boolean
  borrando: boolean
  onEditar: () => void
  onBorrar: () => void
}) {
  const [abierta, setAbierta] = useState(false)
  const inicial = linea.cliente_nombre.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="overflow-hidden rounded-xl border border-piedra bg-blanco">
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-oliva text-sm font-bold text-blanco">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-carbon">{linea.cliente_nombre}</p>
            <p className="shrink-0 text-sm font-extrabold text-oliva">{formatoMoneda(vendido)}</p>
          </div>
          <p className="truncate text-xs text-carbon/60">
            {linea.nombre_snapshot} · {linea.profesional_nombre ?? '—'}
          </p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
          className={`shrink-0 text-carbon/40 transition-transform ${abierta ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierta && (
        <div className="border-t border-dashed border-piedra px-3.5 pb-3.5">
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5 pt-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Comisión</p>
              <p className="mt-0.5 text-sm font-semibold text-carbon">{formatoMoneda(linea.comision_total)}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Le quedó al negocio</p>
              <p className="mt-0.5 text-sm font-semibold text-oliva">{formatoMoneda(negocio)}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Fecha</p>
              <p className="mt-0.5 text-sm text-carbon">{formatoFecha(linea.atencion_completado_en ?? linea.atencion_creado_en)}</p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Estado</p>
              <div className="mt-0.5"><EstadoAtencionBadge estado={linea.atencion_estado} /></div>
            </div>
          </div>

          {linea.es_colaboracion && (
            <span className="mt-2.5 inline-block rounded-full bg-champan/30 px-2.5 py-0.5 text-[11px] font-semibold text-carbon/70">
              Colaboración
            </span>
          )}

          {mostrarAcciones && (
            <div className="mt-3.5 flex gap-4 border-t border-piedra/60 pt-3">
              <button onClick={onEditar} className="text-xs font-semibold text-oliva hover:underline">Editar</button>
              <button onClick={onBorrar} disabled={borrando} className="text-xs font-semibold text-error hover:underline disabled:opacity-50">
                {borrando ? 'Borrando…' : 'Borrar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TarjetaProducto({ producto }: { producto: ProductoVenta }) {
  const [abierta, setAbierta] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border border-piedra bg-blanco">
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 p-3.5 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-champan/30 text-carbon/70">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 8h12l-1 12H7L6 8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M9 8a3 3 0 1 1 6 0" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-carbon">{producto.nombre}</p>
            <p className="shrink-0 text-sm font-extrabold text-oliva">{formatoMoneda(producto.subtotal)}</p>
          </div>
          <p className="truncate text-xs text-carbon/60">
            {producto.categoria} · {producto.clienteNombre} · x{producto.cantidad}
          </p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
          className={`shrink-0 text-carbon/40 transition-transform ${abierta ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierta && (
        <div className="border-t border-dashed border-piedra px-3.5 pb-3.5">
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5 pt-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Vendido en Tienda por</p>
              <p className="mt-0.5 text-sm font-semibold text-carbon">
                {producto.esVentaTienda ? (producto.vendedoraNombre ?? '—') : <span className="text-carbon/40">No es venta de Tienda</span>}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Comisión</p>
              <p className="mt-0.5 text-sm font-semibold text-oliva">
                {producto.esVentaTienda ? formatoMoneda(producto.comisionTotal) : '—'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-carbon/50">Fecha</p>
              <p className="mt-0.5 text-sm text-carbon">{formatoFecha(producto.fecha)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
