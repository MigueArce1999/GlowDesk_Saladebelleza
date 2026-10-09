import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Campos'
import { Card, Cargando, EmptyState, ErrorState } from '../../components/ui/Estados'
import { Drawer } from '../../components/ui/Modal'
import { ModalCompartirQR } from '../../components/ui/ModalCompartirQR'
import { isDemoMode } from '../../lib/supabase'
import {
  actualizarEstadoRecomendacion,
  archivarCliente,
  buscarPosiblesDuplicados,
  crearClienteAdmin,
  actualizarClienteAdmin,
  eliminarClienteAdmin,
  exportarClientesCSV,
  listarClientesAdmin,
  listarSeguimientosPendientes,
  marcarResenaGoogle,
  type DatosCliente,
} from '../../lib/api/clientes'
import { formatoFecha, formatoFechaCorta } from '../../lib/format'
import { telefonosEquivalentes } from '../../lib/telefono'
import { ENLACE_RESENA_GOOGLE } from '../../lib/constantes'
import { urlRegistroPublico } from '../../lib/rutas'
import type { ClienteResumen, SeguimientoPendiente } from '../../lib/types'

function enlaceWhatsapp(telefono: string, mensaje?: string): string {
  const digitos = telefono.replace(/\D/g, '')
  return mensaje ? `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}` : `https://wa.me/${digitos}`
}

const POR_PAGINA = 15

type FiltroEstado = 'todos' | 'activos' | 'archivados'
type FiltroPromos = 'todos' | 'si' | 'no'
type FiltroVisita = 'todos' | '30dias' | 'sin_visitas'

type FiltroRapido = 'todas' | 'nuevas' | 'frecuentes' | 'con_cita' | 'con_seguimiento' | 'inactivas'

const OPCIONES_FILTRO_RAPIDO: { valor: FiltroRapido; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'nuevas', etiqueta: 'Nuevas' },
  { valor: 'frecuentes', etiqueta: 'Frecuentes' },
  { valor: 'con_cita', etiqueta: 'Con cita próxima' },
  { valor: 'con_seguimiento', etiqueta: 'Con seguimiento pendiente' },
  { valor: 'inactivas', etiqueta: 'Inactivas' },
]

const DIAS_INACTIVA = 90
const VISITAS_FRECUENTE = 5

