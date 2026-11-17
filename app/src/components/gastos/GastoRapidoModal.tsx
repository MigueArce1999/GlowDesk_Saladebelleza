import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { CampoMoneda, Input, Select } from '../ui/Campos'
import { ErrorState } from '../ui/Estados'
import { Modal } from '../ui/Modal'
import { crearGasto, listarCategoriasGasto } from '../../lib/api/gastos'
import { fechaBogotaISO } from '../../lib/format'
import type { CategoriaGasto, Gasto } from '../../lib/types'

function claveTemporal() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Captura rápida de gasto para el día a día (0087): el formulario completo (GastosFormulario)
// tiene 11 campos — proveedor, referencia, comprobante, toda la sección de "¿ya se pagó?" —
// pensado para dejar un gasto bien documentado, no para anotarlo parado en 10 segundos. Este
// modal es la puerta rápida: concepto, valor, categoría y fecha, nada más. Queda SIN pago (igual
// que elegir "No" en el formulario completo) — registrar el pago después es una acción de un
// clic desde el detalle del gasto (GastosDetalle → "Registrar pago"), así que no se pierde nada
// por no pedirlo acá. Solo para admin: a propósito no vive en el portal de empleadas.
export function GastoRapidoModal({
  abierto,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean
  onCerrar: () => void
  onGuardado: (gasto: Gasto) => void
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(() => claveTemporal())
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([])

  const [concepto, setConcepto] = useState('')
  const [valorTotal, setValorTotal] = useState<number | null>(null)
  const [categoriaId, setCategoriaId] = useState('')
  const [fecha, setFecha] = useState(fechaBogotaISO())

  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Cada vez que se abre, un formulario en blanco y una clave de idempotencia nueva — abrir dos
  // veces seguidas nunca reenvía el gasto anterior por accidente.
  useEffect(() => {
    if (!abierto) return
    setIdempotencyKey(claveTemporal())
    setConcepto('')
    setValorTotal(null)
    setCategoriaId('')
    setFecha(fechaBogotaISO())
    setErrores({})
    setErrorGeneral(null)
    listarCategoriasGasto().then(setCategorias).catch(() => {})
  }, [abierto])

  function validar(): boolean {
    const nuevos: Record<string, string> = {}
    if (!concepto.trim()) nuevos.concepto = 'Obligatorio.'
    if (!valorTotal || valorTotal <= 0) nuevos.valorTotal = 'Ingresa un valor mayor que cero.'
    if (!categoriaId) nuevos.categoriaId = 'Elige una categoría.'
    setErrores(nuevos)
    return Object.keys(nuevos).length === 0
  }

  async function guardar() {
    setErrorGeneral(null)
    if (!validar()) return
    setGuardando(true)
    try {
      const nuevo = await crearGasto({
        concepto: concepto.trim(),
        categoriaId,
        valorTotal: valorTotal as number,
        fecha,
        pago: null,
        idempotencyKey,
      })
      onGuardado(nuevo)
    } catch (e: any) {
      setErrorGeneral(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Gasto rápido">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-carbon/60">
          Déjalo anotado ahora, en segundos. El pago, el proveedor o el comprobante los agregas después desde el
          detalle del gasto.
        </p>
        {errorGeneral && <ErrorState mensaje={errorGeneral} />}

        <Input
          id="grConcepto"
          etiqueta="Concepto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          error={errores.concepto}
          placeholder="Ej: Domicilio, insumos, transporte…"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <CampoMoneda id="grValor" etiqueta="Valor" value={valorTotal} onChange={setValorTotal} error={errores.valorTotal} />
          <Input id="grFecha" etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <Select id="grCategoria" etiqueta="Categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} error={errores.categoriaId}>
          <option value="">Elige una categoría</option>
          {categorias.filter((c) => c.activa).map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </Select>

        <div className="mt-1 flex gap-3">
          <Button onClick={guardar} cargando={guardando} className="flex-1">Guardar gasto</Button>
          <Button variante="secondary" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  )
}
