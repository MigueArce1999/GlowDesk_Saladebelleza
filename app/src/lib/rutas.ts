import { LOCAL_ID } from './supabase'
import type { Perfil } from './types'

export const PLATAFORMA_URL = String(import.meta.env.VITE_PLATAFORMA_URL ?? '').replace(/\/$/, '')

export const rutaPorRol: Record<Perfil['rol'], string> = {
  cliente: '/cliente',
  empleada: '/equipo-app',
  admin: '/admin',
}

/** Portal de ESTA instalación según el rol de la persona en este salón (membresía);
 *  si no es del equipo de aquí, clienta. */
export function rutaEnEsteSalon(perfil: Perfil, tieneCliente: boolean): string {
  if (LOCAL_ID && perfil.local_id === LOCAL_ID) {
    if (perfil.rol === 'admin') return '/admin'
    if (perfil.rol === 'empleada') return '/equipo-app'
  }
  return tieneCliente ? '/cliente' : '/'
}

// URL pública absoluta y estable (no cambia entre despliegues: mismo dominio, mismo hash) a una
// ruta fuera del portal, pensada para un QR/enlace que se comparte impreso o por WhatsApp — con
// HashRouter el origin+pathname es siempre el mismo, solo cambia el hash.
function urlPublica(ruta: string): string {
  return `${window.location.origin}${window.location.pathname}#${ruta}`
}

export function urlRegistroPublico(): string {
  return urlPublica('/registro-salon')
}

export function urlInstalarApp(): string {
  return urlPublica('/instalar')
}
