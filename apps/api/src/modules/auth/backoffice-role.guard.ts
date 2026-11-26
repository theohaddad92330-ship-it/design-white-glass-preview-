import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { isSuccess } from '@bellum/utils'
import { SessionService } from './session.service'

/**
 * Le rôle plate-forme d'un opérateur Bellum. Jumeau de `BACKOFFICE_ROLE` dans
 * `apps/web/src/utils/role.ts` : la valeur vient de `app_metadata.roles` côté
 * Supabase (écrit par la clé de service seule — JAMAIS `user_metadata`, que
 * l'utilisateur modifie lui-même ; fix/roles-app-metadata), et l'écran la
 * reçoit déjà mappée par `GET /auth/session`.
 */
export const BACKOFFICE_ROLE = 'backoffice'

/**
 * Réserve une route aux OPÉRATEURS Bellum — pas aux membres d'un espace.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS `WorkspacePermissionGuard`
 * ─────────────────────────────────────────────────────────────────────────
 * Les permissions d'espace (`records:write`, `team:manage`, …) répondent à
 * « ce membre a-t-il le droit sur la donnée de SON ESN ? ». La question ici est
 * d'un autre étage : « cette personne exploite-t-elle Bellum ? ». Aucune
 * permission d'espace ne peut y répondre, et en inventer une l'accorderait au
 * propriétaire de chaque espace client — l'inverse de ce qu'on veut.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL RELIT LE COMPTE AU LIEU DE LIRE LE JETON
 * ─────────────────────────────────────────────────────────────────────────
 * `JwtStrategy.validate` ne met que `{ userId, email }` sur `req.user` : les
 * rôles n'y sont pas. On pourrait les prendre dans les claims — un jeton
 * Supabase transporte `app_metadata` — mais cette copie est FIGÉE à la
 * signature : un rôle retiré à un opérateur y survivrait jusqu'à l'expiration.
 * `SessionService.getSession` relit le compte chez Supabase avec la clé de
 * service ; c'est la seule lecture qui dise l'état d'aujourd'hui, et c'est déjà
 * celle sur laquelle `GET /auth/session` fonde la navigation.
 *
 * ⚠️ Il ne remplace jamais `JwtGuard` : il suppose l'identité déjà établie et
 * s'enchaîne APRÈS lui (`@UseGuards(JwtGuard, BackofficeRoleGuard)`).
 */
@Injectable()
export class BackofficeRoleGuard implements CanActivate {
  constructor(private readonly session: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { userId?: string } }>()
    const userId = request.user?.userId
    // Sans identité, rien à demander à Supabase. On refuse sans appel réseau.
    if (!userId) throw new ForbiddenException('Accès réservé aux opérateurs Bellum.')

    const result = await this.session.getSession(userId)
    // Compte introuvable ou lecture en échec : on ne SUPPOSE aucun rôle. Un
    // silence n'est pas un verdict.
    if (!isSuccess(result) || !result.output.user.roles.includes(BACKOFFICE_ROLE)) {
      throw new ForbiddenException('Accès réservé aux opérateurs Bellum.')
    }
    return true
  }
}
