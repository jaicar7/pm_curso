# Revisión de código: Project Management MVP

Fecha: 2026-10-06. Alcance: todo el repositorio (backend, frontend, Docker, scripts, tests, configuración y documentación).

## Resumen

El MVP cumple los requisitos de negocio: login, tablero Kanban persistente en SQLite, columnas renombrables, tarjetas editables y movibles con drag and drop, chat con IA que crea, edita, mueve y borra tarjetas, todo empaquetado en Docker con scripts de arranque y parada. El código es pequeño, legible y está bien probado. Los fallos críticos de la revisión anterior (A1-A13) están corregidos y verificados.

No hay fallos críticos. Lo que queda:

- **Un fallo visible para el usuario**: los errores de validación (422) de la API se muestran como `[object Object]` (H1).
- **Una carencia funcional en la IA**: no recibe el historial de la conversación, así que no entiende peticiones de seguimiento (H2).
- **Empaquetado Python poco idiomático con uv**: dos listas de dependencias, dependencias de test en la imagen y sin lockfile (H3).
- Las tareas de limpieza de baja prioridad de la revisión anterior (A14-A20) siguen casi todas pendientes (H4).

Severidades: **Alta** (error visible o requisito afectado), **Media** (robustez, mantenimiento o UX), **Baja** (limpieza y estilo).

## Comprobaciones realizadas

- Lectura completa de `backend/`, `frontend/src/`, `frontend/tests/`, `scripts/`, `Dockerfile`, `.dockerignore`, `.gitignore`, configuración y `docs/`.
- `python -m pytest -q --cov=app`: 25 tests pasan, cobertura 94% (`openrouter.py` 75%).
- `vitest run --coverage --coverage.include=src/**`: 10 tests pasan. Componentes 80%, `lib` 60%, `page.tsx`, `LoginForm.tsx` y `api.ts` 0% en unitarios (cubiertos por E2E).
- `npm run lint`: 0 errores (1 aviso en `frontend/coverage/`, ver H15). `tsc --noEmit`: sin errores. `npm audit --omit=dev`: 0 vulnerabilidades.
- Reproducción de H1 con `TestClient`: `PATCH /api/cards/card-1` con título de 201 caracteres y `POST /api/ai/board` con mensaje de 5001 caracteres devuelven `422` con `detail` de tipo `list`.
- No se ejecutaron los E2E ni la construcción Docker en esta revisión.

## Acciones

### Altas
- [ ] **A1.** Mostrar mensajes legibles para errores 422 y limitar la longitud de los campos en la UI (H1).
- [ ] **A2.** Enviar a la IA el historial reciente de la conversación (H2).

### Medias
- [ ] **A3.** Usar `pyproject.toml` + `uv.lock` como única fuente de dependencias y `uv sync --frozen --no-dev` en el Dockerfile (H3).
- [ ] **A4.** Cerrar las acciones bajas pendientes de la revisión anterior (H4).
- [ ] **A5.** Distinguir timeouts de errores de conexión en OpenRouter y revisar el timeout de 30 s (H5).
- [ ] **A6.** Reforzar las pruebas débiles o ausentes (H6).
- [ ] **A7.** Añadir un `README.md` mínimo en la raíz y actualizar la documentación desfasada (H7).

### Bajas
- [ ] **A8.** Valorar `response_format` de OpenRouter para reducir respuestas no parseables (H8).
- [ ] **A9.** Quitar el manejador global de `ValueError` o acotarlo (H9).
- [ ] **A10.** Simplificar la gestión de sesión en `page.tsx` (H10).
- [ ] **A11.** Coherencia del esquema SQLite con `DATA_MODEL.json` (H11).
- [ ] **A12.** Evitar peticiones innecesarias en arrastres y renombrados sin cambios (H12).
- [ ] **A13.** Accesibilidad del drag and drop y del chat (H13).
- [ ] **A14.** Ajustes de Docker: versiones fijadas, usuario no root, `HEALTHCHECK` (H14).
- [ ] **A15.** Ignorar `coverage/` en ESLint y limitar la cobertura de Vitest a `src/` (H15).

---

## Hallazgos

### H1. Los errores 422 se muestran como `[object Object]` (Alta)

`frontend/src/lib/api.ts:27-30` y `frontend/src/components/KanbanBoard.tsx:181-185`

```ts
throw new Error(body?.detail ?? "The board could not be updated.");
```

FastAPI devuelve `detail` como **string** en los errores propios (400, 404, 502) pero como **lista de objetos** en los errores de validación de Pydantic (422). `new Error([...])` convierte la lista en `"[object Object]"`, que es lo que ve el usuario en la alerta.

