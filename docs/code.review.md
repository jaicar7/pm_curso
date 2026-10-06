# Revisión de código: Project Management MVP

Fecha: 2026-10-05. Alcance: todo el repositorio (backend, frontend, Docker, scripts, tests, configuración y documentación).

## Estado (2026-10-05)

Acciones A1-A13 (críticas, altas y medias) corregidas y verificadas: 25 tests backend (cobertura 94%), 10 unitarios frontend, 6 E2E repetibles, lint y `tsc` sin errores, 0 vulnerabilidades en `npm audit`, y scripts de arranque/parada probados con Docker. Las acciones bajas (A14-A20) siguen pendientes.

## Resumen

El MVP funciona y está bien estructurado para su tamaño: el backend es pequeño y legible, la IA valida sus acciones antes de aplicarlas y las pruebas pasan (16 backend, 7 unitarias frontend, 4 E2E con base de datos nueva). Sin embargo, la revisión encontró:

- **Un fallo funcional grave**, confirmado ejecutándolo: borrar una tarjeta después de reordenar su columna falla con un error 500.
- **Dos requisitos de negocio sin cumplir**: las tarjetas no se pueden editar desde la UI, y los scripts de arranque no usan Docker.
- **Un script peligroso**: `scripts/stop.bat` no detiene el backend y, si lo hiciera, mataría todos los procesos `python.exe` de la máquina.
- Varias simplificaciones, código muerto y huecos en las pruebas.

Severidades: **Crítica** (rompe funcionalidad o es peligrosa), **Alta** (requisito incumplido o error visible al usuario), **Media** (robustez, mantenimiento o seguridad de dependencias), **Baja** (limpieza y estilo).

## Acciones

Ordenadas por prioridad. Cada acción remite al hallazgo detallado.

### Críticas
- [x] **A1.** Corregir la renumeración de posiciones en `delete_card` (H1).
- [x] **A2.** Reescribir `scripts/stop.bat` para que detenga solo el backend (H2).

### Altas
- [x] **A3.** Añadir edición de tarjetas (título y detalles) en la UI usando el `updateCard` ya existente (H3).
- [x] **A4.** Hacer que los scripts de `scripts/` construyan y arranquen el contenedor Docker, con un volumen para `data/` (H4).
- [x] **A5.** Devolver 502 en lugar de 500 cuando la IA responde con un bloque de código en una sola línea (H5).
- [x] **A6.** Actualizar `next` a 16.3.8 o posterior (H6).

### Medias
- [x] **A7.** Cerrar las conexiones SQLite e inicializar la base de datos una sola vez al arrancar (H7).
- [x] **A8.** Aplicar las acciones de la IA en una sola transacción y simplificar la validación duplicada (H8).
- [x] **A9.** Añadir `.dockerignore` (H9).
- [x] **A10.** Ignorar en git `data/*.sqlite3`, `frontend/test-results/`, `.backend.pid` y `.local_backend.log`, y sacar del repositorio los ya versionados (H10).
- [x] **A11.** Añadir las pruebas que faltan, empezando por la que habría detectado H1 (H11).
- [x] **A12.** Hacer que los E2E arranquen el backend con una base de datos nueva automáticamente (H12).
- [x] **A13.** Limitar la longitud de los campos de la API como ya hace el esquema de la IA (H13).

### Bajas
- [ ] **A14.** Eliminar el endpoint `/api/ai/chat`, el CORS y el HTML de respaldo de `/` (H14).
- [ ] **A15.** Unificar la indentación de `backend/app/main.py` a 4 espacios (H15).
- [ ] **A16.** Limpiar `KanbanBoard.tsx`: usar `api.ts` para la IA, quitar `useMemo` innecesario, el texto "No details yet." y el parámetro sin uso (H16).
- [ ] **A17.** Eliminar código muerto en `kanban.ts` (H17).
- [ ] **A18.** Quitar o hacer real el indicador "AI connected" (H18).
- [ ] **A19.** Restringir la cobertura de Vitest a `src/` (H19).
- [ ] **A20.** Detalles menores: color del error de login, `updated_at` en movimientos, restricción redundante, `.vscode` versionado y salida ruidosa de `start.sh` (H20).

