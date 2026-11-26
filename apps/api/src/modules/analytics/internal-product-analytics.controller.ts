import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  ProductAnalyticsReadService,
  type RapportDemande,
  type RapportEcrans,
  type RapportFriction,
  type RapportParcours,
  type RapportSectionsDossier,
  type RapportValeur,
} from './product-analytics-read.service'

/**
 * #1683/#1684/#1687/#1688/#1946/#2130.71 — les six lectures du flux
 * COMPORTEMENTAL, pour le back-office `dashboard-manager`.
 *
 * Même porte que le reste des KPI manager : {@link InternalSecretGuard},
 * cross-tenant par nature (l'opérateur voit tout), donc c'est la SEULE chose qui
 * protège la base entière derrière ces routes. Elle ne doit jamais être retirée.
 *
 * ⚠️ Contrôleur SÉPARÉ de `InternalTeamKpisController` plutôt que quatre routes
 * de plus dedans — même raison que `InternalOnboardingFunnelController` : ce
 * fichier partagé porte déjà onze routes, et plusieurs lots de la série
 * `/produit` touchent `analytics/` en parallèle. Un fichier neuf ne conflicte
 * avec aucun d'eux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE ROUTE PAR ÉCRAN CONSOMMATEUR, JAMAIS UNE ROUTE UNIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que chacun balaye la table pour son compte : une route unique ferait
 * payer à l'écran des recherches vides le repli complet des parcours. `product
 * -account-sections` (#2130.71) suit le même patron que `product-value` avant
 * elle : un écran neuf, une route neuve, jamais un bloc de plus dans une route
 * existante qui ferait payer son repli à un consommateur qui n'en a pas besoin.
 *
 * ⚠️ AUCUNE DE CES RÉPONSES NE PORTE UN NOM D'ESPACE CLIENT, et ce n'est pas une
 * discipline de contrôleur : le flux lu n'a pas de colonne `workspace_id`
 * (`trackBehavioral()` l'écrit `null` inconditionnellement). C'est la règle 5 de
 * `c64_analytique_produit` — « l'écran X est abandonné à 62 % » se lit, « chez
 * ce client, l'écran X est abandonné » ne se lit pas. Gardée par GA-266 et par
 * le test T2 de `internal-product-analytics.controller.spec.ts`.
 */
@Controller('internal/analytics')
@UseGuards(InternalSecretGuard)
export class InternalProductAnalyticsController {
  constructor(private readonly read: ProductAnalyticsReadService) {}

  /** #1683 — l'usage écran par écran : vues, sessions, durée, rebond, action. */
  @Get('product-screens')
  getScreens(@Query('days') days?: string): Promise<RapportEcrans> {
    return this.read.screens(parseDays(days))
  }

  /** #1684 — sorties par écran, parcours les plus fréquents, parcours interrompus. */
  @Get('product-journeys')
  getJourneys(@Query('days') days?: string): Promise<RapportParcours> {
    return this.read.journeys(parseDays(days))
  }

  /** #1687 — répétition, aller-retour, erreur vue. */
  @Get('product-friction')
  getFriction(@Query('days') days?: string): Promise<RapportFriction> {
    return this.read.friction(parseDays(days))
  }

  /** #1688 — les recherches sans résultat, par écran. Jamais le texte cherché. */
  @Get('product-demand')
  getDemand(@Query('days') days?: string): Promise<RapportDemande> {
    return this.read.demand(parseDays(days))
  }

  /**
   * #1946 — la VALEUR : amorce, réponses, brouillons, chaîne d'action, suites.
   * Une CINQUIÈME route et pas un bloc de plus dans `product-screens`, pour la
   * raison écrite en tête de ce fichier : chaque écran consommateur balaye pour
   * son compte, et faire payer le repli complet de la valeur à l'écran des
   * parcours n'aurait servi personne.
   *
   * ⚠️ Ce rapport ne rend PAS de résultat métier — il le NOMME absent. Le
   * rapprocher d'un fait commercial demanderait un espace, que ce flux n'écrit
   * pas (règle 5, GA-266).
   */
  @Get('product-value')
  getValue(@Query('days') days?: string): Promise<RapportValeur> {
    return this.read.valeur(parseDays(days))
  }

  /**
   * #2130.71 — les sections du dossier compte, par fréquence d'ouverture.
   * SIXIÈME route et pas un bloc de plus dans `product-screens` : même
   * raison que `product-value` juste au-dessus, l'écran des sections n'a
   * besoin d'aucun autre balayage que le sien.
   */
  @Get('product-account-sections')
  getAccountSections(@Query('days') days?: string): Promise<RapportSectionsDossier> {
    return this.read.accountSections(parseDays(days))
  }
}

/**
 * `undefined` plutôt qu'un nombre inventé : le service porte SON défaut de
 * fenêtre, et deux endroits qui le décideraient divergeraient. Une saisie
 * illisible retombe elle aussi sur le défaut du service, jamais sur `NaN`.
 */
function parseDays(days: string | undefined): number | undefined {
  if (days === undefined) return undefined
  const parsed = Number.parseInt(days, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}