export function AdminClientes() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState<ClienteResumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('activos')
  const [filtroPromos, setFiltroPromos] = useState<FiltroPromos>('todos')
  const [filtroVisita, setFiltroVisita] = useState<FiltroVisita>('todos')
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todas')
  const [pagina, setPagina] = useState(1)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [panelAbierto, setPanelAbierto] = useState<'nuevo' | ClienteResumen | null>(null)
  const [compartirAbierto, setCompartirAbierto] = useState(false)

  function recargar() {
    listarClientesAdmin().then(setClientes).catch((e) => setError(e.message))
  }
  useEffect(recargar, [])
  useEffect(() => setPagina(1), [busqueda, filtroEstado, filtroPromos, filtroVisita, filtroRapido])

  const hace30Dias = useMemo(() => Date.now() - 30 * 24 * 60 * 60 * 1000, [])
  const haceNDiasInactiva = useMemo(() => Date.now() - DIAS_INACTIVA * 24 * 60 * 60 * 1000, [])

  const indicadores = useMemo(() => {
    const lista = clientes ?? []
    return {
      activos: lista.filter((c) => c.activo).length,
      autorizanPromos: lista.filter((c) => c.consentimiento_marketing).length,
      visitasRecientes: lista.filter((c) => c.ultima_visita && new Date(c.ultima_visita).getTime() >= hace30Dias).length,
    }
  }, [clientes, hace30Dias])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (clientes ?? []).filter((c) => {
      if (q && !c.nombre.toLowerCase().includes(q) && !(c.telefono ?? '').includes(q)) return false
      if (filtroEstado === 'activos' && !c.activo) return false
      if (filtroEstado === 'archivados' && c.activo) return false
      if (filtroPromos === 'si' && !c.consentimiento_marketing) return false
      if (filtroPromos === 'no' && c.consentimiento_marketing) return false
      if (filtroVisita === '30dias' && !(c.ultima_visita && new Date(c.ultima_visita).getTime() >= hace30Dias)) return false
      if (filtroVisita === 'sin_visitas' && c.ultima_visita) return false
      if (filtroRapido === 'nuevas' && c.visitas_completadas > 1) return false
      if (filtroRapido === 'frecuentes' && c.visitas_completadas < VISITAS_FRECUENTE) return false
      if (filtroRapido === 'con_cita' && !c.proxima_cita_inicio) return false
      if (filtroRapido === 'con_seguimiento' && !c.proximo_seguimiento_fecha) return false
      if (filtroRapido === 'inactivas' && !(c.activo && (!c.ultima_visita || new Date(c.ultima_visita).getTime() < haceNDiasInactiva))) return false
      return true
    })
  }, [clientes, busqueda, filtroEstado, filtroPromos, filtroVisita, filtroRapido, hace30Dias, haceNDiasInactiva])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginados = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function alternarSeleccionTodos() {
    setSeleccionados((prev) => {
      if (paginados.every((c) => prev.has(c.id))) {
        const next = new Set(prev)
        paginados.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(prev)
      paginados.forEach((c) => next.add(c.id))
      return next
    })
  }

  function iniciarCampanaConSeleccion() {
    navigate('/admin/campanas', { state: { clienteIdsPreseleccionados: Array.from(seleccionados) } })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-marca text-2xl font-semibold text-carbon">Clientes</h1>
          <p className="text-sm text-carbon/60">Cada dato que completas te acerca a una mejor decisión.</p>
        </div>
        <div className="flex gap-2">
          <Button variante="secondary" tamano="sm" onClick={() => setCompartirAbierto(true)}>Compartir registro</Button>
          <Button tamano="sm" onClick={() => setPanelAbierto('nuevo')}>+ Nuevo cliente</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="text-center"><p className="text-xs text-carbon/50">Clientes activos</p><p className="mt-1 font-marca text-3xl font-semibold text-carbon">{clientes ? indicadores.activos : '—'}</p></Card>
        <Card className="text-center"><p className="text-xs text-carbon/50">Autorizan promociones</p><p className="mt-1 font-marca text-3xl font-semibold text-carbon">{clientes ? indicadores.autorizanPromos : '—'}</p></Card>
        <Card className="text-center"><p className="text-xs text-carbon/50">Visitaron en los últimos 30 días</p><p className="mt-1 font-marca text-3xl font-semibold text-carbon">{clientes ? indicadores.visitasRecientes : '—'}</p></Card>
      </div>

      <SeguimientosPendientes />

      <div className="flex flex-wrap gap-2">
        {OPCIONES_FILTRO_RAPIDO.map((o) => (
          <button
            key={o.valor}
            onClick={() => setFiltroRapido(o.valor)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtroRapido === o.valor ? 'bg-oliva text-blanco' : 'bg-piedra/40 text-carbon hover:bg-piedra/60'
            }`}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Buscar por nombre o teléfono…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-piedra px-3 py-2 text-sm sm:max-w-xs"
        />
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className="rounded-lg border border-piedra px-3 py-2 text-sm">
          <option value="activos">Clientes activos</option>
          <option value="archivados">Archivados</option>
          <option value="todos">Todos los estados</option>
        </select>
        <select value={filtroPromos} onChange={(e) => setFiltroPromos(e.target.value as FiltroPromos)} className="rounded-lg border border-piedra px-3 py-2 text-sm">
          <option value="todos">Cualquier autorización</option>
          <option value="si">Autorizan promociones</option>
          <option value="no">No autorizan</option>
        </select>
        <select value={filtroVisita} onChange={(e) => setFiltroVisita(e.target.value as FiltroVisita)} className="rounded-lg border border-piedra px-3 py-2 text-sm">
          <option value="todos">Cualquier visita</option>
          <option value="30dias">Visitaron en 30 días</option>
          <option value="sin_visitas">Sin visitas</option>
        </select>
        <Button variante="secondary" tamano="sm" onClick={() => exportarClientesCSV(filtrados)} disabled={filtrados.length === 0}>Exportar CSV</Button>
      </div>

      {seleccionados.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-piedra/30 px-3 py-2 text-sm">
          <span className="font-medium text-carbon">{seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}</span>
          <button onClick={iniciarCampanaConSeleccion} className="font-semibold text-oliva hover:underline">Iniciar campaña</button>
          <button onClick={() => setSeleccionados(new Set())} className="text-carbon/50 hover:underline">Quitar selección</button>
        </div>
      )}

      {error && <ErrorState mensaje={error} />}
      {!clientes ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <EmptyState titulo="No hay clientes con ese criterio" />
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-piedra bg-blanco">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-piedra bg-piedra/20 text-xs uppercase tracking-wide text-carbon/50">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={paginados.length > 0 && paginados.every((c) => seleccionados.has(c.id))} onChange={alternarSeleccionTodos} /></th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Última visita</th>
                <th className="px-4 py-3">Servicio realizado</th>
                <th className="px-4 py-3">Promociones</th>
                <th className="px-4 py-3">Reseña en Google</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {paginados.map((c) => (
                <FilaCliente
                  key={c.id}
                  cliente={c}
                  seleccionado={seleccionados.has(c.id)}
                  onSeleccionar={() => alternarSeleccion(c.id)}
                  onEditar={() => setPanelAbierto(c)}
                  onCambio={recargar}
                />
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-piedra px-4 py-3 text-xs text-carbon/60">
            <span>{filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}</span>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="font-semibold text-oliva disabled:text-carbon/30">Anterior</button>
                <span>Página {pagina} de {totalPaginas}</span>
                <button disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="font-semibold text-oliva disabled:text-carbon/30">Siguiente</button>
              </div>
            )}
          </div>
        </div>
      )}

      <Drawer abierto={panelAbierto !== null} onCerrar={() => setPanelAbierto(null)} titulo={panelAbierto === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}>
        <FormularioCliente
          cliente={panelAbierto !== 'nuevo' ? panelAbierto : null}
          onGuardado={() => { setPanelAbierto(null); recargar() }}
        />
      </Drawer>

      <ModalCompartirRegistro abierto={compartirAbierto} onCerrar={() => setCompartirAbierto(false)} onActualizar={recargar} />
    </div>
  )
}

// Mismo patrón que "Canjes por entregar" en Fidelización: una cola de "sería conveniente que
// esta clienta regrese" como card visible — el aviso consolidado vive en la campanita del
// header (ver lib/notificaciones/useNotificaciones.ts).
function SeguimientosPendientes() {
  const [pendientes, setPendientes] = useState<SeguimientoPendiente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actualizando, setActualizando] = useState<string | null>(null)
  const navigate = useNavigate()

  function cargar() {
    setError(null)
    listarSeguimientosPendientes().then(setPendientes).catch((e) => setError(e.message))
  }
  useEffect(cargar, [])

  async function completar(id: string) {
    setActualizando(id)
    try {
      await actualizarEstadoRecomendacion(id, 'completada')
      cargar()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActualizando(null)
    }
  }

  if (error) return <ErrorState mensaje={error} reintentar={cargar} />
  if (!pendientes || pendientes.length === 0) return null

  return (
    <Card className="flex flex-col gap-3 border-champan/60 bg-champan/10">
      <p className="font-semibold text-carbon">Seguimientos pendientes</p>
      <div className="flex flex-col gap-2">
        {pendientes.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blanco px-3 py-2">
            <div>
              <p className="text-sm font-medium text-carbon">{s.cliente_nombre} <span className="font-normal text-carbon/50">· {s.descripcion}</span></p>
              <p className="text-xs text-carbon/50">
                {s.fecha_recomendada_regreso ? formatoFechaCorta(s.fecha_recomendada_regreso) : 'Sin fecha'}
                {s.creado_por_nombre && ` · Recomendado por ${s.creado_por_nombre}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/admin/clientes/${s.cliente_id}`)} className="text-xs font-semibold text-oliva hover:underline">Ver clienta</button>
              <button onClick={() => navigate(`/admin/agenda?nuevaCitaClienteId=${s.cliente_id}${s.servicio_recomendado_id ? `&servicioId=${s.servicio_recomendado_id}` : ''}`)} className="text-xs font-semibold text-oliva hover:underline">
                Agendar
              </button>
              <Button tamano="sm" variante="ghost" onClick={() => completar(s.id)} cargando={actualizando === s.id}>Marcar completado</Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FilaCliente({
  cliente,
  seleccionado,
  onSeleccionar,
  onEditar,
  onCambio,
}: {
  cliente: ClienteResumen
  seleccionado: boolean
  onSeleccionar: () => void
  onEditar: () => void
  onCambio: () => void
}) {
  const [ocupado, setOcupado] = useState(false)

  async function alternarArchivado() {
    setOcupado(true)
    try {
      await archivarCliente(cliente.id, !cliente.activo)
      onCambio()
    } finally {
      setOcupado(false)
    }
  }

  async function alternarResena() {
    setOcupado(true)
    try {
      await marcarResenaGoogle(cliente.id, !cliente.resena_google_confirmada)
      onCambio()
    } finally {
      setOcupado(false)
    }
  }

  async function borrar() {
    if (!confirm(`¿Borrar a ${cliente.nombre} por completo? Esto no se puede deshacer.`)) return
    setOcupado(true)
    try {
      await eliminarClienteAdmin(cliente.id)
      onCambio()
    } catch (e: any) {
      alert(e.message)
      setOcupado(false)
    }
  }

  return (
    <tr className="border-b border-piedra/60 last:border-0">
      <td className="px-3 py-3"><input type="checkbox" checked={seleccionado} onChange={onSeleccionar} /></td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/clientes/${cliente.id}`} className="font-medium text-carbon hover:text-oliva hover:underline">{cliente.nombre}</Link>
          {!cliente.activo && <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-xs text-carbon/50">Archivado</span>}
          {!cliente.ultima_visita && (
            <span className="rounded-full bg-champan/25 px-2 py-0.5 text-xs font-semibold text-carbon">Nuevo</span>
          )}
          {cliente.proxima_cita_inicio && (
            <span className="rounded-full bg-oliva/15 px-2 py-0.5 text-xs font-semibold text-oliva">Cita próxima</span>
          )}
          {cliente.proximo_seguimiento_fecha && (
            <span className="rounded-full bg-advertencia/15 px-2 py-0.5 text-xs font-semibold text-advertencia">Seguimiento</span>
          )}
          {!cliente.ultima_visita && cliente.telefono && (
            <a
              href={enlaceWhatsapp(cliente.telefono)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-exito/15 px-2 py-0.5 text-xs font-semibold text-exito hover:bg-exito/25"
            >
              WhatsApp
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-carbon/70">{cliente.telefono ?? '—'}</td>
      <td className="px-4 py-3 text-carbon/70">{cliente.ultima_visita ? formatoFecha(cliente.ultima_visita) : 'Sin visitas'}</td>
      <td className="px-4 py-3 text-carbon/70">{cliente.ultimo_servicio_nombre ?? 'Sin registrar'}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cliente.consentimiento_marketing ? 'bg-exito/15 text-exito' : 'bg-carbon/10 text-carbon/50'}`}>
          {cliente.consentimiento_marketing ? 'Autorizadas' : 'No autorizadas'}
        </span>
      </td>
      <td className="px-4 py-3">
        {cliente.resena_google_confirmada ? (
          <button onClick={alternarResena} disabled={ocupado} className="text-xs font-semibold text-exito hover:underline">
            ✓ Confirmada
          </button>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {cliente.telefono && (
              <a
                href={enlaceWhatsapp(
                  cliente.telefono,
                  `¡Hola ${cliente.nombre.split(' ')[0]}! ¿Nos regalas una reseña en Google? Nos ayuda muchísimo 💛 ${ENLACE_RESENA_GOOGLE}`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-oliva hover:underline"
              >
                Enviar enlace
              </a>
            )}
            <button onClick={alternarResena} disabled={ocupado} className="text-xs font-semibold text-carbon/60 hover:underline">
              Confirmar reseña
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3 text-xs font-semibold">
          {cliente.telefono && (
            <a href={enlaceWhatsapp(cliente.telefono)} target="_blank" rel="noopener noreferrer" className="text-oliva hover:underline">WhatsApp</a>
          )}
          <button onClick={onEditar} className="text-oliva hover:underline">Editar</button>
          <button onClick={alternarArchivado} disabled={ocupado} className="text-carbon/50 hover:underline">{cliente.activo ? 'Archivar' : 'Reactivar'}</button>
          <button onClick={borrar} disabled={ocupado} className="text-error hover:underline">Borrar</button>
        </div>
      </td>
    </tr>
  )
}

function FormularioCliente({ cliente, onGuardado }: { cliente: ClienteResumen | null; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '')
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '')
  const [email, setEmail] = useState(cliente?.email ?? '')
  const [consentimientoMarketing, setConsentimientoMarketing] = useState(cliente?.consentimiento_marketing ?? false)
  const [notas, setNotas] = useState(cliente?.notas ?? '')
  const [duplicados, setDuplicados] = useState<ClienteResumen[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cliente || !telefono || telefono.replace(/\D/g, '').length < 7) { setDuplicados([]); return }
    const t = setTimeout(() => {
      buscarPosiblesDuplicados(telefono)
        .then((r) => setDuplicados(r.filter((c) => telefonosEquivalentes(c.telefono ?? '', telefono))))
        .catch(() => setDuplicados([]))
    }, 300)
    return () => clearTimeout(t)
  }, [telefono, cliente])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (isDemoMode) { onGuardado(); return }
    if (!cliente && duplicados.length > 0) {
      setError('Ya existe una clienta con ese teléfono. Abre su registro en vez de crear uno nuevo.')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const datos: DatosCliente = { nombre, telefono: telefono || null, email: email || null, consentimientoMarketing, notas }
      if (cliente) await actualizarClienteAdmin(cliente.id, datos)
      else await crearClienteAdmin(datos)
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
      {cliente?.usuario_id && (
        <p className="rounded-lg bg-piedra/30 p-3 text-xs text-carbon/60">Esta persona tiene cuenta propia. Puede actualizar su nombre/teléfono/correo desde su perfil también.</p>
      )}
      {duplicados.length > 0 && (
        <div className="rounded-lg border border-advertencia/40 bg-advertencia/10 p-3 text-sm">
          <p className="mb-1 font-semibold text-carbon">Ya existe una clienta con este teléfono</p>
          {duplicados.map((d) => (
            <Link key={d.id} to={`/admin/clientes/${d.id}`} className="block font-semibold text-oliva hover:underline">Abrir el registro de {d.nombre} →</Link>
          ))}
        </div>
      )}
      <Input id="nombreCliente" etiqueta="Nombre completo" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Input id="telefonoCliente" etiqueta="WhatsApp" required value={telefono ?? ''} onChange={(e) => setTelefono(e.target.value)} placeholder="300 123 4567" />
      <Input id="emailCliente" etiqueta="Correo (opcional)" type="email" value={email ?? ''} onChange={(e) => setEmail(e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-carbon">
        <input type="checkbox" checked={consentimientoMarketing} onChange={(e) => setConsentimientoMarketing(e.target.checked)} />
        Autoriza recibir promociones
      </label>
      <Input id="notasCliente" etiqueta="Notas internas (opcional)" value={notas ?? ''} onChange={(e) => setNotas(e.target.value)} />
      <Button type="submit" cargando={guardando}>{cliente ? 'Guardar cambios' : 'Crear cliente'}</Button>
    </form>
  )
}

function ModalCompartirRegistro({ abierto, onCerrar, onActualizar }: { abierto: boolean; onCerrar: () => void; onActualizar: () => void }) {
  return (
    <ModalCompartirQR
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Claudia Patricia"
      encabezado="Comparte una mejor bienvenida"
      subtexto="Un escaneo y tus clientes podrán completar su registro."
      url={urlRegistroPublico()}
      nombreArchivo="registro-claudia-patricia-qr.png"
      textoEscaneo="Escanea para registrarte"
      extra={
        <button onClick={onActualizar} className="mt-4 block w-full text-center text-sm font-semibold text-oliva hover:underline">
          ¿Ya completaron el registro? Actualizar clientes
        </button>
      }
    />
  )
}
