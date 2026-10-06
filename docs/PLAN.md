# Plan detallado del proyecto: Project Management MVP

## Objetivo

Construir una aplicación local de gestión de proyectos con autenticación básica, tablero Kanban persistente, backend FastAPI, contenedor Docker y conectividad con IA mediante OpenRouter. El objetivo no es una solución generalista, sino un MVP funcional y verificable con pruebas reales, priorizando la cobertura de los comportamientos importantes.

## Criterio de aprobación previo

Antes de empezar el desarrollo incremental, el plan debe quedar validado por el usuario. Este documento actúa como base para aprobar el alcance, secuencia y criterios de calidad.

## Decisiones adoptadas

- El frontend se exporta como sitio estático y FastAPI sirve `frontend/out` desde `/`.
- El estado persistente vive en SQLite. El backend usa `data/project-management.sqlite3` por defecto y permite cambiarlo con `PM_DATABASE_PATH`.
- La sesión del MVP es local en el navegador con la clave `pm-mvp-authenticated`; las rutas de tablero usan internamente el usuario demo sembrado `user`.
- El backend devuelve tarjetas anidadas dentro de sus columnas. El frontend las normaliza a su estructura `cards` + `cardIds` para conservar el drag-and-drop existente.
- Las mutaciones del frontend usan la API real: carga inicial, renombrado, creación, borrado y movimiento de tarjetas. Las operaciones fallidas muestran error y recargan el board.
- OpenRouter se invoca únicamente desde el backend. La clave se carga desde `.env` y nunca se envía al frontend.
- La IA de tablero devuelve JSON validado con Pydantic y hasta 20 acciones. Solo puede usar IDs existentes y acciones explícitamente permitidas; las acciones conflictivas sobre una misma tarjeta se rechazan.
- El modelo usado es `nvidia/nemotron-3-ultra-550b-a55b:free` (cambiado desde `google/gemma-4-31b-it:free` en la parte 9).
- El Dockerfile instala las dependencias de Python con `uv pip install` a partir de `backend/requirements.txt`; los scripts locales usan el mismo fichero con `pip`.
- El sidebar de IA muestra el historial de la conversación en la UI, pero cada petición al modelo solo envía el tablero actual y el último mensaje.
- La prueba externa de OpenRouter alcanzó el proveedor pero quedó limitada por `HTTP 429`; las pruebas locales usan mocks y cubren errores sin depender de cuota.
- Los tests E2E de Playwright asumen el tablero sembrado: deben ejecutarse con el backend en el puerto 8000 y una base de datos nueva (`PM_DATABASE_PATH`).

## Part 1: Planificación y preparación

### Checklist
- [x] Revisar la estructura actual del frontend y del backend.
- [x] Confirmar los requisitos de negocio, limitaciones y decisiones técnicas.
- [x] Definir la estrategia de pruebas por fase: unit tests, integration tests y E2E.
- [x] Crear el fichero [frontend/AGENTS.md](../frontend/AGENTS.md) con la descripción técnica del código existente.
- [x] Acordar un objetivo orientativo de hasta 80% de cobertura, sin crear pruebas artificiales solo para alcanzar el porcentaje.
- [x] Solicitar aprobación del plan antes de continuar a scaffold y desarrollo.

### Pruebas y criterios de éxito
- [x] El plan queda documentado en este fichero.
- [x] Existe una guía específica para el frontend.
- [x] El usuario confirmó el alcance y el orden de trabajo.

---

## Part 2: Scaffolding del entorno

### Checklist
- [x] Crear la infraestructura Docker base para el proyecto.
- [x] Configurar el backend en [backend/](../backend/) con FastAPI.
- [x] Añadir dependencias y configuración inicial para Python con uv.
- [x] Crear scripts de arranque y parada en [scripts/](../scripts/) para Mac, Windows y Linux.
- [x] Servir una página de prueba simple para verificar que el contenedor responde correctamente.
- [x] Confirmar que el backend expone una ruta de ejemplo y que responde con datos estándar.

### Pruebas
- [x] Healthcheck del container.
- [x] GET a una ruta de ejemplo para comprobar HTML estático.
- [x] GET a una ruta API de ejemplo para comprobar JSON.

### Criterios de éxito
- [x] El entorno arranca localmente sin errores.
- [x] La app sirve contenido y la API responde de forma consistente.
- [x] El proyecto sigue la estructura prevista por la organización del repositorio.

---

## Part 3: Integración del frontend y despliegue estático

### Checklist
- [x] Ajustar la app Next.js para que pueda compilarse y servir en producción.
- [x] Hacer que el frontend se sirva desde el backend en la ruta raíz `/`.
- [x] Mantener el tablero Kanban demo visible en la vista principal.
- [x] Verificar el comportamiento del drag-and-drop y la edición básica de tarjetas.
- [x] Completar unit tests para la lógica del tablero.
- [x] Completar tests de integración para la UI del Kanban.

