import {
  BadRequestException, Inject, Injectable, NotFoundException
} from '@nestjs/common';
import { IDENTITY_REPOSITORY, IdentityRepository } from './identity.repository';
import { normalizarCorreo, Usuario } from '../domain/identity.model';

/** DTOs internos mínimos. No serializar Usuario ni Perfil completos a otros contextos. */
@Injectable()
export class IdentityIntegrationService {
  constructor(@Inject(IDENTITY_REPOSITORY) private readonly repository: IdentityRepository) {}

  async resolverFirebaseUid(uid: string) {
    if (!uid || uid.length > 128 || !uid.trim()) {
      throw new BadRequestException('Firebase UID inválido');
    }
    const usuario = await this.repository.buscarPorFirebaseUid(uid);
    if (!usuario) throw new NotFoundException('Usuario no registrado en LendUp');
    return { usuario_id: usuario.id };
  }

  async consultarElegibilidad(usuarioId: string) {
    const usuario = await this.exigirUsuario(usuarioId);
    const vigente = process.env.TERMS_VERSION || '2026-10-04';
    const terminosVigentes =
      usuario.versionTerminosAceptada === vigente &&
      usuario.versionDescargoAceptada === vigente &&
      usuario.aceptadosEn !== null;
    return {
      estado_verificacion: usuario.estadoVerificacion,
      terminos_generales_vigentes_aceptados: terminosVigentes
    };
  }

  async consultarCorreo(usuarioId: string) {
    const usuario = await this.exigirUsuario(usuarioId);
    return { correo_institucional: normalizarCorreo(usuario.correoInstitucional) };
  }

  async consultarTelefono(usuarioId: string) {
    await this.exigirUsuario(usuarioId);
    const perfil = await this.repository.buscarPerfilPorUsuario(usuarioId);
    if (!perfil) throw new NotFoundException('Perfil no encontrado');
    return { telefono: perfil.telefono };
  }

  private async exigirUsuario(id: string): Promise<Usuario> {
    const usuario = await this.repository.buscarUsuarioPorId(id);
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }
}
