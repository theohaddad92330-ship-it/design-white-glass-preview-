import { BadRequestException, Body, Controller, Get, Optional, Param, Put, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  detectRitualEffectiveness,
  METRIC_SERIES_MAX_MONTHS,
  RITUAL_CATALOG,
  ritualKeySchema,
  type RitualActionsCreated,
  setFinanceMarginTargetSchema,
  setTaceThresholdSchema,
  type StaffingCapacity,
  type StaffingOverview,
  can,
  setRitualPreferenceSchema,
  type Contribution,
  type DataHygiene,
  type FinanceMarginTarget,
  type MetricSeriesResponse,
  type PilotageReport,
  type ReviewSignals,
  type Ritual,
  type RitualEffectivenessReport,
  type RitualLastHeld,
  type RitualPreference,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PlanFeatureGuard } from '../plan-features/plan-feature.guard'
import { RequireFeature } from '../plan-features/require-feature.decorator'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ContributionService } from './contribution.service'
import { FinanceTargetService } from './finance-target.service'
import { type FinanceInputs, PilotageService } from './pilotage.service'
import { DataHygieneService } from './data-hygiene.service'
import { StockSnapshotService } from './stock-snapshot.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { previousMonth } from '../delivery/finance.controller'
import { RevenueService } from '../delivery/revenue.service'
import { RitualPreferencesService } from './ritual-preferences.service'
import { RitualLastHeldService } from './ritual-last-held.service'
import { RitualActionsService } from './ritual-actions.service'
import { StaffingPilotageService } from './staffing-pilotage.service'

/** Le mois d'un réglage ou d'une lecture, `AAAA-MM`. */
const monthParam = z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')

/**
 * ⚠️ `coerce` : une chaîne de requête n'a que des chaînes. Sans lui, `months=6`
 * arriverait en `"6"`, `seriesFor` ferait `Math.trunc("6") || 1` — qui vaut 6 par
 * coercition JS — et le jour où quelqu'un enverrait `months=abc`, la borne
 * tomberait à 1 mois **en silence**. Le refus explicite vaut mieux qu'une série
 * mystérieusement courte.
 */
class MetricSeriesQueryDto extends createZodDto(
  z.object({ months: z.coerce.number().int().min(1).max(METRIC_SERIES_MAX_MONTHS).optional() }),
) {}
class FinanceTargetQueryDto extends createZodDto(z.object({ month: monthParam })) {}
class SetFinanceTargetDto extends createZodDto(setFinanceMarginTargetSchema) {}
class SetTaceThresholdDto extends createZodDto(setTaceThresholdSchema) {}
class SetRitualPreferenceDto extends createZodDto(setRitualPreferenceSchema) {}

/**
 * KPI de chaîne (annexe méthodo p24). Lecture pure, scopée au workspace de
 * l'appelant. Module autonome (règle #7) : le retirer supprime l'écran Pilotage
 * sans toucher au reste.
 */
