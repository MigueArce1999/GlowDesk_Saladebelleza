import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MULTI_TIENDA, tiendaActual } from './tienda'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
// Instalación propia: VITE_LOCAL_ID. Instalación compartida (demos): el id lo resolvió
// lib/tienda.ts desde /t/<slug>/ antes de cargar este módulo (ver main.tsx).
const localIdRaw =
  (import.meta.env.VITE_LOCAL_ID as string | undefined)?.trim() || (MULTI_TIENDA ? tiendaActual()?.id : undefined)

// Modo demostración: no hay proyecto Supabase conectado (ver docs/07-plan-implementacion.md).
export const isDemoMode = !url || !anonKey

if (!isDemoMode && !localIdRaw) {
  throw new Error(
    MULTI_TIENDA
      ? 'Instalación compartida sin tienda resuelta (falta /t/<slug>/ en la dirección).'
      : 'Hay conexión a Supabase pero falta VITE_LOCAL_ID. Cada instalación pertenece a un local; ' +
          'sin ese UUID la app mezclaría datos de todos los negocios. Cópialo desde la tabla `local` ' +
          '(o usa VITE_MULTI_TIENDA=1 para la instalación compartida de demos).',
  )
}

export const LOCAL_ID = localIdRaw ?? ''

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
      global: {
        headers: { 'x-local-id': LOCAL_ID },
      },
    })

export function supabaseRequerido() {
  if (!supabase) {
    throw new Error(
      'No hay conexión a Supabase configurada (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
        'Estás en modo demostración: esta acción no está disponible sobre datos de ejemplo.',
    )
  }
  return supabase
}