---

## Hallazgos

### H1. Borrar una tarjeta tras reordenar la columna falla (Crítica)

`backend/app/database.py:198-202`

```python
connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
connection.execute(
    "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?", ...
)
```

SQLite comprueba `UNIQUE(column_id, position)` fila a fila, no al final de la sentencia. Si el orden físico de las filas no coincide con su posición (lo normal tras arrastrar tarjetas), una fila se decrementa a una posición todavía ocupada y la sentencia falla.

**Evidencia** (ejecutado durante la revisión): crear 3 tarjetas en Discovery, mover las dos últimas al principio y borrar la primera:

```
delete renumber FAIL: IntegrityError UNIQUE constraint failed: cards.column_id, cards.position
```

La excepción no se captura en `main.py`, así que el usuario recibe un 500. La transacción se deshace, pero la tarjeta no se puede borrar. `move_card` ya evita este problema con el desplazamiento `+100000` (línea 230).

**Solución:** aplicar el mismo patrón que en `move_card` (desplazar primero las posiciones afectadas y luego renumerarlas), o renumerar la columna en orden con un bucle. Añadir un test con este escenario.

### H2. `scripts/stop.bat` no funciona y es peligroso (Crítica)

`scripts/stop.bat:4-10`

```bat
for /f %%p in ('tasklist /nh /fi "imagename eq python.exe" /fo csv ^| findstr /I "uvicorn"') do (
  taskkill /F /IM python.exe
```

- `tasklist` no muestra la línea de comandos, así que `findstr "uvicorn"` nunca encuentra nada: el script siempre dice "No backend process found" y el servidor sigue en marcha.
- Si encontrara algo, `taskkill /F /IM python.exe` mataría **todos** los procesos Python del usuario, no solo el backend.
- `start.bat` no guarda PID, a diferencia de `start.sh`.

**Solución:** si los scripts pasan a Docker (A4), basta con `docker stop`/`docker rm` del contenedor con nombre fijo. Si se mantiene el modo local, matar por el PID guardado o por el proceso que escucha en el puerto 8000.

### H3. Las tarjetas no se pueden editar (Alta)

Requisito de `AGENTS.md`: "The cards on the Kanban board can be moved with drag and drop, and edited".

`frontend/src/components/KanbanCard.tsx` solo muestra el título, los detalles y el botón Remove. `updateCard` existe en `frontend/src/lib/api.ts:67` y el backend tiene `PATCH /api/cards/{id}`, pero ningún componente lo usa. Solo la IA puede editar tarjetas.

**Solución:** permitir editar título y detalles en la tarjeta (por ejemplo, un modo edición con dos campos y Guardar/Cancelar) que llame a `updateCard`. Cubrirlo con un test de componente y uno E2E.

### H4. Los scripts no usan Docker (Alta)

`AGENTS.md` pide que el MVP se ejecute en un contenedor Docker y que los scripts de `scripts/` arranquen y paren el servidor. Ahora:

- `scripts/start.sh` y `start.bat` lanzan `uvicorn` con el Python local e instalan dependencias con `pip` en el sistema.
- No construyen el frontend: sirven el `frontend/out` que exista, que puede estar desactualizado (el actual es del 22 de septiembre, anterior a cambios recientes).
- El Dockerfile funciona, pero nada lo usa y no hay volumen: los datos se pierden al recrear el contenedor.

**Solución:** `start` hace `docker build` y `docker run -d --name pm-mvp -p 8000:8000 --env-file .env -v <proyecto>/data:/app/data`; `stop` hace `docker rm -f pm-mvp`. Eso también resuelve H2.

### H5. Respuestas de IA con bloque de código en una línea dan 500 (Alta)

`backend/app/ai_board.py:68-70`

```python
if candidate.startswith("```"):
    candidate = candidate.split("\n", 1)[1].rsplit("```", 1)[0].strip()
