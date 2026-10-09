import { useEffect, useState } from 'react'
import { Card, ErrorState } from '../ui/Estados'
import { listarGastosPorVencer } from '../../lib/api/gastos'
import { formatoFechaCorta, formatoMoneda } from '../../lib/format'
import type { Gasto } from '../../lib/types'

// Mismo patrón que "Seguimientos pendientes" (Clientes) y "Canjes por entregar" (Fidelización):
// una cola de "esto necesita atención pronto" como card visible de inmediato — el aviso
// consolidado de las tres colas vive en la campanita del header (ver
// lib/notificaciones/useNotificaciones.ts).
export function GastosPorVencerCard({ onSeleccionar }: { onSeleccionar?: (gasto: Gasto) => void }) {
  const [gastos, setGastos] = useState<Gasto[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function cargar() {
    setError(null)
    listarGastosPorVencer().then(setGastos).catch((e) => setError(e.message))
  }
  useEffect(cargar, [])

  if (error) return <ErrorState mensaje={error} reintentar={cargar} />
  if (!gastos || gastos.length === 0) return null

  const hayVencidos = gastos.some((g) => g.vencido)

  return (
    <Card className={`flex flex-col gap-3 ${hayVencidos ? 'border-error/40 bg-error/5' : 'border-champan/60 bg-champan/10'}`}>
      <p className="font-semibold text-carbon">
        Gastos por vencer
        <span className="ml-2 text-xs font-normal text-carbon/50">
          {gastos.length} {gastos.length === 1 ? 'gasto necesita' : 'gastos necesitan'} atención
        </span>
      </p>
      <div className="flex flex-col gap-2">
        {gastos.map((g) => (
          <button
            key={g.id}
            onClick={() => onSeleccionar?.(g)}
            disabled={!onSeleccionar}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blanco px-3 py-2 text-left disabled:cursor-default"
          >
            <div>
              <p className="text-sm font-medium text-carbon">
                {g.concepto}
                {g.proveedor_nombre && <span className="font-normal text-carbon/50"> · {g.proveedor_nombre}</span>}
              </p>
              <p className="text-xs text-carbon/50">
                {g.vencido ? (
                  <span className="font-semibold text-error">Venció el {formatoFechaCorta(g.fecha_vencimiento)}</span>
                ) : (
                  <>Vence el {formatoFechaCorta(g.fecha_vencimiento)}</>
                )}
              </p>
            </div>
            <span className="text-sm font-semibold text-carbon">{formatoMoneda(g.saldo_pendiente)}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}
