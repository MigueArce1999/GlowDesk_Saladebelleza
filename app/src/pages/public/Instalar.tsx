import { Link } from 'react-router-dom'
import { BotonInstalarApp } from '../../components/pwa/InstalarApp'

// Ruta pública independiente del portal (igual criterio que /registro-salon): es la pantalla
// que abre el QR/enlace de "Compartir instalación" (Admin → Configuración), pensada para
// pegarse en el salón y escanearse sin sesión previa. Un solo manifest sirve a los 3 portales
// (ver vite.config.ts), así que este mismo botón instala "la app" sin importar si quien escanea
// es clienta o empleada — cada quien aterriza en su portal después, al ingresar.
export function Instalar() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-marfil px-4 py-16 sm:px-6">
      <div className="w-full max-w-sm text-center">
        <p className="mb-1 font-marca text-2xl font-semibold text-carbon">Claudia Patricia</p>
        <h1 className="mb-2 font-marca text-3xl font-semibold text-carbon">Instala la app</h1>
        <p className="mb-8 text-sm text-carbon/60">
          Agenda tu cita, consulta tus puntos y tu Diario de belleza, o atiende el salón — todo desde un
          ícono en tu celular, sin tener que buscar la página cada vez.
        </p>

        <div className="rounded-2xl border border-piedra bg-blanco p-6">
          <BotonInstalarApp />
        </div>

        <p className="mt-8 text-xs text-carbon/40">
          <Link to="/" className="underline underline-offset-2">Claudia Patricia · Salón de belleza</Link>
        </p>
      </div>
    </div>
  )
}
