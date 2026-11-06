import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Campos'
import { Card, Cargando, EmptyState, ErrorState } from '../../components/ui/Estados'
import { Modal } from '../../components/ui/Modal'
import { listarAtencionesPendientes, type AtencionPendiente } from '../../lib/api/admin'
import { completarYCobrarAtencion } from '../../lib/api/empleada'
import { formatoFechaHora, formatoMoneda } from '../../lib/format'
import type { MetodoPago } from '../../lib/types'

function idTemporal() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Cola de cierre: una empleada registra el servicio (queda en_progreso, sin método de pago —
// ver Atender.tsx), y acá es donde admin, al llegar a caja, lo revisa y confirma de verdad cómo
// pagó la clienta. Antes de esto (0084), registrar y cobrar eran el mismo clic, así que no había
// ninguna señal de qué estaba realmente cobrado y qué no. fn_completar_y_cobrar_atencion exige
// admin en el servidor — esto es solo la pantalla para hacerlo, nunca la única defensa.
export function AdminPendientesCobro() {
  const [pendientes, setPendientes] = useState<AtencionPendiente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState<AtencionPendiente | null>(null)

  function cargar() {
    setError(null)
    listarAtencionesPendientes().then(setPendientes).catch((e) => setError(e.message))
  }

  useEffect(cargar, [])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-marca text-2xl font-semibold text-carbon">Pendientes por cobrar</h1>
        <p className="text-sm text-carbon/60">
          Servicios ya registrados por el equipo, esperando que caja confirme cómo pagó la clienta. Las más viejas
          primero.
        </p>
      </div>

      {error && <ErrorState mensaje={error} />}

      {!pendientes ? (
        <Cargando filas={3} />
      ) : pendientes.length === 0 ? (
        <EmptyState titulo="No hay nada pendiente por cobrar" descripcion="Todo lo registrado por el equipo ya quedó cobrado." />
      ) : (
        <div className="flex flex-col gap-2">
          {pendientes.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-carbon">{p.clienteNombre}</p>
                <p className="text-xs text-carbon/50">Registrado el {formatoFechaHora(p.creadoEn)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-marca text-lg font-semibold text-carbon">{formatoMoneda(p.totalVendido)}</p>
                <Button tamano="sm" onClick={() => setCobrando(p)}>Cobrar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {cobrando && (
        <ModalCobrarPendiente
          atencion={cobrando}
          onCerrar={() => setCobrando(null)}
          onCobrado={() => {
            setCobrando(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

function ModalCobrarPendiente({
  atencion,
  onCerrar,
  onCobrado,
}: {
  atencion: AtencionPendiente
  onCerrar: () => void
  onCobrado: () => void
}) {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claveCobro] = useState(() => idTemporal())

  async function confirmar() {
    setEnviando(true)
    setError(null)
    try {
      await completarYCobrarAtencion({
        atencionId: atencion.id,
        pagos: [{ metodo: metodoPago, monto: atencion.totalVendido }],
        idempotencyKey: claveCobro,
      })
      onCobrado()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Confirmar cobro">
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-semibold text-carbon">{atencion.clienteNombre}</p>
          <p className="text-sm text-carbon/60">Registrado el {formatoFechaHora(atencion.creadoEn)}</p>
        </div>
        <div className="rounded-xl bg-marfil px-4 py-3">
          <p className="text-xs text-carbon/50">Total a cobrar</p>
          <p className="font-marca text-2xl font-semibold text-carbon">{formatoMoneda(atencion.totalVendido)}</p>
        </div>
        {error && <ErrorState mensaje={error} />}
        <Select id="metodoPendiente" etiqueta="Método de pago" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="otro">Otro</option>
        </Select>
        <div className="flex justify-end gap-2">
          <Button variante="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={confirmar} cargando={enviando}>Confirmar cobro</Button>
        </div>
      </div>
    </Modal>
  )
}
