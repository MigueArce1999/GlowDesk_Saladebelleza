import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Campos'
import { ErrorState } from '../../components/ui/Estados'
import { actualizarPasswordPropia } from '../../lib/api/auth'

// Aterriza aquí quien abre el enlace de "Olvidé mi contraseña" (o una empleada invitada por
// enlace mágico que nunca definió una) — consumirSesionDelHash (lib/tienda.ts) ya dejó la
// sesión temporal de recuperación activa antes de que esta pantalla se monte. Después de
// guardar, se manda a Home ("/"), que ya sabe mandar a cada quien a su portal según su rol.
export function RestablecerPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    setGuardando(true)
    try {
      await actualizarPasswordPropia(password)
      navigate('/', { replace: true })
    } catch (e: any) {
      setError(
        /expired|invalid|session/i.test(e.message ?? '')
          ? 'Este enlace ya venció o ya se usó. Pide uno nuevo desde "Olvidé mi contraseña" en Ingresar.'
          : e.message,
      )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="mb-2 font-marca text-3xl font-semibold text-carbon">Elige tu contraseña</h1>
      <p className="mb-6 text-sm text-carbon/60">Úsala la próxima vez para entrar directo, sin esperar un correo.</p>
      {error && <div className="mb-4"><ErrorState mensaje={error} /></div>}
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Input
          id="passwordNueva"
          etiqueta="Contraseña nueva"
          type="password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          ayuda="Mínimo 6 caracteres."
        />
        <Input
          id="passwordConfirmar"
          etiqueta="Repite la contraseña"
          type="password"
          required
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
        />
        <Button type="submit" cargando={guardando}>Guardar contraseña</Button>
      </form>
    </div>
  )
}
