import { Injectable, Logger, Optional } from '@nestjs/common'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import {
  creditCostOf,
  ORG_ENRICHMENT_WAVE_SIZE,
  measured,
  unknownMeasure,
  type CoverageGap,
  type OrgEnrichmentPlanEstimate,
  type OrgEnrichmentTargetMode,
  type OrgEnrichmentTargetParams,
  type OrgEnrichmentWaveResult,
} from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { CoverageService } from '../coverage-gaps/coverage.service'
import { CreditsService } from '../credits/credits.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import {
  selectEnrichmentCandidates,
  type EnrichmentSelection,
  type TargetableContact,
} from './org-enrichment-targeting'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

export type OrgEnrichmentFailure = {
  code: 'not_found' | 'invalid_params' | 'insufficient_credits' | 'ia_failed'
  message: string
}

/**
 * Planificateur d'enrichissement de l'organigramme (PDF-22 FINAL §11, P1).
 *
 * Cette première étage — `estimate()` — répond à la moitié qui protège
 * l'utilisateur (§11 : « Le coût est annoncé avant plan complet et avant
 * toute vague personnalisée ») : combien de contacts, combien de vagues,
 * combien de crédits, AVANT tout clic de confirmation. Zéro appel réseau,
 * zéro appel modèle — uniquement les contacts déjà en base et, pour
 * `missing_roles`, les zones blanches déjà calculées par `CoverageService`.
 *
 * Le coût passe TOUJOURS par `creditCostOf('targeted_refresh', …)`
 * (`@bellum/contracts`) — jamais un nombre recopié ici. `targeted_refresh`
 * est réutilisé plutôt qu'un nouveau poids inventé : c'est DÉJÀ le poids qui
 * facture un refresh ciblé de la dimension `entities`, qui rappelle la MÊME
 * phase 3 (classify) que ce planificateur met en vagues — une seule tarification
 * pour une seule opération sous-jacente, quel que soit l'écran qui la déclenche.
 */
@Injectable()
export class OrgEnrichmentPlannerService {
  private readonly logger = new Logger(OrgEnrichmentPlannerService.name)

  constructor(
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    // Zones blanches (mode `missing_roles`) — `@Optional()` pour que les specs
    // à constructeur nu restent valides et que le module reste retirable
    // (craft rule 7). Absent ⇒ ce mode précis rend `unknown`, jamais un 0 qui
    // prétendrait un compte entièrement couvert.
    @Optional() private readonly coverage?: CoverageService,
    // Débit APRÈS succès (confirmWave) — même doctrine que verifyOrgRelation.
    // `@Optional()` : sans lui, confirmWave refuse proprement (pas de débit
    // possible ne veut pas dire débit gratuit) plutôt que de faire planter le
    // module en specs à constructeur nu.
    @Optional() private readonly credits?: CreditsService,
    // Le chemin classify RÉEL, borné à une vague — même chemin EXACT que le
    // bouton « Enrichir l'organigramme » (`enrichOrganigram`), voir
    // `enrichOrganigramWave`. `@Optional()` pour la même raison.
    @Optional() private readonly onDemand?: AnalysisOnDemandService,
  ) {}

  /**
   * La sélection COMPLÈTE d'un mode — candidats et libellé — partagée par
   * `estimate` (qui n'en garde que les comptes) et `confirmWave` (qui en a
   * besoin pour savoir QUELS contacts lancer). Un seul calcul : l'estimation
   * affichée et la vague réellement lancée ne peuvent jamais diverger.
   */
  async resolveSelection(
    accountId: string,
    userId: string,
    params: OrgEnrichmentTargetParams,
  ): Promise<Result<{ account: AccountEntity; selection: EnrichmentSelection }, OrgEnrichmentFailure>> {
    const paramError = validateParams(params)
    if (paramError) return failure(paramError)

    // PERF (P5, 29/09 — `enrichment-plan` mesuré à 5,0 s) : le compte et ses
    // contacts se lisaient l'un APRÈS l'autre, et `findByAccount` relisait le
    // compte une 2e fois (son `raw_analysis` complet) rien que pour SCORER des
    // contacts dont le plan n'utilise ni le score ni la décomposition. Les deux
    // lectures partent ensemble et le calcul de score est sauté (`scored:false`,
    // même ordre : priorité puis identité exploitable). Un compte introuvable
    // reste `not_found` ; ses contacts (lus sous la même borne d'espace) sont
    // simplement jetés.
    const [accountResult, rows] = await Promise.all([
      this.accounts.findOne(accountId, userId),
      this.contacts.findByAccount(accountId, userId, null, { scored: false }),
    ])
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    const account = accountResult.output

    const targetable: TargetableContact[] = rows.map(toTargetable)

    const coverageGaps =
      params.mode === 'missing_roles' ? await this.resolveCoverageGaps(accountId, account) : undefined

    const selection = selectEnrichmentCandidates(targetable, params, { coverageGaps })
    return success({ account, selection })
  }

