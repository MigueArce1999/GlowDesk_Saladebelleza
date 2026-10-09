import { describe, expect, it } from 'vitest'
import { fechaBogotaISO, formatoFecha, formatoFechaHora, formatoHora, formatoMoneda, rangoPeriodo } from './format'

describe('formatoHora / formatoFecha', () => {
  it('formatean una fecha válida sin problema', () => {
    expect(formatoHora('2026-09-21T15:30:00.000Z')).toMatch(/\d/)
    expect(formatoFecha('2026-09-21T15:30:00.000Z')).toMatch(/2026/)
  })

  it('nunca truenan con una fecha inválida — devuelven "—" en vez de lanzar RangeError', () => {
    expect(() => formatoHora('')).not.toThrow()
    expect(() => formatoFecha('')).not.toThrow()
    expect(formatoHora('')).toBe('—')
    expect(formatoFecha('')).toBe('—')
  })

  it('tampoco truenan con undefined/null, aunque el tipo declarado sea string (fila con dato corrupto)', () => {
    expect(formatoHora(undefined as unknown as string)).toBe('—')
    expect(formatoFecha(null as unknown as string)).toBe('—')
  })

  it('formatoFechaHora hereda la misma protección (compone las otras dos)', () => {
    expect(() => formatoFechaHora('no-es-una-fecha')).not.toThrow()
    expect(formatoFechaHora('no-es-una-fecha')).toBe('— · —')
  })
})

describe('formatoMoneda', () => {
  it('null/undefined muestran "—" en vez de "$NaN"', () => {
    expect(formatoMoneda(null)).toBe('—')
    expect(formatoMoneda(undefined)).toBe('—')
  })
})

describe('rangoPeriodo', () => {
  it('"ayer" cubre el día calendario anterior en Bogotá, un día completo antes que "hoy"', () => {
    const hoy = rangoPeriodo('hoy')
    const ayer = rangoPeriodo('ayer')
    const diaAyer = ayer.desde.slice(0, 10)
    const diaHoy = hoy.desde.slice(0, 10)
    expect(diaAyer).toBe(fechaBogotaISO(new Date(Date.now() - 24 * 60 * 60 * 1000)))
    expect(ayer.desde).toBe(`${diaAyer}T00:00:00-05:00`)
    expect(ayer.hasta).toBe(`${diaAyer}T23:59:59-05:00`)
    expect(diaAyer).not.toBe(diaHoy)
  })

  it('lleva el offset -05:00 explícito, para que Postgres no interprete el rango como UTC y lo corra 5 horas', () => {
    const hoy = rangoPeriodo('hoy')
    expect(hoy.desde.endsWith('-05:00')).toBe(true)
    expect(hoy.hasta.endsWith('-05:00')).toBe(true)
    // Un servicio registrado anoche a las 11pm Bogotá (04:00 UTC de hoy) no debe caer dentro de
    // "hoy": antes de este fix, el rango "hoy" se interpretaba desde las 00:00 UTC (19:00 Bogotá
    // de ayer), así que SÍ lo incluía por error.
    const anocheBogota = new Date(`${fechaBogotaISO(new Date(Date.now() - 24 * 60 * 60 * 1000))}T23:00:00-05:00`)
    expect(anocheBogota.toISOString() >= new Date(hoy.desde).toISOString()).toBe(false)
  })
})
