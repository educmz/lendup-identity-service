import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';

export type InternalService = 'reservations' | 'payments' | 'notifications';
export const INTERNAL_SERVICES_KEY = 'identity:allowed-internal-services';
export const AllowInternalServices = (...services: InternalService[]) =>
  SetMetadata(INTERNAL_SERVICES_KEY, services);

const credentials: ReadonlyArray<readonly [InternalService, string]> = [
  ['reservations', 'IDENTITY_RESERVATIONS_SERVICE_TOKEN'],
  ['payments', 'IDENTITY_PAYMENTS_SERVICE_TOKEN'],
  ['notifications', 'IDENTITY_NOTIFICATIONS_SERVICE_TOKEN']
];

function equalSecret(actual: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

/**
 * Internal REST routes never trust user-supplied IDs or Firebase tokens as service identity.
 * Each backend has a different, high-entropy bearer token, injected at runtime as a secret.
 * An absent/short credential is always rejected; no development bypass is provided.
 */
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<InternalService[]>(
      INTERNAL_SERVICES_KEY, [context.getHandler(), context.getClass()]
    );
    if (!allowed?.length) throw new ForbiddenException('Ruta interna sin permisos definidos');

    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    const header = request.headers.authorization;
    if (!header || !/^Bearer\s+\S+$/i.test(header)) {
      throw new UnauthorizedException('Se requiere credencial de servicio');
    }
    const token = header.replace(/^Bearer\s+/i, '');
    const matching = credentials
      .filter(([, variable]) => {
        const secret = process.env[variable];
        return !!secret && secret.length >= 32 && equalSecret(token, secret);
      })
      .map(([service]) => service);

    // Duplicate credentials across services would silently combine permissions: reject them.
    if (matching.length !== 1) {
      throw new UnauthorizedException('Credencial de servicio inválida');
    }
    if (!allowed.includes(matching[0])) {
      throw new ForbiddenException('El servicio no tiene permiso para esta operación');
    }
    return true;
  }
}