  async estimate(
    accountId: string,
    userId: string,
    params: OrgEnrichmentTargetParams,
  ): Promise<Result<OrgEnrichmentPlanEstimate, OrgEnrichmentFailure>> {
    const resolved = await this.resolveSelection(accountId, userId, params)
    if (isFailure(resolved)) return failure(resolved.problem)
    const { selection } = resolved.output

    const waves = computeWaves(selection.contactsTargeted)

    return success({
      mode: params.mode,
      scopeLabel: selection.scopeLabel,
      contactsTargeted: selection.contactsTargeted,
      waveCount: waves.waveCount,
      waveSize: ORG_ENRICHMENT_WAVE_SIZE,
      estimatedCredits: waves.estimatedCredits,
    })
  }

  /**
   * Lance UNE vague — les {@link ORG_ENRICHMENT_WAVE_SIZE} premiers candidats
   * du périmètre demandé — et débite APRÈS succès (même doctrine que
   * `verifyOrgRelation` : une recherche qui ne trouve rien, ou qui échoue,
   * n'est jamais facturée).
   *
   * ⚠️ CE QUE CE GESTE N'EST PAS : un job persistant. `org-rebuild.queue.ts`
   * pose délibérément `attempts: 1` — rejouer un fan-out LLM entier serait le
   * mauvais réflexe sur un échec, et ce choix n'est PAS défait ici :
   * `enrichOrganigramWave` (le chemin appelé ci-dessous) ne retente rien non
   * plus. « Reprenable » ici veut dire : la vague SUIVANTE ne revoit jamais un
   * contact déjà classé — `family IS NULL` reste le seul filtre d'entrée de
   * `selectEnrichmentCandidates` — donc relancer confirmWave avec le MÊME mode
   * reprend exactement où la précédente s'est arrêtée, sans jamais refaire ce
   * qui est fait. Ce n'est PAS un job à statut persistant (`pending` /
   * `running` / `partial`, avec ses `contactIds` et son historique estimé vs
   * réel) — cette partie de la spec §11 (« job persistant, idempotent ») N'EST
   * PAS livrée : aucune table, aucune file BullMQ dédiée. Le rapport de
   * chantier le nomme explicitement.
   */
  async confirmWave(
    accountId: string,
    userId: string,
    params: OrgEnrichmentTargetParams,
  ): Promise<Result<OrgEnrichmentWaveResult, OrgEnrichmentFailure>> {
    if (!this.onDemand) {
      return failure({ code: 'ia_failed', message: "Le lancement d'une vague n'est pas disponible ici." })
    }

    const resolved = await this.resolveSelection(accountId, userId, params)
    if (isFailure(resolved)) return failure(resolved.problem)
    const { selection } = resolved.output

    if (selection.candidateIds.length === 0) {
      return failure({ code: 'not_found', message: 'Rien à enrichir dans ce périmètre.' })
    }

    if (this.credits && !(await this.credits.hasEnrichmentCredit(userId))) {
      return failure({
        code: 'insufficient_credits',
        message: SOFT_BRAKE_MESSAGE,
      })
    }

    const wave = selection.candidateIds.slice(0, ORG_ENRICHMENT_WAVE_SIZE)
    const runResult = await this.runWave(accountId, userId, params.mode, wave)
    if (isFailure(runResult)) return failure(runResult.problem)

    return success({
      matched: runResult.output.matched,
      waveSize: wave.length,
      creditsDebited: runResult.output.creditsDebited,
      remaining: Math.max(0, selection.candidateIds.length - wave.length),
    })
  }

  /**
   * Lancer UN lot de contacts déjà choisi, et débiter APRÈS succès.
   *
   * Extrait de {@link confirmWave} pour que le job PERSISTANT
   * (`OrgEnrichmentJobService`) rejoue exactement le même chemin — y compris
   * l'ordre débit/succès. Deux implémentations du même geste divergeraient, et
   * la première à diverger serait celle du débit : c'est le genre d'écart qui
   * facture une vague qui n'a pas tourné.
   *
   * ⚠️ **Le débit vient APRÈS le succès, jamais avant.** Une vague qui échoue
   * n'est pas facturée. Le débit lui-même est best-effort (comme
   * `verifyOrgRelation`) : un débit raté ne défait pas une vague acquise — le
   * déséquilibre penche du bon côté, celui de l'utilisateur.
   *
   * #2637.1 (21/09/2026, décision Louis) — `free` (par défaut `false`, donc
   * `confirmWave` ci-dessus et le chemin MANUEL de `OrgEnrichmentJobService`
   * ne le voient jamais) saute UNIQUEMENT `consumeAnalysisSlot` : `cost` est
   * calculé exactement comme le chemin payant et remonte dans
   * `creditsDebited`/`actual_credits` — gratuit pour le client ne veut pas
   * dire invisible pour nous, le coût réel reste mesurable.
   */
  async runWave(
    accountId: string,
    userId: string,
    mode: OrgEnrichmentTargetMode,
    contactIds: readonly string[],
    free = false,
  ): Promise<Result<{ matched: number; creditsDebited: number }, OrgEnrichmentFailure>> {
    if (!this.onDemand) {
      return failure({ code: 'ia_failed', message: "Le lancement d'une vague n'est pas disponible ici." })
    }
    if (contactIds.length === 0) {
      return failure({ code: 'not_found', message: 'Rien à enrichir dans ce périmètre.' })
    }

    const runResult = await this.onDemand.enrichOrganigramWave(accountId, userId, contactIds)
    if (isFailure(runResult)) {
      return failure({ code: 'ia_failed', message: runResult.problem.message })
    }

    const cost = creditCostOf('targeted_refresh', { perimeterUnits: contactIds.length })
    if (!free) {
      await this.credits
        ?.consumeAnalysisSlot(userId, {
          reason: `planificateur d'enrichissement organigramme : ${mode}`,
          accountId,
          cost,
        })
        .catch(() => undefined)
    }

    return success({ matched: runResult.output.matched, creditsDebited: cost })
  }

