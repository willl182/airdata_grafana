# Subplan usuario V2

## Objetivo

Listar las decisiones, accesos y validaciones que debe hacer el usuario mientras el agente implementa la V2.

Estado actual: el motor local ya fue migrado a TypeScript y conserva los comandos publicos. La siguiente validacion relevante para el usuario es el formato final de outputs por job: CSV largo principal, CSV ancho opcional y artifacts tecnicos.

## Fase U0: decisiones iniciales

Decidir:

- Si la app sera privada o publica.
- Si se usara dominio/subdominio o solo IP/puerto.
- Si el dominio permitido inicial sera solo `grafana.canair.io`.
- Si el formato de salida principal sera CSV largo, CSV ancho o ambos.
- Si los archivos se conservaran indefinidamente o se borraran despues de cierto tiempo.

Resultado esperado:

```txt
privacidad: publico
dominio/subdominio: inicialmente IP:puerto, luego subdominio
dominio Grafana permitido: solo grafana.canair.io
formato principal: CSV largo
formato secundario: CSV ancho opcional
retencion de archivos: guardar por ahora, borrar manualmente despues
```

## Fase U1: validar datos

Tareas:

- Descargar manualmente un CSV pequeno desde Grafana Inspect.
- Compararlo con el CSV generado por el script.
- Confirmar si `Series joined by time` sirve para el analisis.
- Confirmar si tambien se necesitan sensores individuales.
- Confirmar que el CSV largo es el formato principal para analisis en R.

Preguntas a responder:

- Las fechas coinciden?
- Las unidades coinciden?
- Los sensores esperados aparecen?
- Hay valores faltantes aceptables?
- Prefieres una tabla larga o una tabla ancha?

Decision tomada:

- El CSV largo sera la salida principal porque facilita procesamiento en R.
- El CSV ancho queda como salida opcional para revision rapida o Excel.

Siguiente validacion:

- Revisar un CSV largo final generado desde un job completo, no solo CSVs intermedios por chunk.
- Confirmar si la clave de dedupe propuesta elimina duplicados sin perder mediciones validas.
- Confirmar columnas minimas esperadas para R: tiempo, sensor, valor, unidad si existe, ref_id, frame_index, chunk/source.

## Fase U2: preparar VPS

Tareas:

- Confirmar acceso SSH al VPS de Hostinger.
- Confirmar si Docker esta instalado.
- Confirmar si Docker Compose esta instalado.
- Revisar RAM, CPU y disco disponible.
- Revisar contenedor actual de OpenClaw.
- Confirmar si puede correr otro contenedor.

Comandos utiles en el VPS:

```bash
docker --version
docker compose version
docker ps
df -h
free -h
```

Resultado esperado:

```txt
Docker: Docker version 29.4.1, build 055a478
Docker Compose: Docker Compose version v5.1.3
RAM: 7.8 GiB total, 6.6 GiB disponible
disco libre: 73 GB libres en /
contenedores actuales: openclaw-hacw-openclaw-1, puerto 127.0.0.1:57086->57086/tcp
puerto disponible: pendiente definir; candidatos 3001 o 8081
```

## Fase U3: red, dominio y acceso

Tareas:

- Definir puerto de la app.
- Definir si habra reverse proxy.
- Definir dominio o subdominio.
- Apuntar DNS si aplica.
- Definir proteccion de acceso: basic auth, VPN, firewall o login simple.

Opciones:

- Solo IP y puerto: mas rapido para prueba.
- Subdominio con proxy: mejor para uso continuo.
- Acceso privado por firewall/VPN: mas seguro.
- Tailscale: recomendado para la primera version, porque permite probar la app en red privada sin exponerla publicamente ni configurar dominio/HTTPS desde el inicio.

Resultado esperado:

```txt
modo de acceso: Tailscale para pruebas iniciales
puerto: 3001
dominio: no por ahora; opcional despues con subdominio y HTTPS
proteccion: acceso privado por Tailscale
```

Decision operativa:

- La V2 se probara primero en el VPS escuchando en el puerto `3001`.
- El acceso inicial sera por la IP privada de Tailscale del VPS.
- No se abrira el servicio como publico en internet durante la prueba inicial.
- El dominio/subdominio queda para una fase posterior, cuando la app ya este validada.

## Fase U4: despliegue

Tareas:

- Dar acceso SSH al agente o ejecutar comandos indicados.
- Crear carpeta del proyecto en el VPS.
- Configurar `.env`.
- Levantar contenedores.
- Probar acceso desde navegador.

Validaciones:

- La webapp abre.
- Se puede crear un job de 1 hora.
- El job termina.
- Se puede descargar el CSV largo final.
- Se puede descargar el CSV ancho opcional si fue generado.
- Se puede descargar ZIP tecnico si se habilita.
- Los archivos persisten despues de reiniciar contenedor.

## Fase U5: prueba real

Tareas:

- Elegir un rango real de datos.
- Elegir tamano de ventana inicial.
- Lanzar descarga.
- Revisar progreso.
- Revisar CSV final.
- Confirmar si hay chunks fallidos.

Recomendacion inicial:

```txt
rango: maximo 10 dias por job en la primera version
chunk: 1 dia
modo: todos los sensores disponibles en formato largo
salidas: csv_long principal, csv_wide opcional, json interno, zip tecnico opcional
```

Luego subir gradualmente:

```txt
10 dias estables -> evaluar si ampliar limite
```

## Fase U6: politicas operativas

Decidir:

- Cuantos jobs simultaneos permitir.
- Cuanto tiempo guardar resultados.
- Si se hacen backups.
- Si se suben resultados a Supabase/S3/R2.
- Quien puede acceder a la app.
- Que hacer con chunks fallidos.

Resultado esperado:

```txt
jobs simultaneos:
retencion:
backup:
storage externo:
usuarios:
politica ante fallos:
```

## Checklist rapido del usuario

- [x] Confirmar app privada/publica.
- [x] Confirmar acceso al VPS.
- [x] Confirmar Docker y Compose.
- [x] Confirmar puerto o dominio.
- [x] Confirmar formato CSV preferido.
- [x] Validar muestra contra Grafana Inspect.
- [x] Confirmar rango real objetivo.
- [ ] Validar CSV largo final por job.
- [ ] Validar CSV ancho opcional por job.
- [ ] Confirmar clave de dedupe.
- [ ] Confirmar politica de retencion.