Es alcanzable desde la UI: los inputs de título de tarjeta, de columna y del chat no tienen `maxLength`, mientras que la API limita títulos a 200, detalles a 5000 y mensajes a la IA a 5000 caracteres (`backend/app/schemas.py`). Verificado: ambos casos devuelven `422` con `detail` de tipo `list`.

**Solución:** añadir `maxLength` (200 / 5000) a los inputs y textareas, y en el cliente usar `detail` solo si es string (`typeof body?.detail === "string" ? body.detail : mensaje genérico`). Exportar los límites en un único sitio del frontend.

### H2. La IA no recibe el historial de la conversación (Alta)

`backend/app/ai_board.py:113-119`, `backend/app/schemas.py:36-37` y `KanbanBoard.tsx:175-179`

Cada petición envía solo el tablero y el último mensaje (decisión anotada en `PLAN.md`, línea 22). El sidebar muestra una conversación, pero el modelo no la ve: una secuencia como "Crea una tarjeta para la release" seguida de "Ahora muévela a Review" falla porque el modelo no sabe a qué se refiere "muévela". El requisito de un chat con IA en un sidebar implica, de forma razonable, que se comporte como una conversación.

**Solución sencilla:** que `BoardCommandRequest` acepte `history: list[{role, content}]` (limitado, por ejemplo, a los últimos 10 mensajes) y que `chat_with_openrouter` reciba una lista de mensajes en lugar de un string: un mensaje `system` con las instrucciones y el tablero, seguido del historial y del mensaje nuevo. El frontend ya tiene `aiMessages`.

### H3. Dependencias de Python duplicadas y no fijadas (Media)

`backend/requirements.txt`, `backend/pyproject.toml`, `Dockerfile:18-21`

- Hay dos listas de dependencias que deben mantenerse a mano (`backend/AGENTS.md` lo reconoce: "mirrored in `pyproject.toml`").
- `requirements.txt` mezcla `pytest` y `pytest-cov` con las dependencias de ejecución, así que acaban en la imagen de producción.
- Todo usa `>=` y no hay lockfile: dos builds del mismo commit pueden instalar versiones distintas. Ya se nota: el entorno local (Python 3.14) emite avisos de deprecación de Starlette/anyio en los tests que la imagen (Python 3.12) no tiene.
- `uv pip install -r requirements.txt` usa uv como sustituto de pip, no como gestor de proyecto, que es lo que pide `AGENTS.md`.

**Solución:** eliminar `requirements.txt`, generar `backend/uv.lock` con `uv lock`, y en el Dockerfile copiar `pyproject.toml` y `uv.lock` y ejecutar `uv sync --frozen --no-dev`, arrancando con `uv run` o el Python del `.venv`. En local, `uv run pytest`. Actualizar `CLAUDE.md` y `backend/AGENTS.md`, y usar el mismo comando en `playwright.config.ts` (que hoy invoca `python`/`python3` del sistema).

### H4. Acciones bajas pendientes de la revisión anterior (Media)

Estado de A14-A20 de la revisión del 2026-10-05:

| Acción | Estado | Detalle |
|---|---|---|
| A14 | Pendiente | `POST /api/ai/chat`, `ChatRequest`/`ChatResponse`, el middleware CORS y el HTML de respaldo de `root()` siguen en `main.py`. Ninguno lo usa el frontend; en desarrollo Next reescribe `/api/*`, así que CORS no hace falta. `root()` duplica `StaticFiles(html=True)`. |
| A15 | Hecha | `main.py` usa 4 espacios. |
| A16 | Pendiente | `KanbanBoard.tsx`: `handleAiSend` usa `fetch` directo en lugar de `api.ts`; `useMemo` innecesario en `cardsById`; `details \|\| "No details yet."` guarda texto de relleno en la base de datos; parámetro `_columnId` sin uso en `handleDeleteCard` y en las props de `KanbanColumn`. |
| A17 | Pendiente | `createId` (sin uso) e `initialData` (solo lo usa el test) siguen en `kanban.ts`. |
| A18 | Pendiente | El punto "AI connected" de `AIChatSidebar.tsx` sigue siendo estático. |
| A19 | Pendiente | `vitest.config.ts` no define `coverage.include` (ver H15). |
| A20 | Parcial | Corregidos `updated_at` en movimientos y la salida de `start.sh`. Pendientes: `text-red-700` en `LoginForm.tsx` (fuera de la paleta), `UNIQUE(board_id, id)` redundante (ver H11), `frontend/.vscode/tasks.json` versionado, dependencias sin fijar (ver H3). |

