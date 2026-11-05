import { useEffect, useState } from 'react'
import { Drawer } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Cargando, EmptyState, ErrorState } from '../ui/Estados'
import { listarComisiones, crearLiquidacion } from '../../lib/api/empleada'
import { formatoFecha, formatoMoneda } from '../../lib/format'
import type { ComisionResumen, Profesional } from '../../lib/types'

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
}

function nombreOrigen(c: ComisionResumen): string {
  return c.servicio_nombre ?? `Venta: ${c.producto_nombre}`
}

// Equipo (Dashboard) → tocar una profesional abre esto: ver y liquidar sus comisiones del
// periodo activo del Dashboard — misma lógica que ya usaba "Mis ventas" de la propia empleada
// (listarComisiones/crearLiquidacion, sin duplicar), con el desglose por método de pago que
// agregó vista_comision.metodos_pago (0083).
export function DrawerLiquidarProfesional({
  profesional,
  desde,
  hasta,
  onCerrar,
  onLiquidado,
}: {
  profesional: Profesional | null
  desde: string
  hasta: string
  onCerrar: () => void
  onLiquidado: () => void
}) {
  const [comisiones, setComisiones] = useState<ComisionResumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [liquidando, setLiquidando] = useState(false)
  const [errorLiquidar, setErrorLiquidar] = useState<string | null>(null)

  function cargar() {
    if (!profesional) return
    setComisiones(null)
    setError(null)
    listarComisiones(profesional.id, desde, hasta).then(setComisiones).catch((e) => setError(e.message))
  }

  useEffect(cargar, [profesional, desde, hasta])

  async function liquidar() {
    if (!profesional) return
    setLiquidando(true)
    setErrorLiquidar(null)
    try {
      await crearLiquidacion(profesional.id, desde, hasta)
      cargar()
      onLiquidado()
    } catch (e: any) {
      setErrorLiquidar(e.message)
    } finally {
      setLiquidando(false)
    }
  }

  const vendio = comisiones?.reduce((acc, c) => acc + Number(c.base_calculo), 0) ?? 0
  const seLleva = comisiones?.reduce((acc, c) => acc + Number(c.valor), 0) ?? 0
  const negocio = vendio - seLleva
  const liquidado = comisiones?.filter((c) => c.estado === 'liquidada').reduce((acc, c) => acc + Number(c.valor), 0) ?? 0
  const pendiente = seLleva - liquidado

  // Suma, en todo el periodo, cuánto de "lo que se lleva" vino de cada método de pago — cada
  // comisión ya trae su propio reparto prorrateado (metodos_pago, ver 0083); acá solo se suman
  // por método a través de todas las comisiones.
  const porMetodo = new Map<string, number>()
  for (const c of comisiones ?? []) {
    for (const m of c.metodos_pago ?? []) {
      porMetodo.set(m.metodo, (porMetodo.get(m.metodo) ?? 0) + Number(m.monto))
    }
  }
  const totalPorMetodo = Array.from(porMetodo.values()).reduce((acc, v) => acc + v, 0)

  return (
    <Drawer abierto={!!profesional} onCerrar={onCerrar} titulo={profesional?.nombre ?? ''}>
      {!comisiones ? (
        error ? <ErrorState mensaje={error} /> : <Cargando filas={4} />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-xs text-carbon/50">
            Periodo del {formatoFecha(desde)} al {formatoFecha(hasta)} · hora de Colombia (GMT-5).
          </p>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-piedra p-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/50">Vendió</p>
              <p className="font-marca text-lg font-semibold text-carbon">{formatoMoneda(vendio)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/50">Se lleva</p>
              <p className="font-marca text-lg font-semibold text-carbon">{formatoMoneda(seLleva)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/50">Negocio</p>
              <p className="font-marca text-lg font-semibold text-oliva">{formatoMoneda(negocio)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-oliva/10 p-3">
            {errorLiquidar && <ErrorState mensaje={errorLiquidar} />}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon/50">Pendiente por liquidar</p>
                <p className="font-marca text-xl font-semibold text-carbon">{formatoMoneda(pendiente)}</p>
                <p className="mt-1 text-xs text-carbon/60">Ya liquidado en este periodo: {formatoMoneda(liquidado)}</p>
              </div>
              <Button tamano="sm" onClick={liquidar} cargando={liquidando} disabled={pendiente <= 0}>
                Liquidar
              </Button>
            </div>
            <p className="text-xs text-carbon/50">
              Marca como pagadas sus comisiones de este periodo. Una comisión liquidada no se vuelve a pagar.
            </p>
          </div>

          {totalPorMetodo > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-piedra p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-carbon">Lo que se lleva, según cómo pagó el cliente</p>
                <p className="text-xs text-carbon/50">Total {formatoMoneda(totalPorMetodo)}</p>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-piedra/40">
                {Array.from(porMetodo.entries()).map(([metodo, monto], i) => (
                  <div
                    key={metodo}
                    style={{ width: `${(monto / totalPorMetodo) * 100}%` }}
                    className={i % 2 === 0 ? 'bg-oliva' : 'bg-champan'}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {Array.from(porMetodo.entries()).map(([metodo, monto], i) => (
                  <div key={metodo} className="flex items-center gap-1.5 text-xs">
                    <span className={`h-2 w-2 rounded-full ${i % 2 === 0 ? 'bg-oliva' : 'bg-champan'}`} />
                    <span className="text-carbon/60">{ETIQUETA_METODO[metodo] ?? metodo}</span>
                    <span className="font-semibold text-carbon">{formatoMoneda(monto)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-carbon/40">
                Si un cliente pagó con dos métodos, la comisión de esa venta se reparte en la misma proporción.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-carbon">Ventas ({comisiones.length})</p>
            {comisiones.length === 0 ? (
              <EmptyState titulo="Sin ventas en este periodo" />
            ) : (
              comisiones.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-piedra/60 pb-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-carbon">{nombreOrigen(c)}</p>
                    <p className="truncate text-xs text-carbon/50">{c.cliente_nombre}</p>
                    <p className="text-xs text-carbon/40">{formatoFecha(c.creado_en)}</p>
                    {c.metodos_pago && c.metodos_pago.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.metodos_pago.map((m, i) => (
                          <span key={i} className="rounded-full bg-piedra/40 px-2 py-0.5 text-[10px] font-semibold text-carbon/60">
                            {ETIQUETA_METODO[m.metodo] ?? m.metodo}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-carbon">{formatoMoneda(c.base_calculo)}</p>
                    <p className="text-xs text-carbon/50">se lleva {formatoMoneda(c.valor)}</p>
                    <p className="text-xs font-medium text-oliva">negocio {formatoMoneda(c.base_calculo - c.valor)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}