### Pruebas
- [x] Tests unitarios de la lógica de estado y movimiento de tarjetas.
- [x] Tests de renderizado del tablero y columnas.
- [x] Tests de interacción con drag-and-drop y formularios.

### Criterios de éxito
- [x] La app muestra el tablero demo correctamente en `/`.
- [x] Los tests de frontend pasan consistentemente.
- [x] La base del MVP queda lista para autenticación y persistencia.

---

## Part 4: Autenticación simulada

### Checklist
- [x] Implementar una pantalla de login básica con credenciales dummy (`user`, `password`).
- [x] Bloquear el acceso al tablero hasta autenticarse.
- [x] Añadir flujo de cierre de sesión.
- [x] Mantener el estado de sesión de forma simple y local para el MVP.
- [x] Cubrir con tests de login y logout centrados en los flujos reales de usuario.

### Pruebas
- Intento de acceso sin autenticación redirige a login.
- Usuario correcto entra al tablero.
- Usuario incorrecto recibe error y no accede.
- Cierre de sesión devuelve a la pantalla de login.

### Criterios de éxito
- [x] El tablero solo es visible para usuarios autenticados.
- [x] La experiencia cumple con el requisito del MVP sin complejidad adicional.

---

## Part 5: Modelado de datos y esquema de base de datos

### Checklist
- [x] Proponer esquema de usuario, tablero y tarjetas.
- [x] Definir columnas fijas y campos mínimos necesarios.
- [x] Guardar la descripción como JSON en [docs/DATA_MODEL.json](DATA_MODEL.json).
- [x] Documentar la estrategia de SQLite y la relación entre usuarios y tableros.
- [x] Obtener aprobación del usuario antes de implementar la persistencia real.

### Pruebas
- Validación del esquema JSON contra los requisitos del MVP.
- Verificación de que soporta múltiples usuarios y un único tablero por usuario en el futuro.

### Criterios de éxito
- Existe un documento claro con el esquema propuesto.
- La solución es simple, extensible y consistente con la limitación del MVP.

---

## Part 6: Backend y rutas de persistencia

### Checklist
- [x] Crear la base de datos SQLite si no existe.
- [x] Diseñar rutas para leer y actualizar el tablero del usuario autenticado.
- [x] Implementar CRUD mínimo de columnas y tarjetas.
- [x] Asegurar que cada usuario solo accede a su propio board.
- [x] Cubrir con tests unitarios del backend y de integración de la API.

### Pruebas
- GET del board para un usuario.
- POST/PUT/PATCH de tarjetas y columnas.
- Validación de errores de usuario no existente o datos inválidos.
- Persistencia en SQLite con re-arranque del servidor.

### Criterios de éxito
- [x] La API es capaz de leer y modificar el board para un usuario concreto.
- [x] Los cambios persisten en la base de datos.
- [x] La cobertura de backend alcanza el objetivo mínimo establecido.

---

## Part 7: Frontend conectado al backend

### Checklist
- [x] Sustituir el estado local por llamadas reales a la API para cargar y guardar el tablero.
- [x] Sincronizar cambios de arrastre, edición y creación de tarjetas con el backend.
- [x] Manejar estados de carga, error y reintento de forma simple.
- [x] Revisar que la UI sigue funcionando con datos persistentes.
- [ ] Ejecutar tests de integración muy completos con datos reales. Los 4 E2E (carga, crear tarjeta, mover tarjeta, login/logout) pasan contra el backend real con una base nueva; falta cubrir la persistencia tras recargar y los errores de API.

### Pruebas
- Carga inicial del tablero desde backend.
- Crear, renombrar y mover tarjetas.
- Persistencia entre recargas.
- Manejo de errores de red o API.

### Criterios de éxito
- [x] El tablero es funcional con datos reales y persistentes.
- [x] La UI refleja el estado real del backend.
- [x] El comportamiento es estable y compatible con pruebas automatizadas, siempre que los E2E arranquen con una base de datos nueva.

---

## Part 8: Integración con OpenRouter

### Checklist
- [x] Configurar la variable OPENROUTER_API_KEY y el modelo recomendado.
- [x] Añadir la capa de cliente HTTP para OpenRouter.
- [x] Intentar una prueba de conectividad simple con un prompt de cálculo básico (por ejemplo, "2+2").
- [ ] Verificar respuestas y latencia agradables para un MVP local; el proveedor respondió HTTP 429 por límite de uso/cuota.
- [x] Registrar errores y fallos de autenticación con mensajes claros.

