// Agrupación mensual compartida para la vista "Ingresos vs Gastos" (0088): ventas e ingresos
// vienen de fuentes distintas (serie_diaria de fn_analytics_resumen vs. Gasto[] de listarGastos)
// pero deben alinearse por la MISMA clave "yyyy-MM" para que las barras del mismo mes queden
// una al lado de la otra — nunca comparando por posición de índice, que se corre si a un mes le
// falta un dato.
import { format, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AnalyticsSerieDia } from '../types'
import type { Gasto } from '../types'

export interface PuntoComparativo {
  clave: string // yyyy-MM
  etiqueta: string
  ingresos: number
  gastos: number
}

function etiquetaDeMes(claveAnioMes: string): string {
  return format(new Date(`${claveAnioMes}-01T00:00:00`), 'MMM yyyy', { locale: es })
}

// Las últimas `cantidad` claves yyyy-MM, de más antigua a más reciente, incluyendo el mes
// actual — generadas explícitamente (no derivadas de los datos) para que un mes sin ventas NI
// gastos siga apareciendo en cero, en vez de desaparecer de la gráfica.
export function ultimosMeses(cantidad: number, ahora = new Date()): string[] {
  const claves: string[] = []
  for (let i = cantidad - 1; i >= 0; i--) {
    claves.push(format(subMonths(ahora, i), 'yyyy-MM'))
  }
  return claves
}

export function agruparComparativoPorMes(
  claves: string[],
  serieVentas: AnalyticsSerieDia[],
  gastos: Pick<Gasto, 'fecha' | 'valor_total' | 'anulado'>[],
): PuntoComparativo[] {
  const ingresosPorMes = new Map<string, number>()
  for (const d of serieVentas) {
    const clave = d.fecha.slice(0, 7)
    ingresosPorMes.set(clave, (ingresosPorMes.get(clave) ?? 0) + d.ventas)
  }
  const gastosPorMes = new Map<string, number>()
  for (const g of gastos) {
    if (g.anulado) continue
    const clave = g.fecha.slice(0, 7)
    gastosPorMes.set(clave, (gastosPorMes.get(clave) ?? 0) + Number(g.valor_total))
  }
  return claves.map((clave) => ({
    clave,
    etiqueta: etiquetaDeMes(clave),
    ingresos: ingresosPorMes.get(clave) ?? 0,
    gastos: gastosPorMes.get(clave) ?? 0,
  }))
}

// Gastos por categoría del periodo (para el donut) — mismo criterio de exclusión de anulados.
export function gastosPorCategoria(gastos: Pick<Gasto, 'categoria_nombre' | 'valor_total' | 'anulado'>[]): { etiqueta: string; valor: number }[] {
  const acc = new Map<string, number>()
  for (const g of gastos) {
    if (g.anulado) continue
    acc.set(g.categoria_nombre, (acc.get(g.categoria_nombre) ?? 0) + Number(g.valor_total))
  }
  return [...acc.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor }))
}
