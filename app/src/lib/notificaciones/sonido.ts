// Campanita de notificación: dos tonos cortos sintetizados con Web Audio (sin archivo .mp3/.wav
// que empaquetar ni descargar) — nunca suena en el primer render (solo cuando un evento de
// Realtime llega DESPUÉS de que la pantalla ya está abierta, ver useEventosEnVivo), y nunca
// se intenta reproducir si el navegador bloqueó el audio por falta de interacción del usuario
// (autoplay policy): el error de play() se ignora en silencio, la notificación visual igual
// aparece.
let contexto: AudioContext | null = null

function obtenerContexto(): AudioContext | null {
  const Ctor = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  if (!contexto) contexto = new Ctor()
  return contexto
}

export function reproducirCampanita() {
  try {
    const ctx = obtenerContexto()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const ahora = ctx.currentTime
    // Dos notas (mi5 → la5) tipo "ding-dong" de campanita de recepción — corto, agudo, no
    // intrusivo ni parecido a una alarma.
    const notas: [number, number][] = [[659.25, ahora], [880, ahora + 0.12]]
    for (const [frecuencia, inicio] of notas) {
      const oscilador = ctx.createOscillator()
      const ganancia = ctx.createGain()
      oscilador.type = 'sine'
      oscilador.frequency.value = frecuencia
      ganancia.gain.setValueAtTime(0, inicio)
      ganancia.gain.linearRampToValueAtTime(0.22, inicio + 0.015)
      ganancia.gain.exponentialRampToValueAtTime(0.001, inicio + 0.45)
      oscilador.connect(ganancia)
      ganancia.connect(ctx.destination)
      oscilador.start(inicio)
      oscilador.stop(inicio + 0.5)
    }
  } catch {
    // Audio nunca debe romper la notificación visual.
  }
}
