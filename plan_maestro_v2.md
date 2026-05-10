# Plan maestro V2: descargador Grafana en nube

## Proposito de esta etapa

Construir una V2 del descargador de Grafana que pueda correr en un VPS con Docker, recibir rangos de fechas desde una webapp, descargar por ventanas pequenas, reanudar trabajos incompletos y entregar resultados principalmente como CSV largo, con CSV ancho opcional y artifacts tecnicos internos.

Esta etapa no busca construir una plataforma compleja. Busca pasar de scripts locales funcionales a una herramienta operable en nube, con estado, progreso y resultados descargables.

## Resultado esperado

Al cierre de esta etapa debe existir:

- Motor de descarga por jobs.
- Division automatica por ventanas temporales.
- Reanudacion de jobs incompletos.
- Exportacion principal en CSV largo.
- Exportacion secundaria en CSV ancho opcional.
- JSON crudo guardado internamente por chunk.
- ZIP tecnico opcional para respaldo/debug.
- Webapp local para crear y monitorear jobs.
- Dockerfile y `docker-compose.yml`.
- Despliegue funcional en el VPS.
- Documentacion de uso y despliegue.

## Arquitectura objetivo

```txt
Webapp
  |
  v
Backend API
  |
  v
Job store
  |
  v
Worker Playwright
  |
  v
data/jobs/<jobId>/
  raw/
  csv/
  manifest.jsonl
  logs.txt
  result.zip opcional
```

## Decision de infraestructura

La ruta recomendada para esta etapa es:

```txt
VPS Hostinger + Docker Compose + volumen persistente
```

No usar como base inicial:

- Vercel para el worker.
- Convex para el estado de jobs.
- Supabase como dependencia obligatoria.

Posibles usos posteriores:

- Supabase Storage para almacenar resultados.
- Supabase Auth para login.
- Vercel para alojar solo el frontend.
- Convex para estado en tiempo real si la app crece.

## Principios de ejecucion

- Primero estabilizar el motor, despues construir UI.
- Todo job debe poder reanudarse.
- Nunca depender de una unica consulta grande.
- Guardar siempre JSON crudo.
- Generar CSV largo como formato canonico y principal para analisis en R.
- Generar CSV ancho como salida conveniente para Excel.
- En la primera version, limitar jobs a maximo 10 dias y chunks de 1 dia.
- Mantener Docker simple antes de agregar servicios externos.

## Camino critico

```txt
1. Motor por job
2. Chunks reanudables
3. CSV largo principal y CSV ancho opcional
4. Webapp local
5. Docker local
6. VPS
7. Robustez
```

Las fases 1 a 6 son secuenciales en el camino critico. Hay tareas de preparacion que el usuario puede ejecutar en paralelo, descritas en `subplan_usuario_v2.md`.

## Fases

### Fase 0: alinear decisiones

Objetivo: dejar cerradas las decisiones que bloquean el diseno.

Entradas:

- Dashboard objetivo.
- Panel objetivo.
- VPS disponible.
- Decision de privacidad/acceso.

Salidas:

- Dominio o puerto decidido.
- Dominio Grafana permitido.
- Estrategia inicial de almacenamiento.
- Confirmacion de Docker en VPS.

Responsables:

- Usuario: accesos, dominio, VPS.
- Agente: checklist y documentacion.

### Fase 1: motor V2 local

Objetivo: convertir los scripts actuales en funciones reutilizables por CLI, API y worker.

Salidas:

- `src/grafana/`
- ejecucion por `job.json`
- compatibilidad con comandos actuales
- prueba local de 7 dias

Bloquea:

- Fase 2
- Fase 3

### Fase 2: jobs reanudables

Objetivo: manejar trabajos grandes por chunks con estado persistente.

Salidas:

- `job.json`
- `chunks.jsonl`
- `manifest.jsonl`
- logs por job
- reintentos
- reanudacion
- limite inicial de 10 dias por job

Bloquea:

- Webapp util
- Despliegue serio al VPS

### Fase 3: webapp local

Objetivo: crear interfaz para lanzar, monitorear y descargar jobs.

Salidas:

- formulario de nuevo job
- lista de jobs
- detalle de progreso
- descarga de artifacts
- descarga directa del CSV largo final
- descarga opcional del CSV ancho final
- vista de logs

Bloquea:

- Docker final
- validacion de experiencia de usuario

### Fase 4: Docker local

Objetivo: empaquetar la app para que corra igual en local y VPS.

Salidas:

- Dockerfile
- `docker-compose.yml`
- `.env.example`
- volumen `data/`
- prueba de Playwright dentro del contenedor

Bloquea:

- despliegue VPS

### Fase 5: despliegue VPS

Objetivo: dejar la V2 funcionando en Hostinger.

Salidas:

- app accesible desde navegador
- worker corriendo
- volumen persistente
- job de 1 hora exitoso
- job de 7 dias exitoso

### Fase 6: robustez

Objetivo: mejorar operacion para datasets grandes.

Salidas posibles:

- cancelar jobs
- retry manual desde UI
- selector de sensores
- modo agregado / individual / ambos
- dedupe configurable
- backups
- retencion de archivos
- storage externo opcional

## Paralelizacion

### En serie

- Motor antes de webapp.
- Jobs reanudables antes de descargas largas.
- Docker antes de VPS.
- VPS estable antes de backups automatizados.

### En paralelo

- Usuario prepara VPS mientras el agente refactoriza el motor.
- Usuario define dominio/acceso mientras el agente implementa jobs.
- Usuario valida formato CSV mientras el agente prepara Docker.
- Usuario revisa convivencia con OpenClaw mientras el agente documenta despliegue.

## Documentos relacionados

- `plan_v2.md`: referencia tecnica extensa.
- `subplan_agente_v2.md`: tareas ejecutables por agente.
- `subplan_usuario_v2.md`: tareas que debe hacer o decidir el usuario.