Además, `docs/code.review.md` aparece borrado en el árbol de trabajo, pero `docs/PLAN.md:240` lo sigue citando. Este documento lo sustituye; conviene actualizar la referencia.

### H5. Los timeouts de OpenRouter se reportan como fallo de conexión (Media)

`backend/app/openrouter.py:34-43`

`httpx.TimeoutException` es subclase de `httpx.RequestError`, así que un timeout se reporta como "Could not connect to OpenRouter". Con un modelo gratuito de 550B parámetros y un prompt que incluye todo el tablero, superar 30 s es un caso realista, y el mensaje lleva a buscar un problema de red inexistente.

**Solución:** capturar `httpx.TimeoutException` antes que `RequestError` con un mensaje propio ("OpenRouter timed out") y subir el timeout (por ejemplo, a 60 s). Añadir tests para timeout, JSON inválido y respuesta vacía (las líneas sin cubrir de `openrouter.py`).

### H6. Pruebas débiles o ausentes (Media)

- `KanbanBoard.test.tsx` "renames a column" solo comprueba el valor del input; no verifica que al perder el foco se llame a `renameColumn`, que es el comportamiento importante.
- "adds and removes a card" no comprueba los argumentos de `createCard` ni de `deleteCard`.
- No hay test del camino de error de `persist` (fallo de la API, recarga del tablero y alerta), aunque es la estrategia de errores de todo el frontend.
- `api.ts` (incluida `boardFromApi`, la conversión del formato de la API) no tiene tests unitarios; un test de `boardFromApi` y otro del manejo de `detail` (H1) son baratos.
- `test_main.py` crea un `TestClient` a nivel de módulo sin el fixture `client`; funciona porque solo toca `/` y `/api/health`, pero es inconsistente con el resto. El nombre `test_root_serves_hello_world_html` está desfasado.
- No hay test del flujo de IA completo con `chat_with_openrouter` simulado que devuelva acciones válidas y compruebe el tablero resultante a través del endpoint (hoy se prueba el endpoint con `answer_board_request` sustituido, y la ejecución por separado).

### H7. Falta README en la raíz y documentación desfasada (Media)

- No hay `README.md` en la raíz. `AGENTS.md` pide mantenerlo mínimo, pero debe existir: requisitos (`Docker`, `.env` con `OPENROUTER_API_KEY`), `scripts/start.*`, `scripts/stop.*`, URL, credenciales y comandos de test.
- `frontend/README.md` indica `npm run dev` sin mencionar que necesita el backend en el puerto 8000.
- `frontend/AGENTS.md` dice que una tarjeta nueva "is created with a generated id" en el frontend (ahora lo genera el backend) y que `kanban.ts` contiene la semilla inicial (debería eliminarse, ver A17).
- `docs/DATA_MODEL.json` dice que `rename_column` actualiza `boards.updated_at`, pero el código nunca actualiza ese campo (ver H11).

### H8. Salida estructurada de OpenRouter (Baja)

`backend/app/ai_board.py:66-88`

El formato de salida se pide en texto libre y se extrae del primer `{` al último `}`. Funciona y los fallos devuelven 502, pero con modelos gratuitos los 502 por JSON inválido serán frecuentes. OpenRouter admite `response_format: {"type": "json_schema", ...}`; el esquema puede generarse con `BoardCommand.model_json_schema()`. Merece la pena probarlo con el modelo configurado y, si lo admite, usarlo manteniendo la validación con Pydantic. Si no lo admite, dejarlo como está.

### H9. Manejador global de `ValueError` (Baja)

`backend/app/main.py:42-44`

Convierte cualquier `ValueError` no capturado en un 400 con su mensaje. Sirve para los títulos vacíos de `_clean_title`, pero también convertiría en 400 errores de programación (por ejemplo, un `ValueError` de `json` o de Pydantic al construir una respuesta), ocultando bugs como si fueran errores del cliente. Es más claro que `_clean_title` lance una excepción propia (o `HTTPException` desde la ruta) y registrar solo esa.

### H10. Gestión de sesión enrevesada en `page.tsx` (Baja)

`frontend/src/app/page.tsx:8-17`

Combina `useSyncExternalStore` con una suscripción vacía y un `useState` que lo sobrescribe. Funciona, pero cuesta leerlo, y como el snapshot de servidor es `false`, un usuario ya autenticado ve el formulario de login durante un instante al cargar. Basta con un `useState<boolean | null>(null)` inicializado en un `useEffect` desde `localStorage`, sin renderizar nada mientras vale `null`.

### H11. Esquema SQLite y `DATA_MODEL.json` (Baja)

