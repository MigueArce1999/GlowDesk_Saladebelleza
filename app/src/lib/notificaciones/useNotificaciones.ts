import { useEffect, useState } from 'react'
import { listarGastosPorVencer } from '../api/gastos'
import { listarSeguimientosPendientes } from '../api/clientes'
import { listarCanjesPendientesEntrega } from '../api/fidelizacion'
import { formatoFechaCorta, formatoMoneda } from '../format'

export type TipoNotificacion = 'gasto' | 'seguimiento' | 'canje'

export interface Notificacion {
  id: string
  tipo: TipoNotificacion
  titulo: string
  subtitulo: string
  urgente: boolean
  // A dónde navegar al hacer clic — siempre una ruta dentro de /admin (cada pantalla ya sabe
  // resolver el detalle correspondiente desde su propio listado, así que no hace falta abrir el
  // detalle directo desde acá).
  ruta: string
}

// Centro de notificaciones: une las tres colas de "esto necesita atención" que ya existían por
// separado (badge de Gastos, de Clientes y de Fidelización) en una sola campanita con lista, sin
// tocar esas consultas — solo las reempaqueta en una forma común. Mismo intervalo de polling que
// ya usaban los tres badges (45s), ahora en un solo timer.
const INTERVALO_MS = 45_000

export function useNotificaciones(activo: boolean): { notificaciones: Notificacion[]; cargando: boolean } {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!activo) {
      setNotificaciones([])
      setCargando(false)
      return
    }
    let cancelado = false

    async function cargar() {
      try {
        const [gastos, seguimientos, canjes] = await Promise.all([
          listarGastosPorVencer(),
          listarSeguimientosPendientes(),
          listarCanjesPendientesEntrega(),
        ])
        if (cancelado) return

        const deGastos: Notificacion[] = gastos.map((g) => ({
          id: `gasto-${g.id}`,
          tipo: 'gasto',
          titulo: g.concepto,
          subtitulo: `${g.vencido ? 'Venció el' : 'Vence el'} ${formatoFechaCorta(g.fecha_vencimiento)} · ${formatoMoneda(g.saldo_pendiente)}`,
          urgente: g.vencido,
          ruta: '/admin/gastos',
        }))
        const deSeguimientos: Notificacion[] = seguimientos.map((s) => ({
          id: `seguimiento-${s.id}`,
          tipo: 'seguimiento',
          titulo: s.cliente_nombre,
          subtitulo: s.descripcion,
          urgente: false,
          ruta: '/admin/clientes',
        }))
        const deCanjes: Notificacion[] = canjes.map((c) => ({
          id: `canje-${c.id}`,
          tipo: 'canje',
          titulo: c.cliente_nombre,
          subtitulo: `Autocanje por entregar: ${c.condiciones_snapshot.nombre}`,
          urgente: false,
          ruta: '/admin/fidelizacion',
        }))

        // Lo urgente primero (gastos vencidos), el resto en el orden en que ya venía cada cola.
        setNotificaciones([...deGastos, ...deSeguimientos, ...deCanjes].sort((a, b) => Number(b.urgente) - Number(a.urgente)))
      } catch {
        // Si falla la consulta (red, etc.) la lista simplemente no se actualiza en este ciclo.
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    cargar()
    const intervalo = setInterval(cargar, INTERVALO_MS)
    return () => {
      cancelado = true
      clearInterval(intervalo)
    }
  }, [activo])

  return { notificaciones, cargando }
}
