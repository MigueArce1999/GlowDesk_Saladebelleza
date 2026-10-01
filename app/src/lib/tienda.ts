// Qué tienda (local) sirve esta pestaña.
//
//  * Instalación propia (cliente ESTÁNDAR): VITE_LOCAL_ID fijo en el build, como siempre.
//  * Instalación compartida (VITE_MULTI_TIENDA=1, sin VITE_LOCAL_ID): aquí viven las tiendas
//    DEMO de 10 días. La tienda sale de la ruta /t/<slug>/ (el resto de la navegación va en el
//    hash, HashRouter), y se resuelve ANTES de cargar App/lib/supabase.ts para que LOCAL_ID y el
//    header x-local-id ya tengan el id correcto.
//
// Este módulo no importa lib/supabase.ts a propósito (se evalúa antes que él).

export type PlanTienda = 'demo' | 'estandar'

export interface TiendaInfo {
  id: string
  nombre: string
  slug: string
  plan: PlanTienda
  demo_hasta: string | null
  vigente: boolean
  activo: boolean
  onboarding_completado?: boolean
}

export type ResultadoTienda =
  | { estado: 'ok'; info: TiendaInfo | null }
  | { estado: 'sin_slug' }
  | { estado: 'no_existe'; slug: string }
  | { estado: 'vencida'; info: TiendaInfo }
  | { estado: 'error'; mensaje: string }

declare global {
  interface Window {
    __GLOWDESK_TIENDA__?: TiendaInfo | null
  }
}

const URL_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
const LOCAL_FIJO = (import.meta.env.VITE_LOCAL_ID as string | undefined)?.trim()

/** Instalación compartida de tiendas (demos). */
export const MULTI_TIENDA = !LOCAL_FIJO && String(import.meta.env.VITE_MULTI_TIENDA ?? '') === '1'

const CLAVE_ULTIMA = 'glowdesk-ultima-tienda'

export function slugDeRuta(pathname = window.location.pathname): string | null {
  const m = /^\/t\/([a-z0-9][a-z0-9-]{0,62})(?:\/|$)/i.exec(pathname)
  return m ? m[1].toLowerCase() : null
}

/** Prefijo de ruta real de la tienda ('/t/<slug>/' o '/'). Útil para armar enlaces absolutos. */
export function baseTienda(): string {
  const slug = MULTI_TIENDA ? slugDeRuta() : null
  return slug ? `/t/${slug}/` : '/'
}

export function tiendaActual(): TiendaInfo | null {
  return typeof window === 'undefined' ? null : (window.__GLOWDESK_TIENDA__ ?? null)
}

export function esTiendaDemo(): boolean {
  return tiendaActual()?.plan === 'demo'
}

/** Días de prueba que quedan contando hoy (0 = vence hoy). null si no es demo. */
export function diasRestantesDemo(info = tiendaActual()): number | null {
  if (!info || info.plan !== 'demo' || !info.demo_hasta) return null
  const hoy = new Date()
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const [a, m, d] = info.demo_hasta.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - hoyUTC) / 86_400_000)
}

async function pedirInfo(args: { p_slug?: string; p_id?: string }, esperaMs: number): Promise<TiendaInfo | null> {
  const ctrl = new AbortController()
  const t = window.setTimeout(() => ctrl.abort(), esperaMs)
  const r = await fetch(`${URL_SUPABASE}/rest/v1/rpc/fn_info_tienda`, {
    method: 'POST',
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: ctrl.signal,
  }).finally(() => window.clearTimeout(t))
  if (r.status === 404) return null // migración 0075 sin aplicar
  if (!r.ok) throw new Error(`fn_info_tienda ${r.status}`)
  return (await r.json()) as TiendaInfo | null
}

export async function resolverTienda(): Promise<ResultadoTienda> {
  if (typeof window === 'undefined') return { estado: 'ok', info: null }
  window.__GLOWDESK_TIENDA__ = null
  if (!URL_SUPABASE || !ANON_KEY) return { estado: 'ok', info: null } // modo demostración

  if (!MULTI_TIENDA) {
    // Instalación propia: el id es fijo; la info (plan) es opcional y no bloquea el arranque.
    if (LOCAL_FIJO) {
      try {
        // Espera corta: no debe demorar el arranque de una instalación propia.
        window.__GLOWDESK_TIENDA__ = await pedirInfo({ p_id: LOCAL_FIJO }, 2500)
      } catch {
        /* sin red o sin 0075: se sigue como estándar */
      }
    }
    return { estado: 'ok', info: window.__GLOWDESK_TIENDA__ ?? null }
  }

  const slug = slugDeRuta()
  if (!slug) return { estado: 'sin_slug' }
  try {
    const info = await pedirInfo({ p_slug: slug }, 10000)
    if (!info || !info.activo) return { estado: 'no_existe', slug }
    if (!info.vigente) return { estado: 'vencida', info }
    window.__GLOWDESK_TIENDA__ = info
    try {
      localStorage.setItem(CLAVE_ULTIMA, slug)
    } catch {
      /* no crítico */
    }
    return { estado: 'ok', info }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : String(err) }
  }
}

export function ultimaTienda(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA)
  } catch {
    return null
  }
}

export interface SesionTraspasada {
  access_token: string
  refresh_token: string
}

/**
 * La consola de GlowDesk (selector de tiendas / onboarding) abre la tienda con la sesión en el
 * hash, igual que un enlace mágico de Supabase: #access_token=…&refresh_token=…&gd_ruta=/admin.
 * Se saca del URL ANTES de crear el cliente de Supabase (para que no quede en el historial ni lo
 * procese dos veces) y se deja la ruta interna en el hash para HashRouter.
 */
export function consumirSesionDelHash(): SesionTraspasada | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.includes('access_token=') || !hash.includes('refresh_token=')) return null
  const p = new URLSearchParams(hash)
  const access_token = p.get('access_token')
  const refresh_token = p.get('refresh_token')
  const ruta = p.get('gd_ruta')
  const destino = ruta && ruta.startsWith('/') && !ruta.startsWith('//') ? ruta : '/'
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${destino}`)
  if (!access_token || !refresh_token) return null
  return { access_token, refresh_token }
}
