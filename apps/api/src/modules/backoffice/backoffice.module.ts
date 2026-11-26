import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { LauraModule } from '../laura/laura.module'
import { BackofficeController } from './backoffice.controller'

/**
 * Deux routes, deux lectures réservées à l'opérateur : l'adresse de la
 * console d'exploitation, et — depuis ce lot — le taux d'acceptation des
 * interventions de Laura par surface (`GET laura-acceptance`, D643-D648).
 *
 * Il importe `AuthModule` pour `JwtGuard` ET `BackofficeRoleGuard`, et
 * `LauraModule` pour `LauraAcceptanceService` — les trois y sont fournis et
 * exportés. Le retirer ne casse rien d'autre : aucun autre module ne dépend
 * de lui.
 *
 * ⚠️ `LauraAcceptanceService.bySurface()` lit à travers TOUS les espaces, sans
 * filtre `workspace_id` (c'est délibéré, voir son docblock). C'est exactement
 * pourquoi cette lecture ne doit JAMAIS être servie par un contrôleur
 * accessible à un espace client — seul `BackofficeRoleGuard`, posé au niveau
 * CLASSE sur `BackofficeController`, s'en porte garant.
 */
@Module({
  imports: [AuthModule, LauraModule],
  controllers: [BackofficeController],
})
export class BackofficeModule {}
