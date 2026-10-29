import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconoCampana } from '../ui/Icons'
import { useNotificaciones, type Notificacion } from '../../lib/notificaciones/useNotificaciones'
import type { EventoEnVivo } from '../../lib/notificaciones/useEventosEnVivo'

const ETIQUETA_TIPO: Record<string, string> = {
  gasto: 'Gasto',
  seguimiento: 'Seguimiento',
  canje: 'Canje',
  reserva_nueva: 'Reserva',
  venta_nueva: 'Venta',
  cliente_nuevo: 'Clienta',
}

// Centro de notificaciones del admin: une Gastos por vencer, Seguimientos pendientes (Clientes)
// y Canjes por entregar (Fidelización) — lo que necesita atención, por polling — con los
// eventos en vivo (reserva nueva, venta cobrada, clienta nueva — 0082, por Realtime con sonido,
// ver ToastEventosEnVivo) en una sola campanita con lista desplegable.
export function NotificacionesCampana({ activo, eventosEnVivo = [] }: { activo: boolean; eventosEnVivo?: EventoEnVivo[] }) {
  const [abierto, setAbierto] = useState(false)
  const { notificaciones: pendientes } = useNotificaciones(activo)
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  // Los eventos en vivo van primero (son los más recientes por definición: acaban de pasar
  // mientras la pantalla estaba abierta) y nunca se marcan "urgente" — esa bandera es para
  // gastos vencidos, no para avisos de actividad.
  const notificaciones: Notificacion[] = useMemo(
    () => [
      ...eventosEnVivo.map((e) => ({ id: e.id, tipo: e.tipo, titulo: e.titulo, subtitulo: e.subtitulo, urgente: false, ruta: e.ruta })),
      ...pendientes,
    ],
    [eventosEnVivo, pendientes],
  )

  useEffect(() => {
    if (!abierto) return
    function alClicFuera(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setAbierto(false)
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', alClicFuera)
    document.addEventListener('keydown', alEscape)
    return () => {
      document.removeEventListener('mousedown', alClicFuera)
      document.removeEventListener('keydown', alEscape)
    }
  }, [abierto])

  if (!activo) return null

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-label="Notificaciones"
        aria-expanded={abierto}
        className="relative rounded-full p-2 text-carbon/60 hover:bg-piedra/40 hover:text-carbon"
      >
        <IconoCampana className="h-5 w-5" />
        {notificaciones.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold text-blanco">
            {notificaciones.length > 9 ? '9+' : notificaciones.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] rounded-xl border border-piedra bg-blanco p-2 shadow-lg">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/40">Notificaciones</p>
          {notificaciones.length === 0 ? (
            <p className="px-2 py-3 text-sm text-carbon/50">No hay nada que necesite atención por ahora.</p>
          ) : (
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {notificaciones.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setAbierto(false)
                    navigate(n.ruta)
                  }}
                  className="flex flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-piedra/30"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${n.urgente ? 'bg-error/15 text-error' : 'bg-piedra text-carbon/60'}`}
                    >
                      {ETIQUETA_TIPO[n.tipo]}
                    </span>
                    <span className="truncate text-sm font-medium text-carbon">{n.titulo}</span>
                  </span>
                  <span className="truncate text-xs text-carbon/50">{n.subtitulo}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
