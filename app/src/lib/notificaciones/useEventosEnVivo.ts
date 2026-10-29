import { useEffect, useRef, useState } from 'react'
import { isDemoMode, LOCAL_ID, supabase } from '../supabase'
import { reproducirCampanita } from './sonido'
import { formatoMoneda } from '../format'

export type TipoEventoEnVivo = 'reserva_nueva' | 'venta_nueva' | 'cliente_nuevo'

export interface EventoEnVivo {
  id: string
  tipo: TipoEventoEnVivo
  titulo: string
  subtitulo: string
  ruta: string
  creadoEn: number
}

const MAX_EVENTOS = 20

// Notificaciones en vivo de admin (0082): nueva reserva, venta recién cobrada y clienta nueva,
// con sonido — a diferencia de useNotificaciones (que hace polling de "pendientes por atender":
// gastos, seguimientos, canjes), esto escucha Realtime directo sobre reserva/atencion/cliente.
// RLS ya scoping por local (reserva_select, atencion_select, cliente_select) — Realtime respeta
// esa misma RLS por suscriptor, así que no hace falta ninguna tabla intermedia (ver comentario
// en la migración 0082 sobre por qué esto es distinto de GlowDesk Live).
export function useEventosEnVivo(activo: boolean): EventoEnVivo[] {
  const [eventos, setEventos] = useState<EventoEnVivo[]>([])
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => { montadoRef.current = false }
  }, [])

  useEffect(() => {
    if (!activo || isDemoMode || !supabase || !LOCAL_ID) return

    function agregar(evento: Omit<EventoEnVivo, 'creadoEn'>) {
      // Nunca suena en la primera carga de la página: la suscripción de Realtime solo entrega
      // cambios ocurridos DESPUÉS de que el canal quedó conectado, así que cualquier evento que
      // llegue acá ya es, por construcción, algo nuevo mientras la pantalla está abierta.
      reproducirCampanita()
      setEventos((prev) => [{ ...evento, creadoEn: Date.now() }, ...prev].slice(0, MAX_EVENTOS))
    }

    const canal = supabase
      .channel(`notificaciones-admin-${LOCAL_ID}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reserva', filter: `local_id=eq.${LOCAL_ID}` },
        async (payload) => {
          const id = (payload.new as { id: string }).id
          const { data } = await supabase!.from('vista_reserva').select('cliente_nombre, servicio_nombre').eq('id', id).maybeSingle()
          if (!montadoRef.current) return
          agregar({
            id: `reserva-${id}`,
            tipo: 'reserva_nueva',
            titulo: 'Nueva reserva',
            subtitulo: data ? `${data.cliente_nombre} · ${data.servicio_nombre}` : 'Se agendó una cita nueva',
            ruta: '/admin/agenda',
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'atencion', filter: `local_id=eq.${LOCAL_ID}` },
        async (payload) => {
          const antes = payload.old as { estado?: string } | null
          const ahora = payload.new as { id: string; estado: string }
          // Solo el instante en que la atención PASA A completada es "una venta nueva" — una
          // edición cualquiera (notas, nombre de cliente) dispara el mismo UPDATE pero no debe
          // sonar otra vez. Ver "replica identity full" en la migración 0082: sin eso, `antes`
          // solo traería el id, nunca su estado anterior.
          if (ahora.estado !== 'completada' || antes?.estado === 'completada') return
          const { data } = await supabase!.from('vista_atencion').select('cliente_nombre, total_vendido').eq('id', ahora.id).maybeSingle()
          if (!montadoRef.current) return
          agregar({
            id: `venta-${ahora.id}`,
            tipo: 'venta_nueva',
            titulo: 'Nueva venta',
            subtitulo: data ? `${data.cliente_nombre} · ${formatoMoneda(data.total_vendido)}` : 'Se cobró una atención',
            ruta: '/admin/ventas',
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cliente', filter: `local_id=eq.${LOCAL_ID}` },
        (payload) => {
          const nueva = payload.new as { id: string; nombre: string }
          agregar({
            id: `cliente-${nueva.id}`,
            tipo: 'cliente_nuevo',
            titulo: 'Nueva clienta',
            subtitulo: nueva.nombre,
            ruta: '/admin/clientes',
          })
        },
      )
      .subscribe()

    return () => {
      supabase!.removeChannel(canal)
    }
  }, [activo])

  return eventos
}
