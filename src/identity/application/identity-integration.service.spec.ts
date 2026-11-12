import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdentityIntegrationService } from './identity-integration.service';
import { IdentityRepository } from './identity.repository';
import { Usuario, Perfil } from '../domain/identity.model';

const usuario: Usuario = {
  id: '11111111-1111-4111-8111-111111111111',
  firebaseUid: 'firebase-valid-uid',
  correoInstitucional: 'Estudiante@UPC.EDU.PE',
  rol: 'ESTUDIANTE',
  estadoVerificacion: 'VERIFICADO',
  verificadoEn: new Date('2026-11-01T10:00:00Z'),
  versionTerminosAceptada: '2026-10-04',
  versionDescargoAceptada: '2026-10-04',
  aceptadosEn: new Date('2026-11-01T10:00:00Z')
};
const perfil: Perfil = {
  id: '22222222-2222-4222-8222-222222222222',
  usuarioId: usuario.id,
  nombre: 'Estudiante',
  universidad: 'UPC',
  campus: 'Monterrico',
  carrera: 'Ingeniería',
  ciclo: 5,
  telefono: '999888777',
  fotoUrl: null
};

function setup() {
  const repository = {
    buscarPorFirebaseUid: jest.fn().mockResolvedValue(usuario),
    buscarUsuarioPorId: jest.fn().mockResolvedValue(usuario),
    buscarPerfilPorUsuario: jest.fn().mockResolvedValue(perfil)
  } as unknown as jest.Mocked<IdentityRepository>;
  return { repository, service: new IdentityIntegrationService(repository) };
}

describe('IdentityIntegrationService', () => {
  const previousVersion = process.env.TERMS_VERSION;
  beforeEach(() => { process.env.TERMS_VERSION = '2026-10-04'; });
  afterAll(() => {
    if (previousVersion === undefined) delete process.env.TERMS_VERSION;
    else process.env.TERMS_VERSION = previousVersion;
  });

  it('resuelve Firebase UID únicamente al UUID interno', async () => {
    const { service } = setup();
    await expect(service.resolverFirebaseUid(usuario.firebaseUid)).resolves.toEqual({ usuario_id: usuario.id });
  });

  it('no permite UID vacío y no inventa usuarios', async () => {
    const { repository, service } = setup();
    await expect(service.resolverFirebaseUid('')).rejects.toBeInstanceOf(BadRequestException);
    repository.buscarPorFirebaseUid.mockResolvedValue(null);
    await expect(service.resolverFirebaseUid('unknown')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calcula elegibilidad usando ambas versiones vigentes y su aceptación', async () => {
    const { service } = setup();
    await expect(service.consultarElegibilidad(usuario.id)).resolves.toEqual({
      estado_verificacion: 'VERIFICADO',
      terminos_generales_vigentes_aceptados: true
    });
  });

  it('rechaza versiones vencidas, aceptación incompleta o inexistente', async () => {
    const { repository, service } = setup();
    repository.buscarUsuarioPorId.mockResolvedValue({ ...usuario, versionDescargoAceptada: '2025-01-01' });
    expect((await service.consultarElegibilidad(usuario.id)).terminos_generales_vigentes_aceptados).toBe(false);
    repository.buscarUsuarioPorId.mockResolvedValue({ ...usuario, aceptadosEn: null });
    expect((await service.consultarElegibilidad(usuario.id)).terminos_generales_vigentes_aceptados).toBe(false);
    process.env.TERMS_VERSION = '2026-11-12';
    repository.buscarUsuarioPorId.mockResolvedValue(usuario);
    expect((await service.consultarElegibilidad(usuario.id)).terminos_generales_vigentes_aceptados).toBe(false);
  });

  it('no convierte un usuario no verificado en verificado', async () => {
    const { repository, service } = setup();
    repository.buscarUsuarioPorId.mockResolvedValue({ ...usuario, estadoVerificacion: 'PENDIENTE' });
    expect((await service.consultarElegibilidad(usuario.id)).estado_verificacion).toBe('PENDIENTE');
  });

  it('entrega solo el correo normalizado a Notificaciones', async () => {
    const { service } = setup();
    await expect(service.consultarCorreo(usuario.id)).resolves.toEqual({ correo_institucional: 'estudiante@upc.edu.pe' });
  });

  it('entrega únicamente el teléfono guardado y nunca el perfil completo', async () => {
    const { service } = setup();
    await expect(service.consultarTelefono(usuario.id)).resolves.toEqual({ telefono: '999888777' });
  });

  it('rechaza usuarios o perfiles inexistentes', async () => {
    const { repository, service } = setup();
    repository.buscarUsuarioPorId.mockResolvedValue(null);
    await expect(service.consultarCorreo(usuario.id)).rejects.toBeInstanceOf(NotFoundException);
    repository.buscarUsuarioPorId.mockResolvedValue(usuario);
    repository.buscarPerfilPorUsuario.mockResolvedValue(null);
    await expect(service.consultarTelefono(usuario.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
