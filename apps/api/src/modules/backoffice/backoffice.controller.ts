import { Controller, Get, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT,
  type LauraAnalyticsSummary,
  type SurfaceAcceptanceMeasure,
} from '@bellum/contracts'
import { BackofficeRoleGuard } from '../auth/backoffice-role.guard'
import { JwtGuard } from '../auth/jwt.guard'
import { LauraAcceptanceService } from '../laura/laura-acceptance.service'
import { LauraAnalyticsService } from '../laura/laura-analytics.service'

/** Ce que l'écran `/bak/home` reçoit. `null` = aucune adresse configurée. */
type BackofficeAddress = { url: string | null }

/**
 * Ce que `GET /backoffice/laura-acceptance` rend — la sortie de
 * `LauraAcceptanceService.bySurface()`, transportée telle quelle.
 *
 * `surfaces` est indexé par `intervention_key` (`LAURA_INTERVENTIONS`) : une
 * `Map` ne survivrait pas à la sérialisation JSON de Nest (`JSON.stringify(new
 * Map())` rend `"{}"` sans ses entrées), donc `Object.fromEntries` la
 * convertit — sans toucher à un seul champ de chaque `SurfaceAcceptanceMeasure`.
 * `measured` garde `acceptedPercent` et `sample` ; `unmeasured` garde `reason`
 * et `sample`, JAMAIS `acceptedPercent` — le type l'interdit déjà
 * structurellement, ce passage ne fait qu'éviter de le refaire à la main.
 *
 * `suggestedFloorPercent` est un champ SÉPARÉ, à titre indicatif seulement
 * (D648) : voir le docblock de la route plus bas.
 */
type SurfaceAcceptanceReading = {
  surfaces: Record<string, SurfaceAcceptanceMeasure>
  suggestedFloorPercent: number
}

/**
 * L'adresse de la console d'exploitation, servie au seul porteur du rôle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI L'API LA REND, PLUTÔT QU'UNE VARIABLE `VITE_*`
 * ─────────────────────────────────────────────────────────────────────────
 * Décision de Louis, 28/08/2026. Une variable `VITE_*` est inlinée dans le
 * bundle : l'adresse d'une console d'opérateur y serait lisible par n'importe
 * quel visiteur qui ouvre les sources — y compris déconnecté. Ici elle ne
 * traverse le réseau que sur une requête authentifiée dont l'appelant porte
 * `backoffice`, et elle n'apparaît dans aucun artefact statique.
 *
 * ⚠️ Elle n'est pas non plus journalisée : ce contrôleur n'a pas de logger, et
 * la valeur ne transite par aucun `logger.*`. Un 403 est un 403 — il ne dit même
 * pas si une adresse est configurée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA ROUTE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Sans `BACKOFFICE_URL`, elle rend `{ url: null }` — pas une erreur, pas une
 * adresse construite depuis l'origine de l'API. La règle du dépôt pour toute
 * clé optionnelle : sans clé = no-op STRICT, jamais un repli deviné. Un
 * opérateur envoyé sur une URL inventée est pire qu'un opérateur qui lit « pas
 * d'adresse configurée ».
 *
 * ⚠️ Et l'entrée de navigation ne dépend PAS de cette route : elle tient au
 * RÔLE. Sinon un opérateur cesserait de voir son entrée le jour d'un
 * déploiement mal configuré, sans rien pour comprendre pourquoi.
 */
@Controller('backoffice')
@UseGuards(JwtGuard, BackofficeRoleGuard)
export class BackofficeController {
  constructor(
    private readonly config: ConfigService,
    private readonly acceptance: LauraAcceptanceService,
    private readonly analytics: LauraAnalyticsService,
  ) {}

  @Get('address')
  address(): BackofficeAddress {
    // `''` est une variable posée mais vide sur la plate-forme : c'est une
    // absence, pas une adresse.
    const url = this.config.get<string>('backofficeUrl')
    return { url: url && url.length > 0 ? url : null }
  }

  /**
   * Le taux d'acceptation des interventions de Laura, PAR SURFACE, sur 30
   * jours glissants (D643-D648) — la lecture que `LauraAcceptanceService`
   * calcule et que personne n'appelait encore.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE ROUTE EST ICI, ET NULLE PART AILLEURS
   * ─────────────────────────────────────────────────────────────────────────
   * `bySurface()` lit à travers TOUS les espaces, SANS filtre `workspace_id`
   * — délibéré et documenté sur le service : un seul espace n'atteint
   * quasiment jamais l'échantillon minimum en 30 jours. Rendre ce chiffre à un
   * espace client serait donc exactement l'agrégat inter-espaces que la
   * doctrine interdit (`COMMUNITY_FORBIDDEN_KINDS`, GA-43) — les espaces sont
   * des ESN, donc des concurrents. Cette route ne vit QUE sur
   * `BackofficeController`, gardé au niveau CLASSE par `BackofficeRoleGuard` :
   * elle n'est donc jamais atteignable par un porteur de rôle d'espace, quel
   * qu'il soit — voir GA-194 (`backoffice.controller.spec.ts`), qui le prouve.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS (D648)
   * ─────────────────────────────────────────────────────────────────────────
   * Elle MESURE : chaque surface du catalogue ressort soit `measured`
   * (`acceptedPercent`, `sample`), soit `unmeasured` avec sa raison NOMMÉE
   * (`no_observation` ou `sample_too_small`) — jamais un taux à 0 %. Elle ne
   * CLASSE rien, ne recommande rien, ne colorie rien : `suggestedFloorPercent`
   * porte le seuil de 15 % que la source propose, à TITRE INDICATIF SEULEMENT,
   * dans un champ SÉPARÉ de `surfaces` — rien ici ne le compare à une mesure.
   * La décision de retirer une surface sous ce seuil reste celle de Louis, et
   * seulement une fois ce chiffre VISIBLE — pas avant. GA-184
   * (`apps/api/src/modules/laura/laura-acceptance.guard.spec.ts`) vérifie déjà
   * que rien dans le module Laura ne compare ce seuil ; cette route ne le fait
   * pas non plus.
   */
  @Get('laura-acceptance')
  async lauraAcceptance(): Promise<SurfaceAcceptanceReading> {
    const bySurface = await this.acceptance.bySurface()
    return {
      surfaces: Object.fromEntries(bySurface),
      suggestedFloorPercent: SUGGESTED_SURFACE_ACCEPTANCE_FLOOR_PERCENT,
    }
  }

  /**
   * #2403.40-.47 — les huit noms du §5.3 (`offered`, `viewed`, `accepted`,
   * `dismissed`, `ignored`, `converted_to_action`, `false_positive`,
   * `disabled`), sur la même fenêtre de 30 jours glissants et le même
   * périmètre inter-espaces que `laura-acceptance` juste au-dessus, et pour
   * la même raison (GA-43 : le coût d'accès ne s'agrège jamais entre espaces,
   * mais un agrégat PRODUIT n'en est pas un — voir `LauraAnalyticsService`).
   *
   * Trois des huit ressortent `unmeasured`, avec leur raison NOMMÉE
   * (`computeLauraAnalytics`, `@bellum/contracts`) : ni cette route ni le
   * service ne devinent une valeur qu'aucun signal ne porte.
   */
  @Get('laura-analytics')
  async lauraAnalytics(): Promise<LauraAnalyticsSummary> {
    return this.analytics.summarize()
  }
}
