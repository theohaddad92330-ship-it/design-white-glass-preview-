import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  can,
  financeScopeKindSchema,
  forecastHorizonSchema,
  type FinancePropagationResponse,
  type FinanceScope,
  type FinanceScopeInfo,
  type PoConsumptionOverview,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ForecastHorizonsService } from './forecast-horizons.service'
import { MissionScoresService } from './mission-scores.service'
import { PropagationService } from './propagation.service'
import { RevenueService } from './revenue.service'

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')

class MarginThresholdDto extends createZodDto(
  z
    .object({
      /** `null` ÉTEINT l'alerte. C'est le défaut : une alerte de marge qui se
       *  déclenche seule le premier jour apprend surtout à ignorer les alertes. */
      thresholdPercent: z.number().min(0).max(100).nullable(),
    })
    .strict(),
) {}

/**
 * L'appelant demande-t-il SON périmètre ? (`?scope=own|workspace`)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PARAMÈTRE, ET NON UNE ROUTE PERSONNELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre lectures qui savent restreindre ont DEUX lecteurs qui ne demandent
 * pas la même chose :
 *
 *  · l'écran `/pilotage/finance` — le chiffre de l'ESPACE, c'est son objet ;
 *  · le cockpit — « **Mon** chiffre d'affaires », donc le sien.
 *
 * Jusqu'au 28/08 la route TRANCHAIT seule, d'après le seul droit : quiconque
 * porte `finance:read` — `owner`, `admin`, `finance` — recevait `workspace`
 * d'office. Sur un siège de responsable, le bloc « **Mon** chiffre d'affaires »
 * montrait donc celui de toute l'ESN. Un chiffre juste sur le mauvais périmètre
 * est pire qu'un chiffre absent : il ne se remarque pas.
 *
 * ⚠️ Une valeur illisible rend « l'espace » plutôt que de REFUSER — même règle
 * que sur le pipe et la liste des missions : un lien collé de travers doit
 * montrer quelque chose. Ce qui empêche le mensonge n'est pas le refus, c'est
 * que la réponse porte le périmètre RÉELLEMENT servi : l'écran qui a demandé
 * « le mien » et reçoit `kind: 'workspace'` sait qu'il ne doit pas écrire
 * « Mon ».
 *
 * ⚠️ Aucun droit à vérifier ici, et ce n'est pas un oubli : `own` est
 * strictement plus ÉTROIT que ce que l'appelant obtenait déjà sans paramètre.
 * On ne peut rien voir de PLUS en le demandant — la seule chose que le
 * paramètre puisse faire est de retirer des lignes.
 *
 * La forme vient de `financeScopeKindSchema` : les deux portées du dépôt sont
 * nommées une seule fois (`FINANCE_SCOPE_KINDS`), et en recopier la liste ici
 * garantirait qu'une troisième portée n'arrive jamais des deux côtés.
 */
function wantsOwnScope(requested: string | undefined): boolean {
  const parsed = financeScopeKindSchema.safeParse(requested)
  return parsed.success && parsed.data === 'own'
}

/**
 * QUELLE SOCIÉTÉ DE L'ESN ? (`?entity=<uuid>`) — 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PARAMÈTRE, ET POURQUOI IL NE REFUSE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ESN un peu installée n'est presque jamais une seule société (D9), et la
 * mission est portée par UNE société — celle qui facturera le mois. Le tableau
 * de bord Finance a été livré le 31/08 avec ce sélecteur DÉSACTIVÉ, avec sa
 * raison : aucune des lectures financières ne prenait de société. Elles la
 * prennent depuis ce lot.
 *
 * ⚠️ Une valeur illisible rend « toutes les sociétés » plutôt que de REFUSER —
 * même règle que sur `?scope`, et pour la même raison : un lien collé de travers
 * doit montrer quelque chose. Le mensonge est écarté autrement : le défaut est
 * l'ESPACE ENTIER, jamais une société devinée, et l'écran affiche la société
 * qu'il a lui-même choisie.
 *
 * ⚠️ AUCUN droit à vérifier ici, et ce n'est pas un oubli : la société est
 * strictement plus ÉTROITE que ce que l'appelant obtenait déjà. On ne peut rien
 * voir de PLUS en la demandant — le paramètre ne sait que retirer des lignes.
 * Et il s'INTERSECTE avec `?scope=own` : un commercial qui demande une société
 * voit les missions qui sont à la fois les siennes et de cette société.
 *
 * Rend `null` et jamais `undefined` : deux valeurs pour « toutes les sociétés »
 * finiraient par être lues différemment à un endroit sur trois.
 */