```

Si el modelo responde ```` ```{"response":...}``` ```` sin salto de línea, `split("\n", 1)[1]` lanza `IndexError`. `main.py:62` solo captura `ValueError` y `OpenRouterError`, así que el usuario recibe un 500 genérico.

**Evidencia:** `parse FAIL: IndexError list index out of range` con las entradas ```` ```{...}``` ```` y ```` ```json {...}``` ````.

**Solución:** extraer el JSON entre la primera `{` y la última `}` del texto. Así también se aceptan respuestas con texto alrededor del JSON (ahora rechazadas) y se elimina el caso especial del bloque de código.

### H6. Vulnerabilidades en dependencias del frontend (Alta)

`npm audit --omit=dev`: 6 vulnerabilidades (1 crítica, 4 altas, 1 moderada). La crítica es `next` 16.1.6, versión fijada en `package.json`; `postcss` y `sharp` vienen a través de `next`. Todas tienen solución sin cambio de versión mayor (`next` 16.3.8).

El impacto real es menor del que sugiere la severidad: en producción la app es una exportación estática servida por FastAPI y no ejecuta el servidor de Next. Aun así, el servidor de desarrollo sí está expuesto y la actualización es barata.

**Solución:** actualizar `next` y `eslint-config-next` a 16.3.8 o posterior, ejecutar `npm audit fix` y volver a pasar lint, unit y E2E.

### H7. Conexiones SQLite sin cerrar y esquema recreado en cada petición (Media)

`backend/app/database.py:50-59` y llamadas a `initialize()` en las líneas 121, 141, 156, 178, 190 y 207.

- `with sqlite3.connect(...) as connection` solo confirma o deshace la transacción; **no cierra** la conexión (comportamiento documentado de `sqlite3`). Cada operación deja una conexión abierta hasta que la recoge el recolector de basura, y en Windows eso mantiene el fichero bloqueado.
- Cada operación pública llama a `initialize()`, que abre otra conexión y ejecuta todo el DDL y la consulta de la semilla: dos conexiones por petición.

**Solución:** cerrar con `contextlib.closing` (o un método `connect` que sea un context manager que confirme y cierre), y llamar a `initialize()` una vez en el `lifespan` de FastAPI. Los tests ya crean su propio `Database`, así que solo habría que inicializarlo en el fixture.

### H8. La ejecución de acciones de IA no es atómica y la validación está duplicada (Media)

`backend/app/ai_board.py:101-150`

- Cada acción se aplica con su propia conexión y transacción. Si una falla a mitad de la lista, las anteriores quedan aplicadas y el usuario recibe un error. La validación previa reduce mucho el riesgo, pero no lo elimina (por ejemplo, H1 podía fallar en un `delete_card`).
- La detección de acciones repetidas sobre una tarjeta se hace dos veces: dentro del bucle para update/delete (líneas 125-127) y al final contando acciones (líneas 130-134). La segunda basta.
- Las comprobaciones de `title.strip()` repiten las de `database.py`; existen solo porque la ejecución no es atómica.

**Solución:** que `Database` acepte una conexión existente (o tenga un método que aplique una lista de acciones en una transacción), dejar solo la comprobación de IDs más el conteo final y confiar en la validación de `database.py` con rollback.

### H9. Falta `.dockerignore` (Media)

Sin `.dockerignore`, el contexto de build incluye `frontend/node_modules`, `.next`, `out`, `test-results`, `.git`, `data/` y `.env`. Además, `COPY frontend ./` (Dockerfile, etapa `frontend-builder`) copia el `node_modules` de Windows encima del instalado por `npm ci` en Linux. Hoy funciona porque los binarios nativos de cada plataforma están en paquetes distintos, pero es frágil y lento.

**Solución:** `.dockerignore` con `**/node_modules`, `frontend/.next`, `frontend/out`, `frontend/test-results`, `.git`, `data`, `.env`, `**/__pycache__`, `**/.pytest_cache`.

### H10. Artefactos versionados en git (Media)

- `data/project-management.sqlite3` está versionado: cada uso local de la app ensucia el repositorio y comparte datos de un usuario con otros.
- `frontend/test-results/` está versionado y cambia en cada ejecución de Playwright.
- `.backend.pid` y `.local_backend.log` (creados por `start.sh`) no se ignoran.

**Solución:** añadirlos a `.gitignore` y hacer `git rm --cached` de los dos primeros. La base de datos se crea sola si no existe.

### H11. Huecos en las pruebas (Media)

Cobertura medida en esta revisión:

- **Frontend unitario (solo `src/`):** componentes 76%, `lib` 60%. `LoginForm.tsx`, `page.tsx` y `api.ts` tienen 0% en unitarios (los E2E cubren login y carga). La cifra global que muestra Vitest (61,7%) mezcla ficheros de build, ver H19.
- **Backend:** no se puede medir porque `pytest-cov` no está entre las dependencias.

Casos importantes sin test:

1. Borrar una tarjeta después de reordenarla (habría detectado H1).
2. Mover una tarjeta dentro de la misma columna, y a una posición mayor que el tamaño de la columna.
3. Aislamiento entre usuarios: que un usuario no pueda tocar columnas o tarjetas de otro (el código lo intenta con `user_id`, pero nada lo comprueba).
4. `/api/ai/board` devolviendo 502 con respuestas inválidas (H5).
5. Frontend: recarga del tablero tras una respuesta de la IA, varios mensajes seguidos y mensaje de error de la IA (ya anotados como pendientes en `PLAN.md`).
6. E2E: persistencia tras recargar la página y renombrar columnas.
7. Edición de tarjetas, cuando exista (H3).

**Solución:** añadir estos tests y `pytest-cov` como dependencia de desarrollo, con `python -m pytest --cov=app`.

### H12. Los E2E dependen del estado de la base de datos (Media)

`frontend/tests/kanban.spec.ts` asume el tablero inicial (`card-1` en Backlog, 5 columnas). `playwright.config.ts` solo arranca el servidor de Next; el backend se arranca a mano, normalmente con la base de datos real. La segunda ejecución falla porque `card-1` ya se movió, y además los tests ensucian los datos del usuario.

**Solución:** añadir un segundo `webServer` en `playwright.config.ts` que arranque `uvicorn` con `PM_DATABASE_PATH` apuntando a un fichero nuevo en cada ejecución (por ejemplo, con la ruta generada en `globalSetup`, que también borra el fichero anterior).

### H13. La API no limita la longitud de los campos (Media)

`backend/app/schemas.py`: `CardCreate`, `CardUpdate` y `ColumnUpdate` solo exigen `min_length=1`. El esquema de la IA (`ai_board.py`) limita títulos a 200 caracteres y detalles a 5000. Un título enorme enviado por la API sí se acepta, y luego todo el tablero viaja a OpenRouter en cada petición de IA.

**Solución:** usar los mismos límites (`max_length=200` y `5000`) en los esquemas de la API.

### H14. Código sobrante en `main.py` (Baja)

- `POST /api/ai/chat` (`main.py:51-56`) era la prueba de conectividad de la parte 8; el frontend no lo usa. Junto con `ChatRequest` y `ChatResponse` en `schemas.py`, puede eliminarse (y el test correspondiente adaptarse a `chat_with_openrouter`).
- El middleware CORS (`main.py:16-22`) no hace falta: en desarrollo Next reescribe `/api/*` al backend (mismo origen para el navegador), y en producción todo se sirve desde el mismo origen.
- `root()` (`main.py:26-43`) duplica lo que ya hace `StaticFiles(html=True)` y mantiene un HTML de respaldo. Con el montaje basta (y el test `test_root_serves_hello_world_html` debería renombrarse).

### H15. Indentación mezclada en `main.py` (Baja)

Las funciones de `main.py:51-122` usan 2 espacios y el resto del backend usa 4. Python lo acepta, pero no es idiomático (PEP 8). Pasar `ruff format` o equivalente.

### H16. Limpieza en `KanbanBoard.tsx` (Baja)

- `handleAiSend` (línea 166) usa `fetch` directamente en lugar del helper `request` de `api.ts`, a diferencia del resto de llamadas. Mover la llamada a `api.ts` (`sendAiMessage`) simplifica el componente y su test, que podría simular el módulo igual que en las demás operaciones.
- `cardsById = useMemo(...)` (línea 48) no aporta nada; se puede usar `board.cards` directamente.
- `details || "No details yet."` (línea 113) guarda un texto de relleno en la base de datos. Es mejor guardar `""` y mostrar el texto solo en la UI si hace falta.
- `handleDeleteCard(_columnId, ...)` (línea 130): el parámetro no se usa; quitarlo de la cadena de props (`KanbanColumn` → `KanbanBoard`).
- `handleColumnBlur` (línea 104) envía una petición aunque el título no haya cambiado.

### H17. Código muerto en `kanban.ts` (Baja)

- `createId` (`frontend/src/lib/kanban.ts:164-168`) no se usa: los IDs los genera el backend.
- `initialData` (líneas 18-72) solo lo usa el test de componente; duplica la semilla de `database.py`. Mejor moverlo al fichero de test.

### H18. Indicador "AI connected" estático (Baja)

`frontend/src/components/AIChatSidebar.tsx`: el punto azul con `aria-label="AI connected"` se muestra siempre, aunque no haya clave de OpenRouter o el proveedor devuelva 429. Es información falsa para el usuario y para lectores de pantalla. Quitarlo es lo más simple.

### H19. La cobertura de Vitest incluye ficheros de build (Baja)

`frontend/vitest.config.ts` no define `coverage.include`, así que el informe mezcla `out/_next/static/chunks/*.js`, `next.config.ts` y `playwright.config.ts`, y la cifra global sale artificialmente baja. Añadir `coverage: { include: ["src/**"] }`.

### H20. Detalles menores (Baja)

- `LoginForm.tsx`: el error usa `text-red-700`, fuera de la paleta del proyecto.
- `database.py:230-237`: `move_card` reescribe `updated_at` de todas las tarjetas del tablero, no solo de la movida, así que el campo deja de significar algo.
- `database.py:83`: `UNIQUE(board_id, id)` es redundante porque `id` ya es clave primaria.
- `frontend/.vscode/tasks.json` es configuración personal de editor (usa `npm.cmd`, solo Windows); no debería versionarse.
- `scripts/start.sh:33` imprime todo el HTML de la página en la terminal al arrancar.
- Las dependencias de Python no están fijadas (`>=`) ni hay lockfile, y el contenedor usa Python 3.12 mientras el entorno local usa 3.14. Con `uv` se puede generar `uv.lock` y usar `uv sync --frozen` en el Dockerfile.

---

## Aspectos positivos

- Arquitectura simple y adecuada al MVP: un solo proceso sirve la API y el frontend estático.
- SQL siempre parametrizado; las consultas filtran por `user_id`, lo que deja el camino preparado para varios usuarios.
- Contraseña de la semilla guardada con PBKDF2 y sal, nunca en claro.
- La IA solo puede ejecutar acciones de una lista cerrada, con IDs comprobados contra el tablero y límite de 20 acciones; la clave de OpenRouter nunca llega al frontend y los errores del proveedor no la exponen.
- Tests de backend aislados con bases de datos temporales.
- Interfaz coherente con la paleta definida y con etiquetas accesibles en los formularios.

## Comprobaciones realizadas

- Lectura completa de `backend/`, `frontend/src/`, `frontend/tests/`, `scripts/`, `Dockerfile`, configuración y documentación.
- `python -m pytest -q` (16 pasan), `npm run lint` (sin errores), `npm run test:unit` (7 pasan), `npm run test:e2e` (4 pasan con base de datos nueva).
- Script de reproducción para H1 y H5 contra una base de datos temporal.
- `npm audit --omit=dev` y `vitest run --coverage`.
