import {
  Controller, Get, Param, ParseUUIDPipe, Query, UseGuards
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IdentityIntegrationService } from '../../application/identity-integration.service';
import { AllowInternalServices, InternalServiceGuard } from '../../infrastructure/security/internal-service.guard';

/**
 * Private service-to-service API: never expose /internal/** on the public Gateway.
 * Reservations is responsible for validating participant and active-loan access
 * before calling /contacto; Identity authenticates only the trusted caller.
 */
@ApiExcludeController()
@UseGuards(InternalServiceGuard)
@Controller('internal/v1/identidad')
export class InternalIdentityController {
  constructor(private readonly integration: IdentityIntegrationService) {}

  @Get('firebase/:uid')
  @AllowInternalServices('reservations', 'payments', 'notifications')
  resolverUsuario(@Param('uid') uid: string) {
    return this.integration.resolverFirebaseUid(uid);
  }

  @Get('usuarios/:usuarioId/elegibilidad')
  @AllowInternalServices('reservations')
  elegibilidad(@Param('usuarioId', new ParseUUIDPipe()) usuarioId: string) {
    return this.integration.consultarElegibilidad(usuarioId);
  }

  @Get('usuarios/:usuarioId/correo')
  @AllowInternalServices('notifications')
  correo(@Param('usuarioId', new ParseUUIDPipe()) usuarioId: string) {
    return this.integration.consultarCorreo(usuarioId);
  }

  @Get('usuarios/:usuarioId/contacto')
  @AllowInternalServices('reservations')
  contacto(
    @Param('usuarioId', new ParseUUIDPipe()) usuarioId: string,
    @Query('reserva_id', new ParseUUIDPipe()) _reservaId: string
  ) {
    // The mandatory reservation UUID binds the request to a contextual lookup.
    // Authorization of the reservation and its actors is enforced in Reservations.
    return this.integration.consultarTelefono(usuarioId);
  }
}
