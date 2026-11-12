# Handoff de Identidad para despliegue en AWS

Esta guía describe los requisitos del contenedor; no crea recursos AWS ni publica credenciales.

## Artefacto
- Construir desde `main`: `docker build -t lendup-identity-service:<git-sha> .`.
- Imagen Node.js 22 con build NestJS y dependencias de runtime.
- Puerto del contenedor: `8081`. Comando: `node dist/main.js`.
- `/health` es **liveness** (no verifica MySQL). Usar además `GET /api/v1/universidades` como smoke test de DB.
- La imagen incluye `docs/terminos-lendup.txt`, `scripts/migrate.cjs` y `db/migrations`; no incluye `.env` ni credenciales.

## Variables de ejecución (ECS task definition o EC2)
| Variable | Configuración |
| --- | --- |
| `PORT` | `8081` |
| `NODE_ENV` | `production` |
| `DB_HOST`, `DB_PORT` | Host RDS privado y puerto `3306` |
| `DB_NAME` | `lendup_identidad` |
| `DB_USERNAME`, `DB_PASSWORD` | Usuario/contraseña propios; inyectar contraseña desde secreto |
| `FIREBASE_PROJECT_ID` | **Exactamente el mismo proyecto que Catálogo** |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta real a JSON de servicio montado de forma privada en el contenedor |
| `CORS_ORIGINS` | URL(s) HTTPS exacta(s) del frontend, separadas por coma |
| `TERMS_VERSION` | `2026-10-04`, mientras ese documento sea el vigente |
| `OPENAPI_ENABLED` | `false` si Swagger no será público |

**Importante:** Secrets Manager puede inyectar secretos como variables de entorno en ECS, pero `GOOGLE_APPLICATION_CREDENTIALS` requiere **una ruta a archivo**, no una variable cuyo valor sea el JSON. Usar un montaje privado de solo lectura o una solución equivalente aprobada por el responsable de infraestructura; nunca copiar credenciales en Dockerfile o Git.

## Orden de puesta en marcha
1. Crear la base `lendup_identidad` y usuario MySQL con permisos mínimos en un RDS accesible sólo desde la red privada del servicio.
2. Ejecutar una sola vez `node scripts/migrate.cjs` en un job/tarea con acceso a MySQL, credenciales y el mismo contenido versionado de la imagen.
3. Configurar Firebase Admin y los secretos del entorno.
4. Desplegar la imagen en ECS o EC2 y configurar el balanceador/HTTPS. No exponer directamente MySQL.
5. Verificar `GET /health`, `GET /api/v1/universidades`, `GET /api/v1/documentos/terminos` y el flujo autenticado registro -> `GET /api/v1/estudiantes/me` con token Firebase real.

## Integración con el API Gateway

- El Gateway debe configurar `IDENTITY_SERVICE_URL` con la dirección privada de Identidad. Nunca agregar `/api/v1` al final de la URL base.
- Enrutar estudiantes, universidades y términos sin reescribir rutas; conservar prioridad de Reputación para `/api/v1/estudiantes/{id}/reputacion`.
- El frontend utiliza el Gateway y no el puerto interno de Identidad. CORS de la API de Identidad no sustituye al CORS público del Gateway.
- [Contrato y pruebas de integración del Gateway](api-gateway-integration.md).

## Integración con Catálogo
- Catálogo llama a `GET /api/v1/estudiantes/me` y reenvía el mismo Bearer Firebase.
- Se debe suministrar a Catálogo `IDENTITY_BASE_URL=https://<dominio-real-de-identidad>/` con certificado válido.
- No incluir `/api/v1` en la base URL: Catálogo la agrega automáticamente.
- No se comparten tablas: cada microservicio gestiona sus propias migraciones y credenciales.

La prueba de CI verifica build/test; la prueba real con Firebase/RDS/HTTPS se realiza después del despliegue. No hay certificación de disponibilidad ni de seguridad operacional hasta completarla.

## API interna servicio a servicio

Configurar tres tokens de servicio distintos mediante Secrets Manager: `IDENTITY_RESERVATIONS_SERVICE_TOKEN`, `IDENTITY_PAYMENTS_SERVICE_TOKEN` y `IDENTITY_NOTIFICATIONS_SERVICE_TOKEN` (mínimo 32 caracteres aleatorios cada uno). Los secretos nunca deben viajar por la URL ni registrarse. No exponer `/internal/v1/identidad/**` en el API Gateway, balanceador público ni en la red externa. Usar TLS privado, Security Groups y rotación de tokens coordinada con cada consumidor.

Reservas, Pagos y Notificaciones usan cada uno su `IDENTITY_SERVICE_TOKEN` correspondiente y rutas definidas en [contratos internos](internal-integration-contracts.md). El acceso a teléfono depende de la validación contextual de Reservas (participación y vigencia del préstamo); Identidad verifica la identidad del servicio llamante, no la operación de negocio de Reservas.