`backend/app/database.py:52-72`

- `UNIQUE(board_id, id)` en `columns` es redundante como restricción de unicidad, porque `id` ya es clave primaria. Solo tendría sentido si `cards` lo usara para una clave foránea compuesta `FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id)`, que es justo lo que pide `DATA_MODEL.json` ("A card must reference a column belonging to the same board") y hoy solo garantiza el código. Elegir una de dos: añadir la FK compuesta o quitar la restricción y la frase del modelo.
- `boards.updated_at` nunca se actualiza. Quitarlo del modelo o actualizarlo; lo más simple es quitar la mención en `DATA_MODEL.json`.

### H12. Peticiones innecesarias (Baja)

`frontend/src/components/KanbanBoard.tsx`

- `handleColumnBlur` (línea 104) envía `PATCH` aunque el título no haya cambiado: cada clic en el título y fuera de él genera una escritura.
- `handleDragEnd` (línea 70) envía `move` aunque la tarjeta acabe en la misma posición (por ejemplo, soltar sobre su propia columna cuando ya es la última).

Comparar con el valor anterior antes de llamar a la API.

### H13. Accesibilidad (Baja)

- Solo se registra `PointerSensor`: las tarjetas no se pueden mover con teclado. `@dnd-kit` incluye `KeyboardSensor` con `sortableKeyboardCoordinates`; añadirlo son dos líneas.
- `KanbanCard.tsx:47` aplica `attributes` de `useSortable` (que incluyen `role="button"` y `tabIndex`) al `<article>`, que contiene botones: elementos interactivos anidados.
- El chat no hace scroll automático al último mensaje, ni anuncia las respuestas a lectores de pantalla (`aria-live="polite"` en el contenedor de mensajes).

### H14. Ajustes de Docker (Baja)

`Dockerfile`

- `ghcr.io/astral-sh/uv:latest` sin versión: builds no reproducibles. Fijar una versión.
- `python:3.12-slim`: el estándar del proyecto pide versiones actuales y el entorno local usa 3.14. Alinear (3.13 o 3.14) y fijar `requires-python` en consecuencia.
- El contenedor se ejecuta como root. Para un MVP local es aceptable, pero añadir un usuario sin privilegios es una línea; ojo con los permisos de `data/` montado.
- No hay `HEALTHCHECK`, aunque `PLAN.md` menciona un "healthcheck del container"; hoy lo hacen los scripts con `curl`. Opcional.
- La compilación del frontend descarga fuentes de Google (`next/font/google` en `layout.tsx`): el build necesita conexión a internet. Aceptable, pero conviene saberlo.

### H15. ESLint y cobertura de Vitest (Baja)

- `frontend/eslint.config.mjs` no ignora `coverage/`: tras generar cobertura, `npm run lint` analiza el informe HTML y avisa de `coverage/block-navigation.js`. Añadir `"coverage/**"` a `globalIgnores`.
- `frontend/vitest.config.ts` no define `coverage.include`, así que sin pasar `--coverage.include=src/**` el informe mezcla ficheros de build y configuración. Añadir `include: ["src/**"]`.
- `next.config.ts` define `rewrites` junto a `output: "export"`; Next avisa en cada `next build` de que no funcionarán en la exportación. Es correcto (solo se usan en `next dev`), pero se puede evitar el aviso definiendo `rewrites` solo en desarrollo.

---

## Aspectos positivos

- Arquitectura simple y adecuada al MVP: un único proceso sirve la API y el frontend estático; no hay ORM ni capas innecesarias.
- `Database.board()` como unidad de trabajo transaccional es una buena decisión: la IA aplica todas sus acciones en una sola transacción y cualquier fallo las deshace todas.
- La renumeración de posiciones con desplazamiento resuelve correctamente las colisiones con `UNIQUE(column_id, position)`, y está cubierta por tests.
- SQL siempre parametrizado; todas las consultas filtran por `board_id` y hay un test de aislamiento entre usuarios.
- La IA solo puede ejecutar una lista cerrada de acciones validadas con una unión discriminada de Pydantic, con IDs comprobados, límite de 20 acciones y rechazo de acciones conflictivas sobre una misma tarjeta. La clave de OpenRouter nunca llega al frontend ni aparece en los errores.
- Límites de longitud compartidos entre la API y el esquema de la IA.
- E2E con base de datos temporal nueva en cada ejecución, que prueban persistencia tras recargar.
- Scripts de arranque y parada simples y equivalentes en Windows y Unix, con volumen para `data/`.
- Interfaz coherente con la paleta del proyecto y formularios con etiquetas accesibles.
