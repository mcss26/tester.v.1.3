# Guía de Despliegue (GitHub Pages)

Para que el inicio de sesión funcione correctamente en **mcss26.github.io**, es **CRÍTICO** configurar las URLs permitidas en Supabase.

## Paso 1: Configurar Redirects en Supabase

1. Ingresa a tu proyecto en **Supabase Dashboard**.
2. Ve a **Authentication** (icono de usuarios) -> **URL Configuration**.
3. En **Site URL**, asegura que esté (o déjalo como localhost si desarrollas local, pero lo importante son los Redirect URIs).
4. En **Redirect URLs** (o "Redirect allow list"), agrega exactamente:
   - `https://mcss26.github.io/`
   - `https://mcss26.github.io/tester.v.1.3/`
   - `https://mcss26.github.io/tester.v.1.3/login.html`

> **¿Por qué?** Supabase bloquea cualquier intento de login que venga de un dominio no autorizado por seguridad.

## Paso 2: Verificar Deploy

1. Sube los cambios a GitHub.
2. Espera que la Action de GitHub Pages termine.
3. Ingresa a `https://mcss26.github.io/tester.v.1.3/login.html`.
4. Abre la consola (F12) y verifica que diga "Environment: Production (GitHub Pages)".

Si ves errores de CORS o "AuthApiError: Redirect URL not allowed", repite el Paso 1.
