import { isDemoMode, LOCAL_ID, supabase } from '../supabase'
import { MULTI_TIENDA, tiendaActual } from '../tienda'
import type { LocalMarca } from '../types'

const FALLBACK: LocalMarca = {
  id: LOCAL_ID || 'demo',
  nombre: 'Claudia Patricia',
  slug: 'claudia-patricia',
  activo: true,
  logo_url: '/logo-claudia-patricia.png',
  favicon_url: '/favicon.png',
  logo_footer_url: null,
  splash_url: null,
  url_sitio: 'https://saladebellezaclaudiapatricia.com',
  nombre_corto: 'CP',
  eslogan: 'Salón de belleza',
  color_primario: null,
  color_acento: null,
}

// Vista por defecto de GlowDesk: la usan las tiendas DEMO (no personalizan marca) y la
// instalación compartida mientras carga. Sin logo ni splash → la pantalla de carga y los
// encabezados muestran la marca GlowDesk / el nombre del negocio.
export const COLOR_GLOWDESK = '#0d947c'
export const COLOR_GLOWDESK_ACENTO = '#cfe9e3'

function marcaGlowdesk(): LocalMarca {
  const t = tiendaActual()
  return {
    id: t?.id || LOCAL_ID || 'demo',
    nombre: t?.nombre || 'GlowDesk',
    slug: t?.slug || 'glowdesk',
    activo: true,
    logo_url: null,
    favicon_url: '/plataforma/glowdesk-simbolo.png',
    logo_footer_url: null,
    splash_url: null,
    url_sitio: null,
    nombre_corto: (t?.nombre || 'GlowDesk')
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 3)
      .toUpperCase(),
    eslogan: t?.plan === 'demo' ? 'Demo GlowDesk' : null,
    color_primario: COLOR_GLOWDESK,
    color_acento: COLOR_GLOWDESK_ACENTO,
  }
}

export function marcaFallback(): LocalMarca {
  if (MULTI_TIENDA || tiendaActual()?.plan === 'demo') return marcaGlowdesk()
  return { ...FALLBACK }
}

export async function obtenerMarcaPublica(): Promise<LocalMarca> {
  if (isDemoMode || !LOCAL_ID) return marcaFallback()
  // Una demo usa siempre la vista por defecto: no se lee (ni se aplica) la marca del local.
  if (tiendaActual()?.plan === 'demo') return marcaGlowdesk()
  const { data, error } = await supabase!
    .from('local')
    .select('id, nombre, slug, activo, logo_url, favicon_url, logo_footer_url, splash_url, url_sitio, nombre_corto, eslogan, color_primario, color_acento')
    .eq('id', LOCAL_ID)
    .maybeSingle()
  if (error) throw error
  return data ? { ...marcaFallback(), ...data } : marcaFallback()
}
