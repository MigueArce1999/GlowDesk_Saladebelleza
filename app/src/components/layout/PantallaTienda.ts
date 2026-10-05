import type { ResultadoTienda } from '../../lib/tienda'
import { ultimaTienda } from '../../lib/tienda'

// Pantallas de la instalación compartida cuando NO hay tienda que cargar: sin /t/<slug>/,
// tienda inexistente, demo vencida o error de red. DOM plano a propósito (no carga App ni
// Supabase) y con la marca GlowDesk.

const PLATAFORMA_URL = String(import.meta.env.VITE_PLATAFORMA_URL ?? '').replace(/\/$/, '')
const WHATSAPP = 'https://wa.me/573243811754'
const CORREO = 'contacto@logicielms.com'

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function boton(href: string, texto: string, principal = true) {
  const estilo = principal
    ? 'background:#047863;color:#fff;border:2px solid #047863;'
    : 'background:#fff;color:#047863;border:2px solid #0d947c;'
  return `<a href="${href}" style="${estilo}display:inline-flex;align-items:center;justify-content:center;height:52px;padding:0 26px;border-radius:999px;font-weight:600;font-size:16px;text-decoration:none;">${texto}</a>`
}

export function montarPantallaTienda(contenedor: HTMLElement, r: Exclude<ResultadoTienda, { estado: 'ok' }>) {
  if (r.estado === 'sin_slug') {
    const ultima = ultimaTienda()
    if (ultima) {
      window.location.replace(`/t/${ultima}/${window.location.hash}`)
      return
    }
  }

  const ingresar = PLATAFORMA_URL ? `${PLATAFORMA_URL}/ingresar` : '/'
  let titulo = ''
  let texto = ''
  let acciones = ''
  switch (r.estado) {
    case 'sin_slug':
      titulo = 'Elige tu tienda'
      texto = 'Inicia sesión en GlowDesk y elige la tienda a la que quieres entrar.'
      acciones = boton(ingresar, 'Iniciar sesión')
      break
    case 'no_existe':
      titulo = 'No encontramos esta tienda'
      texto = `La dirección <b>/t/${escapar(r.slug)}</b> no corresponde a ninguna tienda activa. Revisa el enlace o entra desde tu cuenta.`
      acciones = boton(ingresar, 'Iniciar sesión')
      break
    case 'vencida':
      titulo = 'Tu prueba de GlowDesk terminó'
      texto = `Los 10 días de demo de <b>${escapar(r.info.nombre)}</b> ya pasaron. Tus datos siguen guardados: escríbenos y activamos tu plan para que sigas donde quedaste.`
      acciones =
        boton(`${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero activar el plan de GlowDesk para ${r.info.nombre} (${r.info.slug}).`)}`, 'Escribir por WhatsApp') +
        boton(`mailto:${CORREO}?subject=${encodeURIComponent(`Activar GlowDesk · ${r.info.nombre}`)}`, CORREO, false)
      break
    case 'error':
      titulo = 'No se pudo cargar la tienda'
      texto = 'Revisa tu conexión e inténtalo de nuevo.'
      acciones = `<button onclick="location.reload()" style="background:#047863;color:#fff;border:0;height:52px;padding:0 26px;border-radius:999px;font-weight:600;font-size:16px;cursor:pointer;">Reintentar</button>`
      break
  }

  document.title = `${titulo} · GlowDesk`
  contenedor.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#eff5f5;font-family:Inter,system-ui,sans-serif;color:#272727;">
      <div style="width:100%;max-width:460px;background:#fff;border-radius:28px;padding:40px 28px;text-align:center;box-shadow:0 20px 60px -30px rgba(1,83,68,.35);">
        <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px;">
          <img src="/plataforma/glowdesk-simbolo.png" alt="" style="width:40px;height:40px;object-fit:contain;" />
          <img src="/plataforma/glowdesk.svg" alt="GlowDesk" style="height:22px;" />
        </div>
        <h1 style="font-size:26px;line-height:1.2;font-weight:700;margin:0 0 12px;">${titulo}</h1>
        <p style="font-size:16px;line-height:1.55;color:#616161;margin:0 0 28px;">${texto}</p>
        <div style="display:flex;flex-direction:column;gap:12px;align-items:stretch;">${acciones}</div>
      </div>
    </div>`
  const carga = document.getElementById('pantalla-carga')
  if (carga) carga.remove()
}
