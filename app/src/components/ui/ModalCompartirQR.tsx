import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Button } from './Button'
import { Modal } from './Modal'

// Generador de modal "QR + enlace para compartir", extraído de Clientes.tsx (donde nació para
// "Compartir registro") para reutilizarlo tal cual en cualquier otro flujo que necesite lo mismo
// (p. ej. compartir la instalación de la app) — misma generación de QR, mismo copiar/descargar,
// sin duplicar esa lógica por segunda vez.
export function ModalCompartirQR({
  abierto,
  onCerrar,
  titulo,
  encabezado,
  subtexto,
  url,
  nombreArchivo,
  textoEscaneo,
  ayudaEscaneo = 'Abre la cámara de tu celular',
  extra,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  encabezado: string
  subtexto: string
  url: string
  nombreArchivo: string
  textoEscaneo: string
  ayudaEscaneo?: string
  extra?: ReactNode
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [errorCopiar, setErrorCopiar] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setCopiado(false)
    setErrorCopiar(null)
    // margin: 2 módulos de zona blanca (requisito de la especificación ZXing/QR para que
    // cualquier lector lo reconozca), tamaño suficiente para imprimir con buen contraste.
    QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#262923', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [abierto, url])

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setErrorCopiar(null)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErrorCopiar('No se pudo copiar automáticamente. Selecciona y copia el enlace manualmente.')
    }
  }

  function descargarQR() {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = nombreArchivo
    a.click()
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo}>
      <p className="mb-1 text-center font-marca text-xl font-semibold text-carbon">{encabezado}</p>
      <p className="mb-4 text-center text-sm text-carbon/60">{subtexto}</p>

      <div className="mx-auto flex max-w-xs flex-col items-center gap-2 rounded-2xl border border-piedra p-5">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`Código QR — ${textoEscaneo}`} className="h-56 w-56" />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center text-sm text-carbon/40">Generando QR…</div>
        )}
        <p className="font-semibold text-carbon">{textoEscaneo}</p>
        <p className="text-xs text-carbon/50">{ayudaEscaneo}</p>
      </div>

      <p className="mb-1 mt-5 text-center text-xs font-semibold uppercase tracking-wide text-carbon/40">O comparte el enlace</p>
      <div className="mb-2 flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-piedra bg-marfil px-3 py-2 text-sm text-carbon" />
        <Button type="button" tamano="sm" onClick={copiarEnlace}>{copiado ? 'Copiado ✓' : 'Copiar enlace'}</Button>
      </div>
      {errorCopiar && <p className="mb-2 text-xs text-error">{errorCopiar}</p>}

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variante="secondary" tamano="sm" onClick={descargarQR} disabled={!qrDataUrl}>Descargar QR</Button>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Button type="button" variante="secondary" tamano="sm" className="w-full">Abrir ↗</Button>
        </a>
      </div>

      {extra}
    </Modal>
  )
}
