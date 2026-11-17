import { Card, EmptyState } from '../ui/Estados'
import { formatoMoneda } from '../../lib/format'
import type { PuntoComparativo } from '../../lib/analytics/ingresosVsGastos'

// Mismo patrón que SalesTrendChart (divs, no SVG) y los mismos colores de marca: oliva para
// ingresos, un tono de error suave para gastos — la comparación solo se lee de un vistazo si
// los dos colores no se confunden entre sí.
export function IngresosVsGastosChart({ puntos }: { puntos: PuntoComparativo[] }) {
  const hayDatos = puntos.some((p) => p.ingresos > 0 || p.gastos > 0)
  const maximo = Math.max(1, ...puntos.map((p) => p.ingresos), ...puntos.map((p) => p.gastos))

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-carbon">Ingresos vs. gastos por mes</p>
          <p className="text-xs text-carbon/50">Ventas netas del mes contra gastos registrados en ese mes (por fecha del gasto, no de pago)</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-carbon/60">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-oliva" aria-hidden /> Ingresos
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-error/70" aria-hidden /> Gastos
          </span>
        </div>
      </div>

      {!hayDatos ? (
        <EmptyState titulo="Sin ventas ni gastos en estos meses" />
      ) : (
        <div className="flex h-48 items-end gap-2 overflow-x-auto">
          {puntos.map((p) => (
            <div key={p.clave} className="flex min-w-[48px] flex-1 flex-col items-center gap-1">
              <div className="flex h-40 w-full items-end justify-center gap-1">
                <div
                  className="w-full rounded-t bg-oliva transition-[height]"
                  style={{ height: `${Math.max(2, (p.ingresos / maximo) * 100)}%` }}
                  role="img"
                  aria-label={`Ingresos ${p.etiqueta}: ${formatoMoneda(p.ingresos)}`}
                />
                <div
                  className="w-full rounded-t bg-error/70 transition-[height]"
                  style={{ height: `${Math.max(2, (p.gastos / maximo) * 100)}%` }}
                  role="img"
                  aria-label={`Gastos ${p.etiqueta}: ${formatoMoneda(p.gastos)}`}
                />
              </div>
              <span className="whitespace-nowrap text-[10px] capitalize text-carbon/50">{p.etiqueta}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
