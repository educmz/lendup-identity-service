import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { InternalIdentityController } from './internal-identity.controller';
import { INTERNAL_SERVICES_KEY, InternalServiceGuard } from '../../infrastructure/security/internal-service.guard';

describe('Contrato interno de Identidad', () => {
  const route = (method: keyof InternalIdentityController) => {
    const handler = InternalIdentityController.prototype[method] as object;
    return {
      path: Reflect.getMetadata(PATH_METADATA, handler),
      verb: Reflect.getMetadata(METHOD_METADATA, handler),
      callers: Reflect.getMetadata(INTERNAL_SERVICES_KEY, handler)
    };
  };

  it('expone rutas internas distintas de las públicas con permisos mínimos', () => {
    expect(Reflect.getMetadata(PATH_METADATA, InternalIdentityController)).toBe('internal/v1/identidad');
    expect(Reflect.getMetadata(GUARDS_METADATA, InternalIdentityController)).toContain(InternalServiceGuard);
    expect(route('resolverUsuario')).toEqual({
      path: 'firebase/:uid', verb: RequestMethod.GET,
      callers: ['reservations', 'payments', 'notifications']
    });
    expect(route('elegibilidad')).toEqual({
      path: 'usuarios/:usuarioId/elegibilidad', verb: RequestMethod.GET, callers: ['reservations']
    });
    expect(route('correo')).toEqual({
      path: 'usuarios/:usuarioId/correo', verb: RequestMethod.GET, callers: ['notifications']
    });
    expect(route('contacto')).toEqual({
      path: 'usuarios/:usuarioId/contacto', verb: RequestMethod.GET, callers: ['reservations']
    });
  });
});
