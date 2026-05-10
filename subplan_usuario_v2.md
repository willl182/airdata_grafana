# Subplan usuario V2

## Objetivo

Listar las decisiones, accesos y validaciones que debe hacer el usuario mientras el agente implementa la V2.

## Fase U0: decisiones iniciales

Decidir:

- Si la app sera privada o publica.
- Si se usara dominio/subdominio o solo IP/puerto.
- Si el dominio permitido inicial sera solo `grafana.canair.io`.
- Si el formato de salida principal sera CSV largo, CSV ancho o ambos.
- Si los archivos se conservaran indefinidamente o se borraran despues de cierto tiempo.

Resultado esperado:

```txt
privacidad:
dominio/subdominio:
dominio Grafana permitido:
formato principal:
retencion de archivos:
```

## Fase U1: validar datos

Tareas:

- Descargar manualmente un CSV pequeno desde Grafana Inspect.
- Compararlo con el CSV generado por el script.
- Confirmar si `Series joined by time` sirve para el analisis.
- Confirmar si tambien se necesitan sensores individuales.

Preguntas a responder:

- Las fechas coinciden?
- Las unidades coinciden?
- Los sensores esperados aparecen?
- Hay valores faltantes aceptables?
- Prefieres una tabla larga o una tabla ancha?

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
Docker:
Docker Compose:
RAM:
disco libre:
contenedores actuales:
puerto disponible:
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

Resultado esperado:

```txt
modo de acceso:
puerto:
dominio:
proteccion:
```

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
- Se puede descargar ZIP.
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
rango: 7 dias
chunk: 1 dia
modo: ambos
salidas: json, csv_long, csv_wide, zip
```

Luego subir gradualmente:

```txt
30 dias -> 90 dias -> historico completo
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

- [ ] Confirmar app privada/publica.
- [ ] Confirmar acceso al VPS.
- [ ] Confirmar Docker y Compose.
- [ ] Confirmar puerto o dominio.
- [ ] Confirmar formato CSV preferido.
- [ ] Validar muestra contra Grafana Inspect.
- [ ] Confirmar rango real objetivo.
- [ ] Confirmar politica de retencion.

