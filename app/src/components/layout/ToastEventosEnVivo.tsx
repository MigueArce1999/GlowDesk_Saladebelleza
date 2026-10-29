import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconoCampana } from '../ui/Icons'
import type { EventoEnVivo } from '../../lib/notificaciones/useEventosEnVivo'

const DURACION_MS = 7_000

const ETIQUETA: Record<string, string> = {
  reserva_nueva: 'Nueva reserva',
  venta_nueva: 'Nueva venta',
  cliente_nuevo: 'Nueva clienta',
}

// Tarjetas flotantes que aparecen un momento cuando llega un evento en vivo (useEventosEnVivo)
// y se apagan solas — la campanita del header (NotificacionesCampana) ya guarda el historial
// de la sesión, esto es solo el aviso inmediato ("¡mira, pasó esto ahora!") con sonido.
export function ToastEventosEnVivo({ eventos }: { eventos: EventoEnVivo[] }) {
  const [visibles, setVisibles] = useState<EventoEnVivo[]>([])
  const vistosRef = useRef<Set<string>>(new Set())
  const navigate = useNavigate()

  useEffect(() => {
    const nuevos = eventos.filter((e) => !vistosRef.current.has(e.id))
    if (nuevos.length === 0) return
    for (const n of nuevos) vistosRef.current.add(n.id)
    setVisibles((prev) => [...nuevos, ...prev])
    for (const n of nuevos) {
      setTimeout(() => {
        setVisibles((prev) => prev.filter((v) => v.id !== n.id))
      }, DURACION_MS)
    }
  }, [eventos])

  if (visibles.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2">
      {visibles.map((e) => (
        <button
          key={e.id}
          onClick={() => {
            setVisibles((prev) => prev.filter((v) => v.id !== e.id))
            navigate(e.ruta)
          }}
          className="toast-evento-entra pointer-events-auto flex items-start gap-3 rounded-xl border border-piedra bg-blanco p-3 text-left shadow-lg"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-oliva/15 text-oliva">
            <IconoCampana className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-carbon">{ETIQUETA[e.tipo] ?? e.titulo}</span>
            <span className="block truncate text-xs text-carbon/60">{e.subtitulo}</span>
          </span>
          <span
            onClick={(ev) => { ev.stopPropagation(); setVisibles((prev) => prev.filter((v) => v.id !== e.id)) }}
            role="button"
            aria-label="Cerrar notificación"
            className="shrink-0 rounded-full p-1 text-carbon/30 hover:bg-piedra/40 hover:text-carbon/60"
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  )
}
