import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Campos'
import { ErrorState } from '../../components/ui/Estados'
import { isDemoMode } from '../../lib/supabase'
import { iniciarSesion, solicitarRestablecerPassword } from '../../lib/api/auth'
import { rutaEnEsteSalon } from '../../lib/rutas'
import { useAuth } from '../../state/AuthContext'

export function Ingresar() {
  const navigate = useNavigate()
  const { perfil, cliente, fijarDemoRol } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [olvide, setOlvide] = useState(false)

  useEffect(() => {
    if (perfil && isDemoMode) return
    if (!perfil) return
    navigate(rutaEnEsteSalon(perfil, cliente !== null), { replace: true })
  }, [perfil, cliente, navigate])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      await iniciarSesion(email, password)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  if (isDemoMode) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center sm:px-6">
        <h1 className="mb-2 font-marca text-3xl font-semibold text-carbon">Modo demostración</h1>
        <p className="mb-8 text-sm text-carbon/60">
          No hay un proyecto Supabase conectado, así que no hay login real. Elige qué portal quieres
          previsualizar con datos de ejemplo.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => { fijarDemoRol('cliente'); navigate('/cliente') }}>Ver portal del cliente</Button>
          <Button variante="secondary" onClick={() => { fijarDemoRol('empleada'); navigate('/equipo-app') }}>Ver portal de empleadas</Button>
          <Button variante="secondary" onClick={() => { fijarDemoRol('admin'); navigate('/admin') }}>Ver dashboard admin</Button>
        </div>
      </div>
    )
  }

  if (olvide) return <OlvidePassword onVolver={() => setOlvide(false)} correoInicial={email} />

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="mb-6 font-marca text-3xl font-semibold text-carbon">Ingresar</h1>
      {error && <div className="mb-4"><ErrorState mensaje={error} /></div>}
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Input id="email" etiqueta="Correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input id="password" etiqueta="Contraseña" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" onClick={() => setOlvide(true)} className="self-end text-xs font-medium text-oliva hover:underline">
          ¿Olvidaste tu contraseña?
        </button>
        <Button type="submit" cargando={cargando}>Ingresar</Button>
      </form>
      <p className="mt-4 text-center text-sm text-carbon/60">
        ¿Primera vez aquí? <Link to="/registro" className="font-semibold text-oliva">Crea tu cuenta</Link>
      </p>
    </div>
  )
}

// También sirve para quien se registró por un enlace mágico (p. ej. una empleada invitada desde
// Admin → Equipo) y nunca llegó a definir una contraseña: pedir el restablecimiento con su
// mismo correo le manda un enlace para elegir una por primera vez — Supabase no distingue "sin
// contraseña" de "olvidó la que tenía", el flujo es el mismo para los dos casos.
function OlvidePassword({ onVolver, correoInicial }: { onVolver: () => void; correoInicial: string }) {
  const [email, setEmail] = useState(correoInicial)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await solicitarRestablecerPassword(email)
      setEnviado(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="mb-2 font-marca text-3xl font-semibold text-carbon">Restablecer contraseña</h1>
      {enviado ? (
        <>
          <p className="mb-6 text-sm text-carbon/60">
            Si <strong>{email}</strong> tiene una cuenta, le llegará un correo con un enlace para elegir una
            contraseña nueva.
          </p>
          <Button variante="secondary" onClick={onVolver}>Volver a ingresar</Button>
        </>
      ) : (
        <>
          <p className="mb-6 text-sm text-carbon/60">
            Escribe el correo de tu cuenta y te mandamos un enlace para elegir una contraseña nueva (sirve
            igual si nunca habías puesto una).
          </p>
          {error && <div className="mb-4"><ErrorState mensaje={error} /></div>}
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <Input id="emailOlvide" etiqueta="Correo" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" cargando={enviando}>Enviar enlace</Button>
          </form>
          <button onClick={onVolver} className="mt-4 text-sm text-carbon/60 hover:underline">← Volver a ingresar</button>
        </>
      )}
    </div>
  )
}
