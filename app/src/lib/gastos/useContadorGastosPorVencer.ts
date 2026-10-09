import { useEffect, useState } from 'react'
import { listarGastosPorVencer } from '../api/gastos'

// Mismo patrón que useContadorSeguimientosPendientes (Clientes) y useContadorCanjesPendientes
// (Fidelización): un número junto a "Gastos" en el menú en vez de un sistema de notificaciones
// aparte — reutiliza la misma consulta que ya alimenta la card de "Por vencer" de la pantalla.
const INTERVALO_MS = 45_000

export function useContadorGastosPorVencer(activo: boolean): number {
  const [contador, setContador] = useState(0)

  useEffect(() => {
    if (!activo) {
      setContador(0)
      return
    }
    let cancelado = false
    async function cargar() {
      try {
        const porVencer = await listarGastosPorVencer()
        if (!cancelado) setContador(porVencer.length)
      } catch {
        // Si falla la consulta (red, etc.) el badge simplemente no se actualiza en este ciclo.
      }
    }
    cargar()
    const intervalo = setInterval(cargar, INTERVALO_MS)
    return () => {
      cancelado = true
      clearInterval(intervalo)
    }
  }, [activo])

  return contador
}
