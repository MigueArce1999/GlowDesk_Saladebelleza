import { useEffect, useState } from 'react'
import { Card, Cargando, ErrorState } from '../../components/ui/Estados'
import { DonutChart } from '../../components/charts/DonutChart'
import { IngresosVsGastosChart } from '../../components/analytics/IngresosVsGastosChart'
import { resumenNegocio } from '../../lib/api/admin'
import { obtenerAnalytics } from '../../lib/api/analytics'
import { listarGastos } from '../../lib/api/gastos'
import { agruparComparativoPorMes, gastosPorCategoria, ultimosMeses } from '../../lib/analytics/ingresosVsGastos'
import { calcularRangoMes, calcularRangoPreset } from '../../lib/analytics/rangoFecha'
import { formatoMoneda } from '../../lib/format'
import type { PuntoComparativo } from '../../lib/analytics/ingresosVsGastos'
import type { Gasto } from '../../lib/types'

type Periodo = 'hoy' | 'semana' | 'mes'
const MESES_TENDENCIA = 6

export function AdminIngresosVsGastos() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  const [ingresosPeriodo, setIngresosPeriodo] = useState<number | null>(null)
  const [gastosPeriodo, setGastosPeriodo] = useState<Gasto[] | null>(null)
  const [tendencia, setTendencia] = useState<PuntoComparativo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const rango = calcularRangoPreset(periodo)
    setIngresosPeriodo(null)
    setGastosPeriodo(null)
    resumenNegocio(rango.desde.toISOString(), rango.hasta.toISOString())
      .then((d) => setIngresosPeriodo(d.ventasNetas))
      .catch((e) => setError(e.message))
    listarGastos({ campoFecha: 'fecha', desde: rango.desde.toISOString().slice(0, 10), hasta: rango.hasta.toISOString().slice(0, 10) })
      .then(setGastosPeriodo)
      .catch((e) => setError(e.message))
  }, [periodo])

  // La tendencia de los últimos 6 meses es fija (no depende del selector de arriba, que solo
  // alimenta las cifras del encabezado) — sirve para ver si el negocio va mejorando o
  // empeorando mes a mes, no para un periodo puntual.
  useEffect(() => {
    const claves = ultimosMeses(MESES_TENDENCIA)
    const rangoTendencia = calcularRangoMes(-(MESES_TENDENCIA - 1))
    const hasta = new Date()
    Promise.all([
      obtenerAnalytics({ desde: rangoTendencia.desde, hasta }),
      listarGastos({ campoFecha: 'fecha', desde: rangoTendencia.desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }),
    ])
      .then(([analytics, gastos]) => setTendencia(agruparComparativoPorMes(claves, analytics.serie_diaria, gastos)))
      .catch((e) => setError(e.message))
  }, [])

  const totalGastosPeriodo = gastosPeriodo ? gastosPeriodo.filter((g) => !g.anulado).reduce((acc, g) => acc + Number(g.valor_total), 0) : null
  const neto = ingresosPeriodo !== null && totalGastosPeriodo !== null ? ingresosPeriodo - totalGastosPeriodo : null
  const segmentosCategoria = gastosPeriodo ? gastosPorCategoria(gastosPeriodo) : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-marca text-2xl font-semibold text-carbon">Ingresos vs. gastos</h1>
          <p className="text-sm text-carbon/60">Compara lo que entra con lo que sale, sin ir a buscarlo en dos pantallas distintas.</p>
        </div>
        <div className="flex gap-2">
          {(['hoy', 'semana', 'mes'] as Periodo[]).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${periodo === p ? 'bg-oliva text-blanco' : 'bg-piedra/40 text-carbon'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState mensaje={error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Ingresos" valor={ingresosPeriodo} ayuda="Ventas netas: servicios completados en el periodo" />
        <Kpi etiqueta="Gastos" valor={totalGastosPeriodo} ayuda="Gastos registrados con fecha en el periodo, sin contar anulados" />
        <Kpi etiqueta="Neto" valor={neto} ayuda="Ingresos menos gastos del periodo" destacar />
      </div>
      <p className="text-xs text-carbon/50">
        Esto compara lo DEVENGADO (ventas e insumos ya registrados), no el efectivo que entró o salió de caja — para
        eso está "Flujo neto" en el Resumen. Tampoco descuenta el costo de los insumos consumidos en cada servicio
        (ese módulo de compras/inventario todavía no existe).
      </p>

      {!tendencia ? <Cargando filas={2} /> : <IngresosVsGastosChart puntos={tendencia} />}

      <Card>
        {!gastosPeriodo ? (
          <Cargando filas={2} />
        ) : (
          <DonutChart
            titulo="Gastos por categoría"
            subtitulo={`En qué se fue la plata — periodo: ${periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}`}
            segmentos={segmentosCategoria}
            formatoValor={formatoMoneda}
          />
        )}
      </Card>
    </div>
  )
}

function Kpi({ etiqueta, valor, ayuda, destacar }: { etiqueta: string; valor: number | null; ayuda: string; destacar?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">{etiqueta}</p>
      <p className={`text-2xl font-semibold ${destacar && valor !== null && valor < 0 ? 'text-error' : destacar ? 'text-oliva' : 'text-carbon'}`}>
        {valor === null ? '—' : formatoMoneda(valor)}
      </p>
      <p className="text-[11px] text-carbon/40">{ayuda}</p>
    </Card>
  )
}