  /**
   * Le compte, résolu par le chemin d'accès NORMAL — scopé par utilisateur.
   *
   * Exposé pour que le job persistant retrouve l'ESPACE d'un dossier sans
   * charger ses contacts : lire un job par son seul `account_id` ouvrirait la
   * porte d'un espace à un autre, et refaire une sélection complète pour en
   * extraire un `workspace_id` serait payer une requête de trop.
   */
  async resolveAccount(accountId: string, userId: string): Promise<Result<AccountEntity, OrgEnrichmentFailure>> {
    const accountResult = await this.accounts.findOne(accountId, userId)
    if (isFailure(accountResult)) {
      return failure({ code: 'not_found', message: accountResult.problem.message })
    }
    return success(accountResult.output)
  }

  /** Y a-t-il de quoi lancer une vague ? Séparé du lancement : un job qui se
   *  crée doit pouvoir refuser AVANT d'avoir écrit quoi que ce soit. */
  async hasCredit(userId: string): Promise<boolean> {
    if (!this.credits) return true
    return this.credits.hasEnrichmentCredit(userId)
  }

  /**
   * `null` = service indisponible (constructeur nu / module retiré) — une
   * absence RÉELLE. `account.workspace_id` absent (ligne antérieure au
   * multi-espace) rend le MÊME `null` : la couverture ne se calcule pas sans
   * portée d'espace, et le dire honnêtement vaut mieux qu'un 0 qui
   * prétendrait un compte entièrement couvert.
   */
  private async resolveCoverageGaps(
    accountId: string,
    account: { workspace_id: string | null },
  ): Promise<CoverageGap[] | null> {
    if (!this.coverage || !account.workspace_id) return null
    try {
      const response = await this.coverage.computeForAccount(accountId, account.workspace_id, {
        rawAnalysis: (account as { raw_analysis?: Record<string, unknown> | null }).raw_analysis,
      })
      return response.gaps
    } catch (err) {
      this.logger.warn('Zones à couvrir illisibles pour le planificateur', { accountId, error: err })
      return null
    }
  }
}

function validateParams(params: OrgEnrichmentTargetParams): OrgEnrichmentFailure | null {
  if (params.mode === 'direction' && !params.entity) {
    return { code: 'invalid_params', message: 'Le mode « Cette direction » demande une entité.' }
  }
  if (params.mode === 'hierarchy_level' && (!params.hierarchyLevels || params.hierarchyLevels.length === 0)) {
    return { code: 'invalid_params', message: 'Le mode « Niveau hiérarchique » demande au moins un niveau.' }
  }
  return null
}

function toTargetable(row: {
  id: string
  full_name: string
  title: string | null
  entity: string | null
  family: string | null
  priority: number | null
}): TargetableContact {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    entity: row.entity,
    family: row.family,
    priority: row.priority,
  }
}

/**
 * Combien de vagues de {@link ORG_ENRICHMENT_WAVE_SIZE}, et leur coût TOTAL —
 * la somme de chaque vague, chacune plafonnée par `creditCostOf`. Une absence
 * en entrée (`contactsTargeted` non mesuré) reste non mesurée en sortie : un
 * coût ne se déduit jamais d'un périmètre qu'on n'a pas pu compter.
 */
function computeWaves(contactsTargeted: OrgEnrichmentPlanEstimate['contactsTargeted']): {
  waveCount: OrgEnrichmentPlanEstimate['waveCount']
  estimatedCredits: OrgEnrichmentPlanEstimate['estimatedCredits']
} {
  if (contactsTargeted.status === 'unknown') {
    return {
      waveCount: unknownMeasure(contactsTargeted.reason),
      estimatedCredits: unknownMeasure(contactsTargeted.reason),
    }
  }

  const total = contactsTargeted.value
  if (total <= 0) return { waveCount: measured(0), estimatedCredits: measured(0) }

  const waveCount = Math.ceil(total / ORG_ENRICHMENT_WAVE_SIZE)
  let remaining = total
  let credits = 0
  for (let i = 0; i < waveCount; i += 1) {
    const size = Math.min(ORG_ENRICHMENT_WAVE_SIZE, remaining)
    credits += creditCostOf('targeted_refresh', { perimeterUnits: size })
    remaining -= size
  }

  return { waveCount: measured(waveCount), estimatedCredits: measured(credits) }
}