@Controller('pilotage')
// Même porte que le cockpit : c'est le même écran de pilotage.
@RequireFeature('manager_cockpit')
// `WorkspacePermissionGuard` rejoint la porte le 31/08/2026 : sans lui, la
// permission déclarée sur la saisie d'objectif serait une annotation que RIEN ne
// lit — « allumer un drapeau ne suffit pas ».
//
// ⚠️ Le nom du décorateur de permission ne s'écrit PAS dans ce commentaire, et
// ce n'est pas de la coquetterie : GA-05 saute le fichier ENTIER dès qu'il
// trouve la chaîne avant `export class`, commentaire compris. La première
// version de cette ligne l'écrivait, et les neuf routes de ce contrôleur ont
// cessé d'être comptées — trouvé en cassant volontairement la garde.
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class PilotageController {
  constructor(
    private readonly pilotage: PilotageService,
    private readonly hygiene: DataHygieneService,
    private readonly contribution: ContributionService,
    private readonly stockSnapshots: StockSnapshotService,
    private readonly targets: FinanceTargetService,
    // Résolu ICI et non dans le service : un contrôleur est exempté du cliquet
    // GA-07, et c'est la sortie que la garde nomme elle-même.
    private readonly workspaceContext: WorkspaceContextService,
    // #3271.10, .12 — les rituels que l'espace ACTIF a choisi de masquer.
    private readonly ritualPreferences: RitualPreferencesService,
    // #3298 (suite #3271.8) — la marque légère de dernière tenue d'un rituel.
    private readonly ritualLastHeld: RitualLastHeldService,
    // #3271.8 reste (épopée #3298) — « actions créées » par rituel.
    private readonly ritualActions: RitualActionsService,
    // L3 (14/10/2026) — l'écran Staffing : capacité, intercontrat, fins de mission, TACE.
    private readonly staffing: StaffingPilotageService,
    // Marge et DSO de la chaîne se lisent dans Finance (même source, GA-26). Lu ICI : un
    // contrôleur est exempté du cliquet GA-07. Optionnel : sans lui, « non mesuré », jamais inventé.
    @Optional() private readonly revenue?: RevenueService,
  ) {}

  /** Même source et même mois que `/pilotage/finance`. Une panne ou une mesure absente rend `null`, jamais 0. */
  private async financeInputs(workspaceId: string): Promise<FinanceInputs> {
    if (!this.revenue) return { marginPercent: null, dsoDays: null }
    const scope = { kind: 'workspace', workspaceId } as const
    const [margin, dso] = await Promise.all([
      this.revenue.aggregate(scope, previousMonth()).catch(() => null),
      this.revenue.dso(workspaceId).catch(() => null),
    ])
    return { marginPercent: margin?.marginPercent ?? null, dsoDays: dso?.days ?? null }
  }

  /**
   * « Ce que Bellum a contribué » (§12) — le bloc qui répond au signal de churn
   * le plus explicite du call bêta.
   *
   * Des comptages, jamais un montant. La causalité appartient au commercial.
   *
   * #2206.3 — donnée d'ÉQUIPE : même porte que `GET /manager/team-stats`
   * (`manager.controller.ts`) et `GET /objectives/team`
   * (`objectives.controller.ts`), les deux autres routes `manager_cockpit` qui
   * lisent des chiffres d'équipe. `@RequireFeature('manager_cockpit')` sur la
   * classe est un palier de PLAN, pas un rôle : sans cette permission, un
   * membre standard (`sales`, `member`…) de tout espace au palier suffisant
   * lisait déjà la contribution de toute l'équipe.
   */
  @Get('contribution')
  @RequirePermission('team:manage')
  async contributionBlock(@CurrentUser() user: CurrentUserPayload): Promise<Contribution> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.contribution.forWorkspace(workspaceId)
  }

  /**
   * #3262.24-28 (épopée #3262, lot R11 29/09) — LES SIGNAUX DE REVUE, pour la
   * bande de décision (`DecisionStrip.tsx`). Même porte que `contribution` :
   * une donnée d'ÉQUIPE (focus/no-go/portefeuille traversent tout l'espace),
   * pas un rôle.
   */
  @Get('review-signals')
  @RequirePermission('team:manage')
  async reviewSignals(@CurrentUser() user: CurrentUserPayload): Promise<ReviewSignals> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.pilotage.reviewSignals(workspaceId)
  }

  /**
   * L3 — capacité vs demande sur 12 semaines (`/pilotage/staffing`). Donnée
   * d'ÉQUIPE : même porte que `contribution` (`team:manage`). Scopé au workspace
   * ACTIF de l'appelant, jamais à un identifiant reçu du client.
   */
  @Get('staffing/capacity')
  @RequirePermission('team:manage')
  async staffingCapacity(@CurrentUser() user: CurrentUserPayload): Promise<StaffingCapacity> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.staffing.capacity(workspaceId)
  }

  /**
   * L3 — intercontrat, fins de mission 30/60/90 j, TACE planifié et réel. Le COÛT
   * de l'intercontrat est une donnée financière : sans `finance:read` il sort
   * `restricted`, jamais un chiffre.
   */
  @Get('staffing/overview')
  @RequirePermission('team:manage')
  async staffingOverview(@CurrentUser() user: CurrentUserPayload): Promise<StaffingOverview> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    return this.staffing.overview(workspaceId, can(role, extra, 'finance:read'))
  }

  /** Le seuil d'alerte TACE de l'espace. `null` l'éteint : aucune alerte tant que l'ESN n'a rien saisi. */
  @Put('staffing/tace-threshold')
  @RequirePermission('team:manage')
  async setTaceThreshold(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SetTaceThresholdDto,
  ): Promise<{ thresholdPercent: number | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.staffing.setTaceThreshold(workspaceId, body.thresholdPercent)
    return { thresholdPercent: body.thresholdPercent }
  }

  /**
   * La chaîne, ET la base de comparaison de ses indicateurs de STOCK.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI LA PHOTO VOYAGE AVEC LES VALEURS, ET NON SUR UNE ROUTE À ELLE
   * ─────────────────────────────────────────────────────────────────────────
   * Une seconde route aurait produit deux lectures à deux instants, et donc la
   * possibilité — rare, mais réelle — d'afficher une tendance calculée entre un
   * chiffre d'aujourd'hui et une base rapportée pour un autre écran. Ici, le
   * couple arrive ensemble ou n'arrive pas.
   *
   * `stockBaseline` ne porte QUE le passé : la valeur courante reste celle des
   * `metrics` ci-dessus, c'est-à-dire exactement celle que l'écran affiche.
   * Une clé absente veut dire « aucune photo », jamais « zéro » — l'écran
   * n'affiche alors AUCUN pourcentage.
   *
   * #2206.3 — même porte que `contributionBlock` ci-dessus : donnée d'ÉQUIPE,
   * `team:manage`.
   */
  @Get('chain')
  @RequirePermission('team:manage')
  async chain(@CurrentUser() user: CurrentUserPayload): Promise<PilotageReport> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Marge et DSO viennent de Finance : sous `finance:read` seulement.
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    const [report, stockBaseline] = await Promise.all([
      this.pilotage.getChain(
        user.userId,
        workspaceId,
        can(role, extra, 'finance:read') ? await this.financeInputs(workspaceId) : undefined,
      ),
      this.stockSnapshots.baselineFor(workspaceId, 'chain'),
    ])
    // #1440 — l'instant du CALCUL. Rien n'est mis en cache : chaque appel relit
    // les tables, donc « calculé à » est vrai et « mis à jour il y a » serait
    // faux. Posé ici et non dans `evaluatePilotageChain`, qui reste pure.
    return { ...report, stockBaseline, generatedAt: new Date().toISOString() }
  }

  /**
   * Le dictionnaire des 60 indicateurs (§8).
   *
   * Servi depuis le CODE et non depuis la base, comme le dictionnaire
   * d'exclusions : une définition d'indicateur éditable sans revue rendrait deux
   * lectures incomparables d'un mois à l'autre — et c'est précisément ce qu'un
   * dictionnaire existe pour empêcher.
   *
   * Il ne porte AUCUNE valeur. Les chiffres vivent là où ils sont calculés (la
   * chaîne de pilotage, le panneau finance, le back-office) ; les recalculer ici
   * produirait un second jeu de nombres pour les mêmes questions, et deux
   * chiffres qui divergent font douter des deux.
   */
  /**
   * La qualité des données (§6.3) — huit listes de TRAVAIL, pas huit notes.
   *
   * Elle est côté application et non au back-office, contrairement aux taux de
   * performance : « 7 comptes sans prochaine action » n'est pas un jugement sur
   * quelqu'un, c'est du travail à faire, et le cacher à la personne qui doit le
   * faire n'aurait aucun sens.
   *
   * #2206.3 — même porte que `contributionBlock` ci-dessus : donnée d'ÉQUIPE,
   * `team:manage`.
   */
  @Get('hygiene')
  @RequirePermission('team:manage')
  async dataHygiene(@CurrentUser() user: CurrentUserPayload): Promise<DataHygiene> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // Sept des huit lignes sont des STOCKS : leur photo du mois précédent
    // voyage avec elles, pour la même raison que sur la chaîne — une base
    // rapportée d'une autre lecture décrirait un autre instant.
    const [overview, stockBaseline] = await Promise.all([
      this.hygiene.overview(workspaceId),
      this.stockSnapshots.baselineFor(workspaceId, 'hygiene'),
    ])
    return { ...overview, stockBaseline }
  }

  /**
   * Les cinq rituels et leur ordre du jour (§7).
   *
   * Ce qui distingue un rituel d'une routine : une durée, un ordre du jour, des
   * participants et des décisions. Le produit avait les routines — qui
   * notifient — et rien de l'ordre du jour.
   *
   * ⚠️ Le catalogue ne porte NI séance enregistrée, NI chronomètre, NI compte
   * rendu. Ce n'est pas un manque d'effort : le dépôt a déjà deux journaux de
   * décision (les portes et la file d'intervention). Un troisième, attaché à une
   * réunion, ferait un troisième endroit où chercher « qu'a-t-on décidé sur ce
   * compte » — et c'est ainsi qu'on finit par ne chercher nulle part.
   */
  /**
   * BEL-SC-242 (#3271.10, .12) — le catalogue COMPLET, toujours les cinq
   * rituels (jamais filtré : un rituel masqué reste NOMMÉ, « on archive, on
   * ne supprime pas »), et les préférences de masquage de l'espace ACTIF de
   * l'appelant à côté. `preferences` vide = rien n'a jamais été réglé, aucun
   * rituel masqué par défaut.
   *
   * #3298 (suite #3271.11, .12, .8) — `effectiveness` et `lastHeld` à côté,
   * LUE une fois avec les deux autres, jamais un second aller-retour : même
   * lecture de `stockSnapshots.seriesFor` que `GET /pilotage/metrics/series`
   * (§ plus bas), jamais un second détecteur (`detectRitualEffectiveness`
   * COMPOSE cette série, `ritual.ts`). Un rituel `daily`/`weekly`/`rank1`
   * n'apparaît PAS dans `effectiveness` — hors périmètre par construction
   * (granularité mensuelle), jamais un `not_evaluable` qui laisserait croire
   * qu'on a essayé.
   */
  @Get('rituals')
  async rituals(@CurrentUser() user: CurrentUserPayload): Promise<{
    items: readonly Ritual[]
    preferences: RitualPreference[]
    effectiveness: RitualEffectivenessReport[]
    lastHeld: RitualLastHeld[]
    actionsCreated: RitualActionsCreated[]
  }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const [preferences, lastHeld, actionsCreated, series] = await Promise.all([
      this.ritualPreferences.forWorkspace(workspaceId),
      this.ritualLastHeld.forWorkspace(workspaceId),
      this.ritualActions.forWorkspace(workspaceId),
      this.stockSnapshots.seriesFor(workspaceId, 6),
    ])
    const effectiveness = RITUAL_CATALOG.map(ritual =>
      detectRitualEffectiveness({ ritual, series: series.series, monthsCovered: series.monthsCovered }),
    ).filter((report): report is RitualEffectivenessReport => report !== null)
    return { items: RITUAL_CATALOG, preferences, effectiveness, lastHeld, actionsCreated }
  }

  /**
   * Masquer — ou réafficher — un rituel pour tout l'espace. `team:manage` :
   * un réglage d'ÉQUIPE (comme `contributionBlock`/`hygiene` ci-dessus), pas
   * une préférence personnelle.
   */
  @Put('rituals/:key/preference')
  @RequirePermission('team:manage')
  async setRitualPreference(
    @CurrentUser() user: CurrentUserPayload,
    @Param('key') key: string,
    @Body() body: SetRitualPreferenceDto,
  ): Promise<RitualPreference> {
    const parsedKey = ritualKeySchema.safeParse(key)
    if (!parsedKey.success) throw new BadRequestException(`rituel inconnu : ${key}`)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.ritualPreferences.set(workspaceId, parsedKey.data, body.disabled, user.userId)
  }

  /**
   * #3298 (suite #3271.8) — marquer un rituel comme TENU aujourd'hui. Un
   * geste, une date — jamais une note, jamais un ordre du jour tenu (§
   * `ritual.ts`, docblock de `nextRitualDate`). `team:manage` : même porte
   * que la préférence de masquage juste au-dessus — un fait d'ÉQUIPE.
   */
  @Put('rituals/:key/held')
  @RequirePermission('team:manage')
  async markRitualHeld(@CurrentUser() user: CurrentUserPayload, @Param('key') key: string): Promise<RitualLastHeld> {
    const parsedKey = ritualKeySchema.safeParse(key)
    if (!parsedKey.success) throw new BadRequestException(`rituel inconnu : ${key}`)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.ritualLastHeld.markHeld(workspaceId, parsedKey.data, user.userId)
  }

  /**
   * LA SÉRIE DES PHOTOS MENSUELLES — la route qui manquait au lot du 31/08.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI ELLE N'EXISTAIT PAS, ET POURQUOI ELLE EXISTE MAINTENANT
   * ─────────────────────────────────────────────────────────────────────────
   * `StockSnapshotService.seriesFor` était écrite, testée, et **appelée par
   * personne** : le lot qui l'a livrée ne pouvait pas toucher aux écrans, et il
   * a eu raison de ne pas poser un point d'entrée sans appelant. C'est le
   * défaut n°1 du dépôt — « du code juste, calculé, testé, que personne
   * n'appelle » — et la réponse n'est pas de coder plus, c'est de brancher.
   *
   * Elle arrive donc AVEC son consommateur : l'écran `/pilotage/finance` rend
   * ses deltas « vs mois dernier » par `metricDelta` sur ces points.
   *
   * ⚠️ Une route à ELLE, contrairement à `stockBaseline` qui voyage avec la
   * chaîne et l'hygiène. La raison de ce voyage était « le couple arrive
   * ensemble ou n'arrive pas » — vrai pour UNE base comparée à UNE valeur
   * courante servie dans la même réponse. Ici il n'y a pas de valeur courante à
   * apparier : la série est un HISTORIQUE, chaque point est daté, et deux points
   * datés lus à deux instants disent exactement la même chose.
   *
   * Le marqueur de lecture d'espace, et non une permission : la matrice n'a
   * **aucune** permission de lecture à donner à des dénombrements d'hygiène — les fermer derrière
   * `finance:read` les interdirait à `viewer` et à `sales`, qui lisent déjà les
   * mêmes chiffres, nus, sur `/pilotage`. Le marqueur DÉCLARE la nature de la
   * route ; il n'exempte rien (D39).
   *
   * ⚠️ Le marqueur est posé SOUS le décorateur de route : la segmentation de
   * GA-05 part du verbe HTTP, et au-dessus il compterait pour la route
   * PRÉCÉDENTE — la route neuve redeviendrait nue sans que rien ne rougisse.
   * (Le nom du décorateur de route ne s'écrit pas non plus ici : la même lecture
   * y verrait une route de plus, fantôme et déclarée.)
   */
  @Get('metric-series')
  @WorkspaceRead()
  async metricSeries(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: MetricSeriesQueryDto,
  ): Promise<MetricSeriesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // `months` absent = un an. `seriesFor` borne elle-même (1 … 24) : une valeur
    // absurde rend une série courte, jamais une exception — un paramètre mal
    // formé ne doit pas priver l'écran de TOUTE lecture.
    return this.stockSnapshots.seriesFor(workspaceId, query.months ?? 12)
  }

  /**
   * L'OBJECTIF MENSUEL DE MARGE — lecture.
   *
   * D7 du 26/08 refusait l'anneau « taux de réalisation » parce que l'objectif
   * n'existait dans aucune table et que l'inventer aurait été de la donnée
   * fabriquée. **Louis a levé ce refus le 31/08/2026** en tranchant la forme :
   * l'objectif est un RÉGLAGE saisi par l'espace, mois par mois.
   *
   * Même porte que la série : un objectif est une donnée d'espace, sans montant
   * ni coût. `finance:read` garde la MARGE, pas la cible qu'on s'est fixée —
   * et un commercial qui voit son propre chiffre (D1) doit pouvoir savoir contre
   * quoi il est lu.
   */
  @Get('finance-target')
  @WorkspaceRead()
  async financeTarget(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FinanceTargetQueryDto,
  ): Promise<FinanceMarginTarget> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.targets.forMonth(workspaceId, query.month)
  }

  /**
   * L'OBJECTIF MENSUEL DE MARGE — saisie, et effacement.
   *
   * `finance:write` : c'est exactement la permission que sa docblock nomme —
   * « régler le seuil d'alerte de marge (PDF 5, D36) ». Se fixer une cible et
   * régler un seuil sont le même geste, avec le même poids : les deux changent
   * la façon dont TOUT l'espace lira ses chiffres du mois.
   *
   * ⚠️ `PUT` et non `POST` : la ressource est identifiée par (espace, mois),
   * donc rejouer la requête donne le même état. Un `POST` aurait suggéré une
   * pile d'objectifs, ce que la contrainte unique refuse de toute façon.
   */
  @Put('finance-target')
  @RequirePermission('finance:write')
  async setFinanceTarget(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SetFinanceTargetDto,
  ): Promise<FinanceMarginTarget> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.targets.set(workspaceId, body.month, body.targetPercent, user.userId)
  }
}
