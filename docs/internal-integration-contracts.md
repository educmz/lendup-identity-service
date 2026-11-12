# Contratos HTTP internos de Identidad (LendUp)

Esta API es **servicio a servicio**; nunca añadir `/internal/**` al API Gateway público. Desplegar Identidad en una red privada, con TLS entre servicios y credenciales inyectadas mediante gestor de secretos.

## Autenticación y permisos

Cada servicio consumidor configura `IDENTITY_SERVICE_BASE_URL`, `IDENTITY_SERVICE_TOKEN` y la plantilla de URI. En Identidad, el valor correspondiente debe existir en:

- `IDENTITY_RESERVATIONS_SERVICE_TOKEN` para Reservas: resolución UID, elegibilidad y teléfono.
- `IDENTITY_PAYMENTS_SERVICE_TOKEN` para Pagos: resolución UID.
- `IDENTITY_NOTIFICATIONS_SERVICE_TOKEN` para Notificaciones: resolución UID y correo.

Usar **tres valores diferentes, aleatorios, de al menos 32 caracteres**. Se envían como `Authorization: Bearer <TOKEN_DE_SERVICIO>`. No usar un Firebase ID token como credencial de servicio. Un valor ausente, débil o compartido se rechaza. Nunca colocar tokens en GitHub, URL, logs ni frontend.

El guard devuelve **401** para credenciales ausentes/invalidas y **403** para una credencial válida sin permiso de esa operación. Las rutas internas devuelven **404** si el UUID/UID no existe y **400** si el UUID tiene un formato inválido. No se exponen correos ni teléfonos en las rutas públicas de otros usuarios.

## Contratos de respuesta

Todos los ejemplos de UUID son ilustrativos.

| Consumidor | GET interno | Respuesta mínima |
| --- | --- | --- |
| Reservas, Pagos, Notificaciones | `/internal/v1/identidad/firebase/{uid}` | `{"usuario_id":"11111111-1111-4111-8111-111111111111"}` |
| Reservas | `/internal/v1/identidad/usuarios/{usuario_id}/elegibilidad` | `{"estado_verificacion":"VERIFICADO","terminos_generales_vigentes_aceptados":true}` |
| Notificaciones | `/internal/v1/identidad/usuarios/{usuario_id}/correo` | `{"correo_institucional":"estudiante@upc.edu.pe"}` |
| Reservas | `/internal/v1/identidad/usuarios/{usuario_id}/contacto?reserva_id={reserva_id}` | `{"telefono":"999888777"}` |

El UUID en las rutas internas es **el de la tabla `usuarios.id`**, no el Firebase UID. El UID se resuelve exclusivamente con credencial de servicio. No se exige una migración nueva: `usuarios` y `perfiles` ya contienen todos esos campos.

### Semántica de elegibilidad

`estado_verificacion` es el estado almacenado de la verificación de **correo institucional** de LendUp; el servicio **no certifica matrícula universitaria vigente**. Solo sale `VERIFICADO` cuando el estado persistido lo indica. No se autoaprueba a nadie en la consulta interna.

`terminos_generales_vigentes_aceptados` es true únicamente si ambas versiones aceptadas (`version_terminos_aceptada` y `version_descargo_aceptada`) coinciden con `TERMS_VERSION` **y** existe `aceptados_en`. Una nueva versión invalida la elegibilidad hasta la nueva aceptación. El estado se actualiza desde Firebase en `GET /api/v1/estudiantes/me` cuando el propio usuario presenta su ID token verificado; no se consulta Firebase desde el endpoint interno.

### Responsabilidad del contacto

`contacto` admite únicamente el token de Reservas y requiere un `reserva_id` UUID válido. **La autorización contextual corresponde a Reservas**, que debe verificar participación del solicitante, estado de reserva y `contacto_vigente` mediante Préstamos *antes* de consultar Identidad. Identidad no conoce reservas ni puede verificar por sí sola su vigencia; un token de Reservas comprometido permitiría consultar contactos. Aislar y rotar este token, limitar acceso por red y auditar las consultas desde Reservas.

## Variables requeridas en cada equipo

### Reservas

```dotenv
IDENTITY_SERVICE_BASE_URL=https://identity.internal.example
IDENTITY_SERVICE_TOKEN=<TOKEN_RESERVAS>
IDENTITY_FIREBASE_USER_URI_TEMPLATE=/internal/v1/identidad/firebase/{uid}
IDENTITY_ELIGIBILITY_URI_TEMPLATE=/internal/v1/identidad/usuarios/{usuario_id}/elegibilidad
IDENTITY_AUTHORIZED_CONTACT_URI_TEMPLATE=/internal/v1/identidad/usuarios/{usuario_id}/contacto?reserva_id={reserva_id}
```

### Pagos

```dotenv
IDENTITY_SERVICE_BASE_URL=https://identity.internal.example
IDENTITY_SERVICE_TOKEN=<TOKEN_PAGOS>
IDENTITY_FIREBASE_USER_URI_TEMPLATE=/internal/v1/identidad/firebase/{uid}
```

### Notificaciones

```dotenv
IDENTITY_SERVICE_BASE_URL=https://identity.internal.example
IDENTITY_SERVICE_TOKEN=<TOKEN_NOTIFICACIONES>
IDENTITY_FIREBASE_USER_URI_TEMPLATE=/internal/v1/identidad/firebase/{uid}
IDENTITY_USER_EMAIL_URI_TEMPLATE=/internal/v1/identidad/usuarios/{usuario_id}/correo
```

En desarrollo, utilizar la URL interna local correspondiente al puerto expuesto (por ejemplo, `http://host.docker.internal:8085`) y mantener el Gateway sin ruta `/internal/**`. En AWS utilizar HTTPS interno y servicios autorizados únicamente.

## Pruebas mínimas de integración

1. Sin Bearer o con un Firebase ID token en `/internal/**` → 401.
2. Token de Pagos consultando correo o teléfono → 403.
3. UID registrado → `usuario_id` UUID correcto; UID inexistente → 404.
4. Elegibilidad antes/después de aceptar `TERMS_VERSION`, con usuario verificado/no verificado.
5. Notificaciones obtiene el correo correcto por UUID con su token; otro token recibe 403.
6. Reservas consulta teléfono solo *después* de comprobar participantes y vigencia en su servicio. Peticiones con `reserva_id` ausente/no UUID → 400; usuario sin perfil → 404.
7. Despliegue real: comprobar que `/internal/**` no es accesible desde internet ni a través del API Gateway.

### Pendientes de otros equipos

- **Reservas:** configurar las tres plantillas y token, manejar 404 de UID como usuario ausente (no como caída del servicio) y mantener su verificación de autorización contextual para contacto.
- **Pagos:** configurar token propio y resolver UID por el contrato interno.
- **Notificaciones:** configurar token propio y plantilla de correo; activar SendGrid con remitente verificado si se quiere envío real.
- **DevOps:** secretos separados, HTTPS privado y bloqueo explícito de `/internal/**` en el ingreso público.
