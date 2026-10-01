import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

const contenedor = document.getElementById('root')!

// App.tsx (y lo que importa transitivamente, como lib/supabase.ts) se carga con import()
// dinámico, envuelto en try/catch, a propósito: el bundle no está dividido en trozos, así que
// cualquier error que ocurra al EVALUAR ese módulo (por ejemplo, VITE_LOCAL_ID faltante en el
// build — ver lib/supabase.ts) pasaba antes de que React alcanzara a pintar nada, dejando la
// pantalla completamente en blanco (el fondo del splash) sin ningún mensaje, indistinguible de
// "no carga" para quien la esté usando. Con esto, ese mismo fallo al menos se ve en pantalla.
async function iniciar() {
  try {
    // 1) Sesión traspasada desde la consola de GlowDesk (selector de tiendas / onboarding).
    // 2) Qué tienda es (instalación propia o /t/<slug>/ en la compartida de demos).
    // Ambas cosas ANTES de cargar lib/supabase.ts, que hornea el x-local-id al evaluarse.
    const { consumirSesionDelHash, resolverTienda } = await import('./lib/tienda')
    const traspaso = consumirSesionDelHash()
    const tienda = await resolverTienda()
    if (tienda.estado !== 'ok') {
      const { montarPantallaTienda } = await import('./components/layout/PantallaTienda')
      montarPantallaTienda(contenedor, tienda)
      return
    }
    if (traspaso) {
      const { supabase } = await import('./lib/supabase')
      const { error } = (await supabase?.auth.setSession(traspaso)) ?? {}
      if (error) console.warn('[sesión] No se pudo usar la sesión traspasada:', error.message)
    }
    const { default: App } = await import('./App.tsx')
    createRoot(contenedor).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    console.error('Fallo al iniciar la app:', err)
    contenedor.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;font-family:sans-serif;background:#e6e1d7;color:#394638;">' +
      '<p style="font-size:16px;font-weight:600;">No se pudo cargar la aplicación</p>' +
      '<p style="font-size:14px;opacity:0.8;">Cierra esta ventana e inténtalo de nuevo. Si sigue igual, avisa a administración.</p>' +
      '</div>'
  }
}

iniciar()

// Registro activo del service worker (en vez del script auto-inyectado, ver vite.config.ts):
// con la app guardada como acceso directo en el celular, el navegador puede tardar mucho — o no
// llegar nunca — a notar por su cuenta que hay una versión nueva mientras la empleada no cierre
// la app del todo. Acá se revisa explícitamente cada vez que la app vuelve a primer plano y cada
// 30 minutos mientras queda abierta, y ante una versión nueva se activa y recarga sola, sin
// pedirle nada a quien la esté usando (mismo criterio que registerType: 'autoUpdate'). Se deja
// corriendo aparte de `iniciar()`: si la app no cargó por un archivo cacheado dañado o viejo,
// esto sigue intentando detectar una versión nueva en el servidor y recargar sola.
const actualizarSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    actualizarSW(true)
  },
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const revisarActualizacion = () => registro.update().catch(() => {})
    setInterval(revisarActualizacion, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revisarActualizacion()
    })
  },
})
