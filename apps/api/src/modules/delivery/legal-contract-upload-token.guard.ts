import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common'
import { LegalContractUploadLinkService } from './legal-contract-upload-link.service'

type LegalContractUploadRequest = { params: Record<string, string | undefined> }

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LA PORTE de la surface
 * publique du lien signé.
 *
 * Ni `JwtGuard` (le contact externe — client, partenaire — n'a pas de compte
 * BellumAI) ni `InternalSecretGuard` (ce n'est pas un service à nous) :
 * l'authentification EST le jeton du chemin, résolu contre son HACHAGE en
 * base (`legal_contract_upload_links.token_hash`), jamais le jeton en clair.
 *
 * Fail-closed, et ON NE DIT PAS POURQUOI — même doctrine que
 * `PhoneRevealWebhookGuard` (E1, #3698) : un jeton introuvable, EXPIRÉ ou
 * RÉVOQUÉ rend le MÊME 404, pour ne pas aider qui tâtonne à distinguer les
 * trois. La raison précise (laquelle des trois) ne sort que côté commercial,
 * authentifié (`LegalContractUploadLinkController.list`).
 */
@Injectable()
export class LegalContractUploadTokenGuard implements CanActivate {
  constructor(private readonly links: LegalContractUploadLinkService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LegalContractUploadRequest>()
    const status = await this.links.resolvePublic(request.params['token'] ?? '')
    if (status.status !== 'valid') throw new NotFoundException()
    return true
  }
}
