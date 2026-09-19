# FormalizaAI — MVP

Aplicación web de orientación para pequeños productores mineros y consultores en Perú. Ayuda a identificar brechas de formalización mediante diagnóstico, checklist, alertas y gestión documental.

> Es un MVP institucional independiente. No representa a una entidad pública, no verifica registros oficiales en tiempo real y no sustituye asesoría legal o técnica.

## Stack

- HTML5, CSS3, JavaScript ES6
- Tailwind-inspired design system (CSS propio + tokens)
- Chart.js (gráficos)
- Heroicons (SVG inline)
- Supabase Auth + Postgres con Row Level Security
- Vercel para hosting y funciones de servidor
- JSON local para catálogos y respuestas de orientación sin IA

## Estructura

```
FormalizaAI/
├── index.html              # Router de sesión → login | dashboard
├── login.html
├── dashboard.html
├── diagnostico.html
├── chat.html
├── institucional.html      # Metodología, fuentes y limitaciones
├── perfil.html
├── README.md
└── assets/
    ├── css/main.css
    ├── js/
    │   ├── storage.js      # Persistencia (LocalStorage)
    │   ├── auth.js         # Auth simulada
    │   ├── diagnosis.js    # Motor de análisis
    │   ├── documents.js    # Portfolio + expediente referencial
    │   ├── templates.js    # Plantillas PDF / DOCX
    │   ├── chat.js         # Asistente IA simulado
    │   ├── ui.js           # Toast, theme, loader, helpers
    │   ├── layout.js       # Sidebar + navbar
    │   ├── app.js          # Bootstrap
    │   └── pages/          # Lógica por pantalla
├── documentos.html         # Gestión documental + plantillas
    ├── json/
    │   ├── usuarios.json
    │   ├── preguntas.json
    │   ├── requisitos.json
    │   ├── documentos.json
    │   └── chat.json
    └── img/
```

## Cómo ejecutar

Los JSON y el chat con IA se sirven con el **servidor local** (no abras los HTML con `file://`).

### Opción recomendada — `server.py` (estáticos + proxy IA)

```bash
cd FormalizaAI
copy .env.example .env
# Edita .env y pega tu XAI_API_KEY de https://console.x.ai
python server.py
```

O en Windows: doble clic en **`start.bat`**.

Abre: http://localhost:8080

### Asistente IA (xAI / Grok)

| Pieza | Detalle |
|-------|---------|
| Provider | xAI (OpenAI-compatible) — SpaceXAI skill |
| Endpoint real | `https://api.x.ai/v1/chat/completions` |
| Proxy local | `POST /api/chat` (la key **no** va al navegador) |
| Streaming | SSE en tiempo real (`stream: true` por defecto) — eventos `meta` / `delta` / `done` / `error` |
| Health | `GET /api/health` |
| Modelo default | `grok-4.5` (variable `XAI_MODEL`) |
| Fallback | Si no hay key o falla la red → respuestas locales de `chat.json` (también con escritura simulada) |

Variables en `.env`:

```env
XAI_API_KEY=xai-...
# XAI_MODEL=grok-4.5
# PORT=8080
```

### Opción solo estáticos (sin API IA)

```bash
python -m http.server 8080
# o: npx serve -p 8080
```

### VS Code / Cursor

Extensión “Live Server” sirve HTML/JSON, pero **no** el proxy `/api/chat`. Usa `python server.py` para Grok.

## Acceso al MVP

El frontend está conectado a Supabase Auth. Crea una cuenta desde **Crear cuenta**;
los perfiles, diagnósticos y expedientes se protegen por usuario mediante RLS.
Los usuarios JSON permanecen únicamente como datos heredados del prototipo local.

## Flujo de usuario

1. **Login / Registro** → Supabase Auth y perfil privado
2. **Dashboard** → % formalización, alertas, checklist, gráficos y resumen documental  
3. **Diagnóstico** → wizard de 10 preguntas  
4. **Análisis simulado** → genera %, riesgo, tiempo, costo, próximos pasos **y sincroniza el portfolio documental**  
5. **Documentos** → catálogo base, dependencias, anexos referenciales automáticos, plan 90 días y expediente exportable  
6. **Asistente** → respuestas locales; xAI es opcional y requiere `XAI_API_KEY`
7. **Perfil** → editar datos y ver estado  

## Gestión documental (v2)

- **Catálogo base** (`assets/json/documentos.json`): RUC, REINFO, contrato, IGAFOM, IA, seguridad, laboral, expediente maestro.  
- **Dependencias**: p. ej. IGAFOM requiere RUC + REINFO + contrato; el sistema marca *bloqueados*.  
- **Referenciales automáticos**: anexos, checklist de trámite, plantilla de ficha y plan 90 días al cerrar el diagnóstico.  
- **Portfolio del usuario** sincronizado con Supabase y respaldo local por usuario.
- **Exportar referencial**: copia texto del expediente maestro.  
- **Plantillas PDF / DOCX**: fichas por documento y expediente completo (`TemplateService` + jsPDF + JSZip), con datos del titular, checklist y anexos.  

Pantalla: `documentos.html` (menú **Documentos**).

## LocalStorage (claves)

Prefijo `formalizaai_`:

- `session` — usuario autenticado  
- `users` — usuarios (seed + registrados)  
- `respuestas` — respuestas del wizard  
- `resultado` — último diagnóstico  
- `checklist` / `alertas` / `progress`  
- `doc_portfolio` — portfolio de documentos del usuario  
- `doc_expediente` — expediente referencial generado  
- `chat_history` / `theme`  

## Arquitectura actual

| Capa | Implementación |
|------|----------------|
| Identidad | Supabase Auth |
| Persistencia | Supabase Postgres + RLS |
| Catálogos | JSON estático versionado |
| Diagnóstico | Motor de reglas en el navegador + persistencia remota |
| Chat | Fallback local; xAI opcional mediante función de servidor |

Los módulos ya separan **UI · dominio · persistencia** para facilitar el cambio sin reescribir pantallas.

## Notas de producto

- Los montos y plazos son **orientativos** para el MVP.  
- El “análisis IA” es un motor de reglas ponderadas (`requisitos.json`).  
- Ideal para demos y entrevistas con productores / consultores.  

---

MVP independiente para validación institucional · FormalizaAI · Perú
