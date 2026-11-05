import { Card, EmptyState } from '../ui/Estados'
import { formatoMoneda } from '../../lib/format'
import type { AnalyticsPorProfesional } from '../../lib/types'

// Comisión leída tal cual de `comision` (ver fn_analytics_resumen) — nunca un porcentaje
// recalculado acá, respeta la configuración real de cada profesional (regla general +
// excepciones por servicio, ver AdminComisiones/Equipo).
// Cada fila es tocable: abre DrawerLiquidarProfesional (ver Dashboard.tsx) para ver el detalle
// de ESA profesional en el mismo periodo activo y liquidar sus comisiones desde ahí mismo, sin
// tener que ir hasta Admin → Comisiones.
export function ProfessionalPerformance({ filas, onSeleccionar }: { filas: AnalyticsPorProfesional[]; onSeleccionar: (profesionalId: string) => void }) {
  return (
    <Card>
      <p className="mb-1 font-semibold text-carbon">Equipo</p>
      {filas.length === 0 ? (
        <EmptyState titulo="Sin ventas en este periodo" />
      ) : (
        <>
          <p className="mb-2 text-xs text-carbon/50">Toca a alguien para ver sus ventas y liquidar.</p>
          <ul className="flex flex-col gap-1">
            {filas.map((f) => (
              <li key={f.profesional_id}>
                <button
                  onClick={() => onSeleccionar(f.profesional_id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border-b border-piedra/50 py-3 text-left last:border-0 hover:bg-piedra/20"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-carbon">{f.nombre}</p>
                    <p className="text-xs text-carbon/50">
                      {f.clientes} {f.clientes === 1 ? 'cliente' : 'clientes'} · {f.servicios} {f.servicios === 1 ? 'servicio' : 'servicios'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-carbon">{formatoMoneda(f.ventas)}</p>
                    <p className="text-xs font-semibold text-oliva">Ver y liquidar →</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