### Pruebas
- Llamada simple con prompt mínimo.
- Comprobación de respuesta JSON y estructura esperada.
- Validación de error cuando la clave del proveedor no está configurada.

### Criterios de éxito
- [ ] La integración con IA responde correctamente cuando OpenRouter dispone de cuota; la prueba real quedó bloqueada por HTTP 429.
- [x] El backend no rompe la ejecución ni la API local.

---

## Part 9: IA sobre el estado del tablero

### Checklist
- [x] Enviar al modelo el JSON actual del Kanban y la pregunta del usuario; el historial queda pendiente para la parte 10.
- [x] Definir un esquema estructurado de salida para: respuesta textual y actualización opcional del tablero.
- [x] Validar que la IA puede crear, mover, actualizar y eliminar tarjetas, además de renombrar columnas.
- [x] Añadir control de seguridad para que solo se acepten cambios válidos.
- [x] Probar casos normales y casos no válidos.

### Pruebas
- Consulta simple sin cambios.
- Pedido para crear una tarjeta nueva.
- Pedido para mover una tarjeta a otra columna.
- Pedido con esquema inválido o contenido no permitido.

### Criterios de éxito
- [x] La IA responde con una estructura fiable y útil cuando el proveedor devuelve JSON válido.
- [x] El backend aplica cambios únicamente si la salida es válida.
- [x] La experiencia de usuario refleja de forma consistente los cambios: el sidebar de la parte 10 recarga el tablero tras cada respuesta.

---

## Part 10: Sidebar de chat con IA

### Checklist
- [x] Diseñar un panel lateral para conversaciones con IA (`AIChatSidebar.tsx`).
- [x] Permitir enviar preguntas del usuario y recibir respuestas en la UI.
- [x] Aplicar cambios del tablero cuando la IA devuelve una actualización válida (el backend valida y aplica las acciones).
- [x] Refrescar la vista automáticamente si la IA modifica el board (recarga tras cada respuesta).
- [x] Mejorar la presentación visual con la paleta de colores definida por el proyecto.
- [x] Verificar navegación, accesibilidad mínima y estados de carga (campo con etiqueta, botón deshabilitado y estado "Sending...").

### Pruebas
- [x] Envío de mensaje desde la UI y respuesta visible (test de componente con `fetch` simulado).
- [ ] Actualización del tablero activada por una instrucción de IA: cubierta en backend (`test_ai_board.py`); falta comprobar la recarga en el frontend.
- [ ] Interacción con múltiples mensajes consecutivos.
- [ ] Manejo de errores cuando la IA no devuelve un payload válido: cubierto en backend; falta el test del mensaje de error en el frontend.
- [ ] Prueba real con OpenRouter (bloqueada por `HTTP 429`, ver parte 8).

### Criterios de éxito
- [x] El usuario puede conversar con la IA desde la app.
- [x] La IA puede manipular el board de forma coherente (verificado con respuestas simuladas).
- [x] El panel visual se integra con la experiencia del kanban.

### Estado de verificación (2026-10-05)
- Backend: `python -m pytest -q` (16 tests pasan).
- Frontend: `npm run lint` sin errores; `npm run test:unit` (7 tests pasan); `npm run test:e2e` (4 tests pasan con una base nueva).
- Docker: la imagen se construye con `uv`.

---

## Métrica de cobertura objetivo

Se trata de un objetivo de calidad orientativo: mantener una cobertura razonable alrededor del 80% cuando aporta valor real a la comprobación del comportamiento. No es una obligación artificial ni un requisito para forzar pruebas redundantes.

### Requisitos de calidad
- Ejecutar tests unitarios e integración en cada fase relevante.
- Si una fase añade lógica con comportamiento nuevo, debe añadirse al menos un test que cubra ese flujo.
- Priorizar pruebas con valor funcional real sobre métricas vacías o redundantes.
- Si la cobertura no llega exactamente al 80% por una falta de valor práctico, el criterio aceptable es que el conjunto de pruebas cubra los flujos críticos del MVP con estabilidad.
- El proyecto debe mantener un estado de green en CI/local para las pruebas relevantes.

### Comandos esperados
- Frontend: `npm run test`, `npm run test:unit`, `npm run test:e2e`.
- Backend: el equivalente de pruebas unitarias y de API según la estructura final.

---

## Criterio de cierre del MVP

El proyecto se considerará completo cuando:
- el entorno funcione en Docker y localmente;
- exista login con credenciales dummy;
- el tablero Kanban sea persistente y usable;
- exista backend con SQLite;
- la IA pueda consultar y modificar el board;
- la interfaz incluya chat lateral con actualizaciones automáticas;
- se hayan ejecutado pruebas adecuadas con cobertura mínima del 80%.

La ejecución debe seguir este orden para reducir riesgos y facilitar validación incremental.