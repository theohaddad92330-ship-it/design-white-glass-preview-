import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { verifyPhoneRevealToken } from './phone-reveal-token'

export type PhoneRevealRequest = {
  params: Record<string, string | undefined>
  phoneReveal?: { contactId: string; workspaceId: string | null; nonce: string }
}

/**
 * E1 (07/10/2026, #3698) — LA PORTE de l'endpoint public qui reçoit le mobile
 * révélé par Apollo. Ni `JwtGuard` (Apollo n'est pas un utilisateur) ni
 * `InternalSecretGuard` (Apollo n'a pas notre secret) : l'authentification est
 * le JETON SIGNÉ PAR REQUÊTE du chemin (`phone-reveal-token.ts`, HMAC-SHA256 de
 * `INTERNAL_API_SECRET`). Fail-closed : secret absent → 503 (jamais vérifié),
 * jeton faux ou expiré → 404 (on ne dit pas pourquoi). Le contact se lit dans
 * le jeton, jamais dans le corps : un corps ne peut pas faire écrire une autre
 * fiche que celle qui a été signée.
 */
@Injectable()
export class PhoneRevealWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PhoneRevealRequest>()
    const secret = (this.config.get<string>('internalApiSecret') ?? '').trim()
    if (!secret) throw new ServiceUnavailableException('Webhook not configured')
    const verified = verifyPhoneRevealToken(request.params['token'] ?? '', secret)
    if (!verified) throw new NotFoundException()
    request.phoneReveal = verified
    return true
  }
}
