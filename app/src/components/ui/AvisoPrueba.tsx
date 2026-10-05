import { diasRestantesDemo, tiendaActual } from '../../lib/tienda'

const WHATSAPP = 'https://wa.me/573243811754'

// Franja de la cuenta DEMO (10 días): cuántos días quedan y cómo pasar a un plan.
export function AvisoPrueba() {
  const tienda = tiendaActual()
  const dias = diasRestantesDemo(tienda)
  if (!tienda || dias === null) return null
  const texto =
    dias <= 0 ? 'Tu demo de GlowDesk vence hoy' : dias === 1 ? 'Te queda 1 día de demo' : `Te quedan ${dias} días de demo`
  const enlace = `${WHATSAPP}?text=${encodeURIComponent(`Hola, quiero activar el plan de GlowDesk para ${tienda.nombre} (${tienda.slug}).`)}`
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#0d947c] px-4 py-2 text-center text-xs font-semibold text-white">
      <span>
        {texto} · vista por defecto (sin personalización)
      </span>
      <a href={enlace} target="_blank" rel="noreferrer" className="rounded-full bg-white/20 px-3 py-0.5 underline-offset-2 hover:bg-white/30">
        Activar mi plan
      </a>
    </div>
  )
}
