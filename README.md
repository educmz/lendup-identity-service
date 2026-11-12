# lendup-identity-service

Microservicio de **Identidad** de LendUp, implementado con **TypeScript, NestJS, Node.js 22 o superior, MySQL y Firebase Admin SDK**.

## Estado y alcance

Las entregas desplegables se toman de `main` (el desarrollo cotidiano ocurre en `develop`). Este servicio conserva los endpoints de estudiantes del monolito para la integración progresiva con Catálogo. Firebase Authentication maneja credenciales e inicio de sesión; Identidad guarda únicamente el UUID interno, perfil, rol, universidad y aceptaciones.

La comprobación de un dominio institucional y del correo Firebase **no equivale a una validación de matrícula vigente**. Ninguna ruta permite que el cliente seleccione arbitrariamente su rol o su UUID de propietario.

## Preparación local (Windows PowerShell)

Requisitos: Node.js 22 o superior, npm y Docker Desktop.

```powershell
git switch main
git pull origin main
Copy-Item .env.example .env
```

Editar `.env` y establecer dos contraseñas locales distintas para `DB_PASSWORD` y `MYSQL_ROOT_PASSWORD`. No subir el archivo. El puerto MySQL es **3309**, independiente del puerto 3308 de Catálogo.

```powershell
docker compose up -d mysql
docker compose ps
npm ci
npm run db:migrate
```

Configurar el proyecto Firebase y la ruta local a un archivo válido de credenciales Firebase Admin. Cada instalación debe proporcionar su propia configuración fuera del repositorio:

```powershell
$env:FIREBASE_PROJECT_ID = "<id-del-proyecto-firebase>"
$env:GOOGLE_APPLICATION_CREDENTIALS = "<ruta-absoluta-al-json-de-servicio>"
npm run start:dev
```

La aplicación escucha en `http://localhost:8081`. Documentación Swagger: `http://localhost:8081/docs`. Comprobación pública: `GET /health`. Para las rutas protegidas se requiere un **Firebase ID token auténtico**. No hay tokens de prueba precargados ni autenticación falsa por cabeceras.

```powershell
npm run build
npm test
```

## Contratos

- `POST /api/v1/estudiantes`: registra el usuario a partir del Firebase UID verificado y un correo institucional reconocido.
- `GET /api/v1/estudiantes/me`: retorna `{ "usuario": { "id": "UUID", ... }, "perfil": { ... } }`, tal como espera Catálogo.
- `PUT /api/v1/estudiantes/me`: edita únicamente los campos permitidos del perfil.
- `POST /api/v1/estudiantes/me/verificacion`: registra una solicitud de verificación, **sin autoaprobar matrícula**.
- `POST /api/v1/estudiantes/me/aceptacion-terminos`: registra las versiones vigentes aceptadas.
- `GET /api/v1/estudiantes/:id`: vista limitada del perfil autenticado.
- `GET /api/v1/universidades`: catálogo público con dominios autorizados.
- `GET /api/v1/documentos/terminos`: documento vigente para su aceptación.

La escritura de perfiles y la asignación de rol ESTUDIANTE no confieren privilegios de administrador.

## Seguridad e integración

- [Contrato de integración con el API Gateway (rutas, prioridad, puertos y smoke tests)](docs/api-gateway-integration.md)

Las solicitudes de Identidad utilizan Firebase Admin para validar el token Bearer, incluida su revocación. Catálogo vuelve a validar el mismo token y llama a `GET /api/v1/estudiantes/me` para resolver el UUID. Para la integración local, establecer en Catálogo `IDENTITY_BASE_URL=http://localhost:8081`.

Las tablas `roles`, `usuarios`, `perfiles`, `universidades` y `dominios_universidad` pertenecen exclusivamente a Identidad. No hay acceso directo a tablas de Catálogo. La primera migración SQL es idempotente y crea un registro `schema_migrations`.

No usar `docker compose down -v` cuando deban conservarse perfiles locales. No subir tokens, `.env` ni archivos JSON de cuentas de servicio.

## Estado de pruebas

Las pruebas automatizadas se ejecutan con `npm test` y se verifican en CI. La autenticación extremo a extremo requiere el proyecto Firebase y la base de datos del entorno local.

## Preparación para AWS (Docker)

La imagen de producción usa Node 22, ejecuta `node dist/main.js`, escucha en el puerto 8081 e incluye `docs/terminos-lendup.txt`, `scripts/migrate.cjs` y las migraciones SQL. Los secretos y archivos privados de Firebase **no** se empaquetan.

```bash
docker build -t lendup-identity-service:local .
```

Consulta [la guía de entrega para AWS](docs/aws-deployment-handoff.md). Antes de arrancar el servicio, se debe crear la base y ejecutar `node scripts/migrate.cjs` con las variables de conexión. `GET /health` es una comprobación de proceso; validar `GET /api/v1/universidades` para comprobar consultas reales a MySQL.

## Contratos internos para Reservas, Pagos y Notificaciones

Se agregaron cuatro consultas privadas bajo `/internal/v1/identidad/**` para resolver Firebase UID, consultar elegibilidad y términos, obtener correo y consultar teléfono. Cada consumidor tiene un **token de servicio distinto** con permisos mínimos; todas las rutas de estudiantes siguen exigiendo Firebase y mantienen su contrato anterior.

Para activar las rutas internas configurar en Identidad `IDENTITY_RESERVATIONS_SERVICE_TOKEN`, `IDENTITY_PAYMENTS_SERVICE_TOKEN` y `IDENTITY_NOTIFICATIONS_SERVICE_TOKEN` con secretos aleatorios diferentes (mínimo 32 caracteres). El endpoint de contacto delega la autorización contextual (reserva/participante/vigencia) al servicio de Reservas, que debe comprobarla antes de llamar.

Consulta **[los contratos completos, variables de integración y pruebas de seguridad](docs/internal-integration-contracts.md)**. Estas rutas no deben publicarse en el Gateway ni usarse desde el navegador. Ningún cambio de esquema MySQL es necesario.
