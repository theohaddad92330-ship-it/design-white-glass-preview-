import { Controller, Get, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { OperatorHealthService, type OperatorHealthReport } from './operator-health.service'

/**
 * #1660 — la porte opérateur de la page Santé.
 *
 * Derrière `InternalSecretGuard`, comme les autres routes `internal/*` : la
 * réponse traverse tous les espaces (le nombre d'espaces touchés par une panne
 * de connecteur), elle ne doit jamais sortir sans le secret.
 *
 * ⚠️ AUCUNE VALEUR D'ENVIRONNEMENT NE TRAVERSE CETTE ROUTE. Ce qui sort est un
 * booléen `configured` et un libellé de capacité — la présence, jamais la
 * valeur, exactement comme `internal/telemetry/kill-switches` (GA-85). Et aucun
 * identifiant d'espace ne sort non plus : le tableau des erreurs publie un
 * NOMBRE d'espaces touchés, pas leur liste.
 */
@Controller('internal/health')
@UseGuards(InternalSecretGuard)
export class InternalDependencyHealthController {
  constructor(private readonly operatorHealth: OperatorHealthService) {}

  /**
   * Les onze dépendances et ce qui casse vu du client.
   *
   * ⚠️ Cette route ne SONDE rien : elle LIT l'historique déposé par la passe de
   * cinq minutes. Sonder à chaque chargement d'écran ferait d'un rafraîchissement
   * d'onglet un appel Stripe et un appel Supabase, et surtout la latence
   * affichée serait celle d'une sonde unique plutôt qu'une médiane.
   */
  @Get('dependencies')
  dependencies(): Promise<OperatorHealthReport> {
    return this.operatorHealth.report()
  }
}
