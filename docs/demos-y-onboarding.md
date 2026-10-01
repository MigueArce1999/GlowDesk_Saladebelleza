# Tiendas demo y onboarding (migración 0075)

## Tipos de tienda

| Plan | Dónde vive | Personalización | Vence |
|---|---|---|---|
| `estandar` | Su propia instalación (dominio en Hostinger, `VITE_LOCAL_ID` fijo) | Marca, Homepage y Contenido | No |
| `demo` | Instalación compartida: `https://<app-tiendas>/t/<slug>/` | No: vista por defecto de GlowDesk | `local.demo_hasta` (10 días) |

Una demo vencida queda bloqueada en la base (`fn_local_id` / `fn_local_publico` no la devuelven),
así que ninguna política por local la deja leer ni escribir. Los datos se conservan: al pasarla a
estándar (`fn_pasar_a_estandar`, botón en Consola → Locales) vuelve a funcionar.

## Flujo

1. La persona llena **Pedir acceso** en la landing → `solicitud_acceso`.
2. En la consola (Solicitudes) **Activar prueba** → `fn_activar_demo`: crea el local demo (slug a
   partir del nombre), `demo_hasta = hoy + 10` y un enlace único `/configurar/<token>` (vence en 7 días).
3. Se le envía el enlace (botones de WhatsApp / correo). Ahí crea su contraseña (o entra con la que ya
   tiene: una sola cuenta para todas las tiendas), cuenta su negocio y elige áreas de servicio
   (`fn_onboarding_guardar` crea categorías y servicios "a valorar").
4. "Ir al dashboard" abre `/t/<slug>/` con la sesión ya iniciada, como admin de su tienda.

Después, en `glowdesk_admin` → **Iniciar sesión** → `/entrar`: el super admin ve el panel de
plataforma y sus tiendas; cualquier otra cuenta ve solo sus tiendas, marcadas Demo/Estándar.

## Despliegue de la instalación compartida

Un build más de `app/`, en su propio dominio (p. ej. `app.glowdesk.co`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_LOCAL_ID=            # vacío
VITE_MULTI_TIENDA=1
VITE_PLATAFORMA_URL=https://glowdesk.co
```

`public/.htaccess` ya reescribe `/t/*` a `index.html`. En la consola, `VITE_APP_TIENDAS_URL` apunta a
ese dominio. En Supabase → Authentication → URL Configuration agrega a *Redirect URLs* el dominio de
la consola (`https://glowdesk.co/**`, para el correo de confirmación del onboarding) y el de la
instalación compartida.

## Orden para aplicar en Supabase

`0072_membresias_por_local` → `0073_testimonios_plataforma` → `0074_solicitudes_acceso` →
`0075_demos_y_onboarding`. Pruebas: `supabase/tests/run.sh` (incluye `demos.sql`).