function requestedLegalEntity(raw: string | undefined): string | null {
  const parsed = z.string().guid().safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * La marge et les quatre chiffres d'affaires (PDF 5 §9-11).
 *
 * Le champ n'est jamais mis à zéro sans le droit, il DISPARAÎT : un zéro se lit
 * comme une marge nulle, ce qui est une information fausse là où l'absence de
 * droit ne dit rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PORTÉES DEPUIS LE 26/08/2026 (D1)
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUT ce contrôleur était derrière `finance:read`, que ni `sales` ni
 * `sales_ops` ne portent : un commercial ne pouvait pas voir le chiffre qu'il
 * avait lui-même produit. Lui donner `finance:read` aurait ouvert du même geste
 * la marge de ses collègues et le coût chargé des consultants.
 *
 * QUATRE routes acceptent désormais `finance:read:own` et RESTREIGNENT alors leur
 * périmètre — chiffre d'affaires, marge, prévisionnel, et le CA cumulé par compte
 * (`propagation`). Trois restent réservées à `finance:read`, et ce n'est pas un
 * oubli : la marge par CANAL et le délai de paiement décrivent l'espace entier
 * (les découper par portefeuille ne veut rien dire), et la capacité décrit
 * l'ÉQUIPE — un consultant n'a pas de propriétaire commercial, et lui en inventer
 * un pour les besoins d'un filtre serait de la donnée fabriquée.
 *
 * ⚠️ Ce paragraphe disait « TROIS routes » et en comptait quatre depuis le
 * 26/08 : `propagation` porte `finance:read:own` et restreint bien son CA par
 * compte. Corrigé le 28/08/2026 — un décompte faux dans une doctrine se recopie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET DEPUIS LE 28/08 : C'EST L'APPELANT QUI DIT SON PÉRIMÈTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * La portée se DÉDUISAIT du seul droit : porter `finance:read` valait
 * `{ kind: 'workspace' }`, sans que personne ne demande rien. Le bloc 2 du
 * cockpit s'appelle « **Mon** chiffre d'affaires » et montrait donc, sur un
 * siège `owner`, `admin` ou `finance`, le chiffre de toute l'ESN.
 *
 * Le droit reste un PLAFOND — il décide de ce qu'on a le droit de voir au
 * maximum — et `?scope=own` décide de ce qu'on DEMANDE à l'intérieur. Le défaut
 * reste « l'espace » pour qui y a droit : `/pilotage/finance` et le pont du
 * copilote ne changent pas de réponse.
 */
@Controller('delivery/finance')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class FinanceController {
  constructor(
    private readonly revenue: RevenueService,
    private readonly scores: MissionScoresService,
    private readonly propagationService: PropagationService,
    private readonly workspaceContext: WorkspaceContextService,
    // #2425 — le prévisionnel par horizon.
    private readonly horizons: ForecastHorizonsService,
  ) {}

  private async scope(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }

  /**
   * La portée de CET utilisateur : l'espace entier, ou son seul périmètre.
   *
   * ⚠️ `financeAccess` rend DEUX choses qui ne se remplacent jamais : le
   * PÉRIMÈTRE (« qu'est-ce qui m'est rattaché ? ») et le DROIT (« ai-je le droit
   * de voir la marge d'équipe ? »). Les fondre en une seule valeur ferait lire
   * « pas ton périmètre » à un refus de droit, et l'inverse — deux phrases qui
   * font chercher la panne à deux endroits opposés.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE DROIT EST UN PLAFOND, LA DEMANDE CHOISIT DESSOUS
   * ─────────────────────────────────────────────────────────────────────────
   * `finance:read` ne veut pas dire « voit l'espace », il veut dire « a le droit
   * de voir l'espace ». La méthode le lisait comme une décision, et rendait
   * `workspace` à tout porteur du droit : le cockpit, qui écrit « **Mon**
   * chiffre d'affaires », montrait alors celui de toute l'ESN.
   *
   * Sans `finance:read`, `own` reste FORCÉ quoi que l'appelant demande — un
   * `?scope=workspace` ne peut rien ouvrir. La demande ne fait que RESSERRER.
   *
   * `extraPermissionsOf` et non `can(role, [], …)` : les permissions accordées
   * membre par membre sont ADDITIVES, et les ignorer ici les rendrait sans
   * effet — le défaut trouvé sur la liste des missions le 22/08.
   */
  private async financeAccess(
    userId: string,
    requested?: string,
  ): Promise<{ scope: FinanceScope; canReadFinance: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    const canReadFinance = can(role, extra, 'finance:read')
    const scope: FinanceScope =
      canReadFinance && !wantsOwnScope(requested)
        ? { kind: 'workspace', workspaceId }
        : { kind: 'own', workspaceId, userId }
    return { scope, canReadFinance }
  }

  private async financeScope(userId: string, requested?: string): Promise<FinanceScope> {
    return (await this.financeAccess(userId, requested)).scope
  }

  /**
   * Les QUATRE chiffres, jamais fondus en un seul.
   *
   * ⚠️ `?scope=own` — le bloc 2 du cockpit (« **Mon** chiffre d'affaires »)
   * demande le sien ; `/pilotage/finance` ne demande rien et garde l'espace.
   */
  @Get('revenue')
  @RequirePermission('finance:read', 'finance:read:own')
  async revenueBreakdown(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
    @Query('scope') requestedScope?: string,
    @Query('entity') requestedEntity?: string,
  ): Promise<{ periodMonth: string; lines: unknown[]; scope: FinanceScopeInfo }> {
    const parsed = monthSchema.safeParse(month ?? '')
    const scope = await this.financeScope(user.userId, requestedScope)
    const entity = requestedLegalEntity(requestedEntity)
    const [breakdown, info] = await Promise.all([
      this.revenue.breakdown(scope, parsed.success ? parsed.data : previousMonth(), entity),
      this.revenue.scopeInfo(scope),
    ])
    // La PORTÉE voyage avec les chiffres. Sans elle, un commercial dont rien
    // n'est attribué lirait « 0 € » et en conclurait qu'il n'a rien vendu.
    return { ...breakdown, scope: info }
  }

  /**
   * La marge agrégée de l'espace — ou celle du lecteur, s'il la demande
   * (`?scope=own`) — pondérée par les jours déclarés.
   *
   * ⚠️ Les ALERTES suivent la MÊME portée que l'agrégat, et c'est le point :
   * une alerte de marge tirée sur l'espace entier sous un agrégat restreint
   * enverrait un commercial renégocier le TJM d'une mission qui n'est pas la
   * sienne.
   */
  @Get('margin')
  @RequirePermission('finance:read', 'finance:read:own')
  async margin(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
    @Query('scope') requestedScope?: string,
    @Query('entity') requestedEntity?: string,
  ) {
    const parsed = monthSchema.safeParse(month ?? '')
    const scope = await this.financeScope(user.userId, requestedScope)
    // ⚠️ La MÊME société pour l'agrégat ET pour les alertes. Des alertes tirées
    // sur l'espace entier sous un agrégat filtré enverraient un responsable
    // renégocier le TJM d'une mission portée par une AUTRE société — la jumelle
    // exacte du piège déjà nommé sur la portée par personne.
    const entity = requestedLegalEntity(requestedEntity)
    const [aggregate, alerts, info] = await Promise.all([
      this.revenue.aggregate(scope, parsed.success ? parsed.data : previousMonth(), entity),
      this.revenue.marginAlerts(scope, entity),
      this.revenue.scopeInfo(scope),
    ])
    return { ...aggregate, threshold: alerts.threshold, alerts: alerts.items, scope: info }
  }

  /**
   * Les deux agrégats de propagation SOUS DROIT FINANCIER (§4.3) : le CA cumulé
   * par compte — le bandeau « ce client vous a rapporté X € sur N missions » —
   * et la marge moyenne par consultant.
   *
   * Ici et pas sur `GET /delivery/propagation`, parce que le CA cumulé est
   * l'agrégat PAR COMPTE de la ligne « facturé » servie juste au-dessus : le
   * rendre sous un autre droit que sa propre ligne serait le vrai défaut.
   * `finance:read` voit l'espace, `finance:read:own` restreint au portefeuille
   * de l'appelant (D1) — un commercial doit voir ce que SES clients lui ont
   * rapporté sans obtenir du même geste la marge de ses collègues.
   *
   * ⚠️ La marge par consultant, elle, reste sous `finance:read` SEUL — même
   * raison que `capacity` et `margin-by-channel` : elle décrit l'ÉQUIPE, et un
   * consultant n'a pas de propriétaire commercial. Sans le droit, elle vaut
   * `null`, PRÉSENTE et vide (D45), et `canReadFinance` voyage avec la réponse
   * pour que l'écran distingue « pas ton périmètre » de « pas mesuré ».
   *
   * ⚠️ `?scope=own` ici AUSSI (28/08/2026), et pour la raison qui a fait écrire
   * la route : le bandeau dit « ce client **vous** a rapporté X € ». Sur un
   * siège `owner`, il rendait le CA de l'ESN sous le mot « vous ».
   *
   * ⚠️ Et la réponse porte maintenant `scope` À CÔTÉ de `canReadFinance` — les
   * deux répondent à des questions DIFFÉRENTES. « Je n'ai pas le droit de voir
   * la marge d'équipe » fait demander un accès ; « rien ne m'est rattaché » fait
   * réclamer un portefeuille. Sans le second, une liste de comptes vide se lit
   * « ces clients ne vous ont rien rapporté ».
   */
  @Get('propagation')
  @RequirePermission('finance:read', 'finance:read:own')
  async propagation(
    @CurrentUser() user: CurrentUserPayload,
    @Query('scope') requestedScope?: string,
  ): Promise<FinancePropagationResponse> {
    // `financeAccess` rend le périmètre ET le droit d'une seule résolution :
    // les tirer séparément relisait le rôle deux fois, et laissait la porte
    // ouverte à ce que les deux lectures divergent un jour.
    const { scope, canReadFinance } = await this.financeAccess(user.userId, requestedScope)
    const [digest, info] = await Promise.all([
      this.propagationService.financeDigest(scope, canReadFinance),
      // La MÊME définition du « hors périmètre » que les trois autres lectures
      // — celle du contrat, lue à un seul endroit. La recompter ici en ferait
      // un cinquième énoncé à tenir en phase.
      this.revenue.scopeInfo(scope),
    ])
    return { ...digest, scope: info }
  }

  /**
   * Le délai moyen de paiement, ou ce qu'il manque pour le calculer.
   *
   * `days: null` accompagné de `measurability` : l'écran dit « non mesurable —
   * 3 factures sur les 10 nécessaires » au lieu de rester muet, ce qui fait
   * chercher une panne, ou d'afficher un chiffre calculé sur du bruit.
   *
   * ⚠️ AUCUN `?scope=own`, et pour DEUX raisons qui vont dans le même sens :
   * le délai de paiement décrit l'espace entier (D1 — le découper par
   * portefeuille ne veut rien dire, la ponctualité d'un client ne dépend pas de
   * qui l'a vendu), et il est une MÉDIANE avec un plancher d'observations
   * (`MEASURABILITY_THRESHOLDS.dso`) : restreindre ferait passer presque tous
   * les portefeuilles sous le plancher, et rendrait « non mesurable » un chiffre
   * qui l'est parfaitement à l'échelle de l'espace.
   *
   * ⚠️ AUCUN `?entity` non plus, et c'est le MÊME argument : découper une
   * médiane à plancher d'observations par société ferait passer presque toutes
   * les sociétés sous le plancher. Le refus est inscrit au registre partagé
   * (`FINANCE_ENTITY_BLIND_READS`), pour que l'écran puisse le DIRE — un bloc
   * qui ne bouge pas quand on choisit une société se lit comme une panne.
   */
  @Get('dso')
  @RequirePermission('finance:read')
  async dso(@CurrentUser() user: CurrentUserPayload) {
    return this.revenue.dso(await this.scope(user.userId))
  }

  /**
   * La marge par CANAL, et le coût de l'intermédiation.
   *
   * ⚠️ Reste sous `finance:read` seul (D1), et n'accepte AUCUN `?scope=own` :
   * elle compare les canaux de l'ESPACE. La découper par portefeuille rendrait
   * des parts qui ne s'additionnent plus, et sur lesquelles on lancerait un
   * chantier de référencement d'un an.
   *
   * C'est le chiffre qui justifie ou non un chantier de référencement rang 2 →
   * rang 1 : sans lui, la décision se prend au feeling. Sous `finance:read`,
   * comme le reste — un écart de marge est une donnée financière.
   */
  @Get('margin-by-channel')
  @RequirePermission('finance:read')
  async marginChannels(
    @CurrentUser() user: CurrentUserPayload,
    @Query('month') month?: string,
    @Query('entity') requestedEntity?: string,
  ) {
    const parsed = monthSchema.safeParse(month ?? '')
    // ⚠️ Elle refuse `?scope=own` et accepte `?entity`, et ce n'est pas une
    // incohérence : la portée par PERSONNE rendrait des parts qui ne
    // s'additionnent plus (un canal se compare à l'échelle de l'espace), tandis
    // qu'une SOCIÉTÉ est un périmètre commercial complet — ses canaux se
    // comparent entre eux exactement comme ceux de l'espace.
    return this.revenue.marginByChannel(
      await this.scope(user.userId),
      parsed.success ? parsed.data : previousMonth(),
      requestedLegalEntity(requestedEntity),
    )
  }

  /** Le seuil d'alerte de marge de l'espace. `null` éteint. */
  @Patch('margin-threshold')
  @RequirePermission('finance:write')
  async setThreshold(@CurrentUser() user: CurrentUserPayload, @Body() body: MarginThresholdDto) {
    const workspaceId = await this.scope(user.userId)
    await this.revenue.setMarginThreshold(workspaceId, body.thresholdPercent)
    return { thresholdPercent: body.thresholdPercent }
  }

  /**
   * Le prévisionnel — trois lignes, aucune pondération.
   *
   * Multiplier un montant par une « probabilité » produit un chiffre qui
   * n'existera jamais et sur lequel quelqu'un construira un budget. Refusé pour
   * la quatrième fois (arbitrage n°4 du 16/08).
   *
   * ⚠️ `?scope=own` — « ce que J'AI devant moi » est une question de commercial,
   * et ses trois lignes sont bâties sur `missions` et `opportunities`, les deux
   * tables où « mon périmètre » a un sens.
   */
  @Get('forecast')
  @RequirePermission('finance:read', 'finance:read:own')
  async forecast(
    @CurrentUser() user: CurrentUserPayload,
    @Query('months') months?: string,
    @Query('scope') requestedScope?: string,
    @Query('entity') requestedEntity?: string,
  ) {
    const parsed = Number(months)
    const horizon = Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? Math.floor(parsed) : 3
    const scope = await this.financeScope(user.userId, requestedScope)
    const entity = requestedLegalEntity(requestedEntity)
    /**
     * ⚠️ `contractedMargin` voyage À CÔTÉ des trois lignes, jamais dedans.
     *
     * Une quatrième entrée dans `lines` se lirait comme un quatrième MONTANT, et
     * elle est un TAUX. Surtout, elle ne couvre pas la même population : les
     * deux lignes contractualisées seulement — le pipe n'a aucun coût, et lui
     * prêter la marge des deux autres serait une hypothèse déguisée en mesure.
     * Le refus « aucune probabilité » (`c26_probabilite`) reste entier : rien
     * n'est ici multiplié par une chance de signature.
     */
    const [forecast, contractedMargin, info] = await Promise.all([
      this.scores.forecast(scope, horizon, entity),
      this.scores.contractedMargin(scope, horizon, entity),
      this.revenue.scopeInfo(scope),
    ])
    return { ...forecast, contractedMargin, scope: info }
  }

  /**
   * #2425 — le prévisionnel par HORIZON (semaine, mois, trimestre, semestre) :
   * sept composantes, quatre scénarios, trois montants, des décisions.
   *
   * Aucun montant n'y est pondéré (`c26_probabilite`) : un scénario est une
   * SOMME de composantes classées par statut déclaré, avec ses hypothèses.
   *
   * ⚠️ `finance:read` seul, et AUCUN `?scope=own` — c'est une vue d'ÉQUIPE,
   * comme la capacité juste en dessous, dont elle reprend un bloc.
   */
  @Get('forecast/horizons')
  @RequirePermission('finance:read')
  async forecastHorizons(@CurrentUser() user: CurrentUserPayload, @Query('horizon') horizon?: string) {
    const parsed = forecastHorizonSchema.safeParse(horizon)
    return this.horizons.compute(await this.scope(user.userId), parsed.success ? parsed.data : 'month')
  }

  /**
   * #2783 — LE VOLUME DE BONS DE COMMANDE, à l'échelle de l'ESPACE : combien
   * de missions suivies par PO sont ok/à surveiller/dépassées, et combien
   * d'avenants touchent ces mêmes missions (comptés, jamais chiffrés — voir
   * `ForecastHorizonsService.poConsumptionOverview`).
   *
   * `finance:read` seul, même raison que `forecast/horizons` juste au-dessus :
   * une vue d'ÉQUIPE, aucun `?scope=own`.
   */
  @Get('po-overview')
  @RequirePermission('finance:read')
  async poOverview(@CurrentUser() user: CurrentUserPayload): Promise<PoConsumptionOverview> {
    return this.horizons.poConsumptionOverview(await this.scope(user.userId))
  }

  /**
   * Combien de jours l'équipe peut encore vendre.
   *
   * ⚠️ #4016 L8 — RENVERSEMENT DATÉ du 11/10/2026 (Louis : « le commercial voit
   * la capacité d'équipe », `c52_capacite_equipe`) : elle s'ouvre à
   * `finance:read:own`. Un siège `sales` la lit, MAIS c'est toujours celle de
   * l'ÉQUIPE (jamais la sienne) : l'écran la dit « de l'espace ». Avant : sous
   * `finance:read` seul (D1).
   *
   * Elle n'accepte AUCUN `?scope=own` :
   * elle décrit l'ÉQUIPE. Un consultant n'a pas de propriétaire commercial, et
   * lui en inventer un pour les besoins d'un filtre produirait une capacité
   * fausse. Le refus était déjà écrit ici le 26/08 ; il est TENU, pas contourné.
   *
   * ⚠️ AUCUN `?entity` non plus, et la raison ne change pas d'un mot :
   * `consultants` ne porte pas `legal_entity_id`, parce qu'une personne n'est
   * pas rattachée à une société de facturation. Inscrit au registre partagé
   * (`FINANCE_ENTITY_BLIND_READS`) pour que l'écran le dise.
   */
  @Get('capacity')
  @RequirePermission('finance:read', 'finance:read:own')
  async capacity(@CurrentUser() user: CurrentUserPayload, @Query('month') month?: string) {
    const parsed = monthSchema.safeParse(month ?? '')
    return this.scores.capacity(await this.scope(user.userId), parsed.success ? parsed.data : currentMonth())
  }

  /**
   * Les deux scores d'une mission. Pas de `finance:read` requis : ils ne
   * portent aucun montant — la marge n'y entre que comme un AXE, et un axe ne
   * se relit pas en euros.
   */
  @Get('missions/:id/scores')
  async missionScores(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const scores = await this.scores.scores(workspaceId, id)
    if (!scores) return { risk: null, opportunity: null }
    // L'axe « marge » sort du détail pour qui n'a pas le droit de la voir — il
    // est RETIRÉ, jamais mis à zéro, comme partout ailleurs.
    //
    // ⚠️ Les permissions accordées EN PROPRE comptent. `can(role, [], …)`
    // ignorait par construction la moitié du RBAC : un membre à qui l'espace
    // avait accordé `finance:read` nominativement voyait quand même son axe
    // retiré, sans que rien ne le dise.
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, user.userId)
    if (can(role, extra, 'finance:read')) return scores
    return {
      risk: { ...scores.risk, evaluated: scores.risk.evaluated.filter(entry => entry.axis !== 'margin') },
      opportunity: {
        ...scores.opportunity,
        evaluated: scores.opportunity.evaluated.filter(entry => entry.axis !== 'margin'),
      },
    }
  }
}

/** Le mois par défaut de tout l'écran Finance — exporté pour que la chaîne de pilotage lise le MÊME mois (GA-26). */
export function previousMonth(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}
