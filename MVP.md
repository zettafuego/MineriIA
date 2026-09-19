# FormalizaAI — MVP institucional

## Objetivo

Publicar una demostracion institucional segura, con usuarios y datos aislados, sin reescribir el frontend existente.

## Arquitectura

- Frontend HTML/CSS/JavaScript existente.
- Supabase Auth + Postgres para identidad y persistencia.
- Row Level Security para que cada usuario acceda solo a sus filas.
- Vercel para archivos estaticos y funciones `/api/health` y `/api/chat`.
- `XAI_API_KEY` disponible solo como variable de servidor.

## Fases

1. **Infraestructura:** migracion SQL, variables de entorno, API y configuracion de hosting.
2. **Integracion:** sustituir autenticacion y LocalStorage por Supabase, conservando fallback de demo.
3. **Acabado:** portada institucional, indicadores, fuentes oficiales, metodologia y aviso legal.
4. **Validacion:** pruebas de acceso, aislamiento, diagnostico, documentos, chat, exportaciones y responsive.

## Criterio de salida del MVP

- URL publica con HTTPS.
- Registro e inicio de sesion funcionales.
- Datos separados por usuario mediante RLS.
- Clave de IA no expuesta al navegador.
- Flujo principal demostrable de inicio a fin.
- Cuenta ficticia y guion breve para la presentacion.
