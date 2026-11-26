import { workedAccountSql } from '../accounts/account-worked'
import { withoutHomonymResearchFacts } from '../accounts/research-homonym-facts'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { HistoricalNeedsBlock, ReadSignalLayers } from '@bellum/contracts'
import type {
  AnalysisContactMessage,
  AnalysisContactSeed,
  AnalysisEnrichedContact,
  AnalysisPlanData,
  AnalysisResearchData,
  AnalysisScopeSelection,
} from '@bellum/contracts'
import { contactsOutOfScopeSchema, mergeOrgGraphDelta, orgGraphSchema } from '@bellum/contracts'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ProjectsService } from '../projects/projects.service'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { ProvenanceService } from '../crm-core/provenance.service'
import { AccountVocabularyService } from './account-vocabulary.service'
import { ActionPlansService } from './action-plans.service'
import { AnalysisEventEmitter } from './analysis-event-emitter.service'
import { AttackAnglesService } from './attack-angles.service'
import { sharedSeedsForAccount } from '../shared-base/shared-company-facts-writes'

/** Convert the Pappers ``executives`` block to AnalysisContactSeed rows.
 *
 *  - Drops entries without at least one of first_name / last_name.
 *  - Uses the headquarters city/country so Apollo gets a geographic hint
 *    when it searches for the same person.
 *  - Source is ``pappers`` so we can later differentiate them from Phase 2
 *    Claude findings.
 */
function pappersExecutivesToSeeds(research: Record<string, unknown>): AnalysisContactSeed[] {
  const raw = research['executives']
  if (!Array.isArray(raw)) return []
  const hq = (research['headquarters'] as Record<string, unknown> | undefined) ?? {}
  const city = typeof hq['city'] === 'string' ? (hq['city'] as string) : ''
  const country = typeof hq['country'] === 'string' ? (hq['country'] as string) : 'France'
  const seeds: AnalysisContactSeed[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const firstName = typeof e['first_name'] === 'string' ? (e['first_name'] as string) : ''
    const lastName = typeof e['last_name'] === 'string' ? (e['last_name'] as string) : ''
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
    if (!fullName) continue
    seeds.push({
      fullName,
      title: typeof e['role'] === 'string' ? (e['role'] as string) : '',
      linkedinUrl: '',
      city,
      country,
      source: 'pappers',
    })
  }
  return seeds
}

/** SIG-B (11/10/2026) — les recruteurs NOMMÉS par une offre d'emploi publiée et
 *  GARDÉE (``research.jobRecruiters``, phase 1) en seeds de contact.
 *
 *  - Une entrée sans nom ou sans URL d'offre est ignorée : la preuve doit se
 *    vérifier, jamais un recruteur sans son offre.
 *  - Le rôle est celui que l'offre donne (``title``), jamais reformulé.
 *  - Source ``job_posting`` ; la preuve voyage dans ``jobPosting`` →
 *    ``contact.raw_data.jobPosting``.
 */
function jobRecruitersToSeeds(research: Record<string, unknown>): AnalysisContactSeed[] {
  const raw = research['jobRecruiters']
  if (!Array.isArray(raw)) return []
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  const seeds: AnalysisContactSeed[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const e = entry as Record<string, unknown>
    const proof = (typeof e['jobPosting'] === 'object' && e['jobPosting'] !== null ? e['jobPosting'] : {}) as Record<
      string,
      unknown
    >
    const fullName = text(e['fullName'])
    const url = text(proof['url'])
    if (!fullName || !url) continue
    const postedAt = text(proof['postedAt'])
    seeds.push({
      fullName,
      title: text(e['role']),
      linkedinUrl: text(e['linkedinUrl']),
      city: '',
      country: '',
      source: 'job_posting',
      jobPosting: { title: text(proof['title']), url, ...(postedAt ? { postedAt } : {}) },
    })
  }
  return seeds
}

/** Apollo person id persisted on a contact row (``raw_data.apolloId``).
 *
 *  Read defensively: `raw_data` is untyped jsonb and predates the id, so a legacy
 *  row must yield `undefined` rather than throw while a resume is rebuilding its
 *  payloads. */
function readApolloId(row: { raw_data?: Record<string, unknown> | null }): string | undefined {
  const id = row.raw_data?.['apolloId']
  return typeof id === 'string' && id.trim() ? id : undefined
}

type PhaseEventContext = {
  jobId: string
  correlationId?: string
}

/**
 * Thin orchestrator that maps each IA phase to the underlying services.
 * Centralising the wiring here keeps the worker focused on orchestration
 * and lets the services own their entity-level rules.
 *
 * **TX guarantee**: each ``save<Phase>`` method wraps the underlying DB
 * writes AND the matching ``analysis.phase_completed`` outbox event in a
 * single transaction. This makes the outbox the *single source of truth*
 * for resume — an event exists iff the corresponding data write
 * committed. A crash between the two is impossible by construction.
 */
@Injectable()
export class AnalysisPersistenceService {
  private readonly logger = new Logger(AnalysisPersistenceService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly attackAngles: AttackAnglesService,
    private readonly vocabulary: AccountVocabularyService,
    private readonly actionPlans: ActionPlansService,
    private readonly events: AnalysisEventEmitter,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly opportunities: ProjectsService,
    private readonly signalHistory: SignalHistoryService,
    // #3219 (#190.2, lot P02 07/10) — le premier écrivain RÉEL de `scope` :
    // `AccountsService.applyResearch` REND une claim pure (il ne peut pas
    // joindre `ProvenanceService` sans faire monter GA-07 depuis `accounts`),
    // cette façade la COMMIT — elle importe déjà cinq services d'autres
    // modules (GA-07 est une mesure de fichier, pas de plafond par import).
    // `@Optional()` et en DERNIÈRE position, même raison que les repositories
    // optionnels d'`AccountsService` : son absence (constructeur nu, test
    // direct) ne coûte qu'un journal non tenu, jamais un run cassé.
    @Optional() private readonly provenance?: ProvenanceService,
  ) {}

  async saveResearch(
    accountId: string,
    userId: string,
    data: AnalysisResearchData | undefined,
    ctx?: PhaseEventContext,
  ): Promise<void> {
    if (!data) return
    // LUDOVIC-D LC.2 — À LA COLLECTE : ni signal ni angle d'un homonyme (« Still Waters Farm » sur STILL).
    data = withoutHomonymResearchFacts(data).data
    // Multi-user Phase 2: stamp the attack_angles / account_vocabulary rows this
    // phase writes with the run owner's active workspace, so the (now
    // workspace-scoped) team reads see them. It's a background job — no request
    // scope — so we resolve the workspace by the owner's userId directly.
    // Today this is the user's single owned workspace (1 user = 1 workspace), so
    // behaviour is identical. See agent_docs/multi-user-workspaces.md.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // #4616 — l'appel HTTP à l'IA (jusqu'à 5 s) part AVANT la transaction : dedans, il tenait la connexion.
    const groupAffiliation = await this.accounts.groupAffiliationFor(data.siren)
    let employeesScopeClaim: { oldValue: string | null; newValue: string; scope: string } | undefined
    await this.dataSource.transaction(async manager => {
      // #2671 — la lecture de compte des deux gardes internes
      // (`refuseIdentityRewrite`, `arbitrate`) porte désormais sa borne
      // d'espace ; `workspaceId` vient d'être résolu juste au-dessus.
      const applied = await this.accounts.applyResearch(accountId, data, manager, { workspaceId, groupAffiliation })
      employeesScopeClaim = applied?.employeesScopeClaim
      await this.attackAngles.bulkInsert(accountId, userId, workspaceId, data.angles ?? [], manager)
      // Promote the group's reading grid out of the blob into account_vocabulary
      // (merge — preserves any prior enrichment). Théo's "actif de donnée".
      await this.vocabulary.saveVocabulary(accountId, userId, workspaceId, data.accountVocabulary, manager)
      // Only the pipeline worker passes ``ctx`` — on-demand patches skip
      // the checkpoint so they don't make the next pipeline run "skip"
      // a freshly-requested phase.
      if (ctx) {
        await this.events.phaseCompleted(
          { jobId: ctx.jobId, accountId, phase: 'research', percent: 40, correlationId: ctx.correlationId },
          manager,
        )
      }
    })
    // Historise les signaux qui viennent d'être écrits (V2 §11) : première
    // détection, changement, fraîcheur, disparition. OUTSIDE la transaction et
    // best-effort (le service avale ses erreurs) — un accroc d'historisation ne
    // doit jamais faire échouer une phase de recherche qui, elle, a abouti.
    await this.signalHistory.materialize(accountId)
    // #3219 (#190.2) — même porte que `signalHistory` juste au-dessus : OUTSIDE
    // la transaction (la claim ne vaut que si l'écriture a RÉELLEMENT abouti,
    // et on ne veut pas faire dépendre le commit TypeORM de celui, séparé, de
    // `ProvenanceService`) et best-effort — un journal manqué ne doit jamais
    // faire échouer une phase de recherche qui, elle, a abouti.
    if (this.provenance && employeesScopeClaim) {
      try {
        await this.provenance.commit({
          workspaceId,
          entityType: 'account',
          entityId: accountId,
          source: 'pipeline',
          actorId: null,
          changes: [{ field: 'employees', ...employeesScopeClaim }],
        })
      } catch (error) {
        this.logger.error('saveResearch : la claim de portée (#3219) n’a pas pu être journalisée', {
          error,
          accountId,
        })
      }
    }
  }

  /**
   * Seed contact entities from the Pappers ``executives`` block embedded
   * in the raw research payload. Runs right after :meth:`saveResearch` so
   * Phase 2 (Apollo contacts) and Phase 3 (Claude classification) operate
   * on a merged contact set. ``bulkInsert`` dedupes against existing rows
   * so subsequent phases never re-create the same person.
   *
   * Not wrapped in its own TX/event — this is a refinement of the
   * research step, not a separate phase. If the insert crashes, the
   * research checkpoint still stands and Phase 2 will reseed from Pappers
   * on next attempt (idempotent by full_name).
   */
  async seedPappersContacts(
    accountId: string,
    userId: string,
    research: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!research) return
    const seeds = pappersExecutivesToSeeds(research)
    if (!seeds.length) return
    this.logger.log('seedPappersContacts', { accountId, count: seeds.length })
    await this.contacts.bulkInsert(accountId, userId, seeds)
  }

  /**
   * SIG-B — les recruteurs nommés par une offre gardée deviennent des contacts
   * CANDIDATS, par la porte contacts EXISTANTE (``bulkInsert``) : dédoublonnage
   * (profil, puis nom), empreinte d'effacement RGPD vérifiée à l'entrée,
   * correction humaine protégée au pliage. AUCUN enrichissement déclenché :
   * c'est le commercial qui décide d'enrichir. Même place et même tolérance que
   * {@link seedPappersContacts}.
   */
  async seedJobRecruiterContacts(
    accountId: string,
    userId: string,
    research: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (!research) return
    const seeds = jobRecruitersToSeeds(research)
    if (!seeds.length) return
    this.logger.log('seedJobRecruiterContacts', { accountId, count: seeds.length })
    await this.contacts.bulkInsert(accountId, userId, seeds)
  }

  /** Persiste les contacts trouvés et rend le nombre de lignes RÉELLEMENT créées.
   *  Ce n'est pas ``items.length`` : un contact déjà présent est fusionné dans sa
   *  ligne, une identité insuffisante est refusée. C'est ce nombre-là qu'un
   *  écran peut annoncer sans mentir. */
  async saveContacts(
    accountId: string,
    userId: string,
    items: AnalysisContactSeed[] | undefined,
    ctx?: PhaseEventContext,
  ): Promise<number> {
    let created = 0
    // #3989 (Louis 11/10/2026, `c94_base_commune_capitalise_tout`) — ce que la
    // base commune sait déjà de la société : ses faits publics NOMMÉS, recopiés
    // en seeds `shared_base` (« base commune », jamais l'espace qui les a
    // collectés). Lue HORS transaction et sans jamais lever : une base commune
    // en panne ne coûte que sa recopie, jamais la collecte de l'espace.
    const shared = await sharedSeedsForAccount(this.dataSource, accountId).catch(error => {
      this.logger.warn('Base commune illisible — collecte de l’espace seule', { accountId, error })
      return []
    })
    // #4616 — l'espace et les empreintes effacées lus AVANT la transaction (comme `saveResearch`) : lus
    // dedans, ils prenaient une deuxième connexion pendant que la transaction tenait la première, et N analyses
    // simultanées se tenaient mutuellement le pool (« timeout exceeded when trying to connect »).
    const prepared = await this.contacts.prepareBulkInsert(userId)
    await this.dataSource.transaction(async manager => {
      const rows = await this.contacts.bulkInsert(accountId, userId, items ?? [], manager, prepared)
      created = rows.length
      // APRÈS la collecte de l'espace : une personne que l'espace a trouvée lui-même
      // garde sa propre source. Même porte (`bulkInsert`) : une personne effacée de
      // cet espace est refusée, une correction humaine n'est jamais écrasée
      // (`applyFieldUpdates`), aucun crédit n'est débité.
      if (shared.length > 0)
        created += (await this.contacts.bulkInsert(accountId, userId, shared, manager, prepared)).length
      // #AF.2 — la date de CETTE collecte, que le ciblage du rattrapage (#2543)
      // compare à la capacité. Inconditionnel : un rafraîchissement ciblé
      // (`enrichContacts`, sans `ctx`) doit dater tout autant que le pipeline
      // complet, et une collecte qui ne trouve rien reste une collecte faite.
      await this.accounts.applyContactsCollectedAt(accountId, new Date(), manager)
      if (ctx) {
        await this.events.phaseCompleted(
          { jobId: ctx.jobId, accountId, phase: 'contacts', percent: 70, correlationId: ctx.correlationId },
          manager,
        )
      }
    })
    return created
  }

  /**
   * #4142.6 — les SIREN « déjà travaillés » du CRM de l'espace : un compte au statut client, ou portant au
   * moins une affaire gagnée. Lu SEULEMENT quand le cadrage demande d'écarter ces comptes ; sans espace
   * résolu, ensemble vide (rien n'est écarté — non mesuré, jamais deviné).
   */
  async workedSirens(workspaceId: string | null | undefined): Promise<Set<string>> {
    if (!workspaceId) return new Set()
    const rows: Array<{ siren: string }> = await this.dataSource.query(
      `SELECT DISTINCT account.siren AS siren
         FROM accounts account
        WHERE account.workspace_id = $1
          AND account.siren ~ '^[0-9]{9}$'
          AND ${workedAccountSql('account', '$1')}`,
      [workspaceId],
    )
    return new Set(rows.map(row => row.siren))
  }

  /** #3742/#3744 — écarte (sans supprimer) les contacts déjà au dossier qui sortent
   *  du périmètre géographique de CETTE relance. No-op sans périmètre France/Europe. */
  async excludeContactsOutsideGeo(accountId: string, selection: AnalysisScopeSelection | undefined): Promise<number> {
    return this.contacts.excludeOutsideGeoPerimeter(accountId, selection)
  }

  /** LUDB.5 — écarte (sans supprimer) les contacts déjà rattachés dont l'employeur est un homonyme. */
  async excludeHomonymContacts(
    accountId: string,
    website: string | null | undefined,
    workspaceId?: string | null,
  ): Promise<number> {
    return this.contacts.excludeHomonymContacts(accountId, website, [], workspaceId)
  }

  /**
   * #3742 — les noms des contacts de ce compte ÉCARTÉS par le périmètre
   * géographique (motif posé par `excludeOutsideGeoPerimeter`). L'organigramme
   * retire les nœuds qui leur correspondent ; un contact réintégré à la main
   * (`restoreContact` efface le motif) n'y figure plus.
   */
  async geoExcludedContactNames(accountId: string): Promise<string[]> {
    return this.contacts.geoExcludedNames(accountId)
  }

  async saveEnriched(
    accountId: string,
    items: AnalysisEnrichedContact[] | undefined,
    ctx?: PhaseEventContext,
    /** #3219 (#190.2) — le périmètre déclaré par le run ; transmis tel quel, jamais deviné. */
    scopeMode?: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      if (items?.length) {
        const matched = await this.contacts.applyEnrichment(accountId, items, manager, scopeMode)
        this.logger.log('saveEnriched matched', { accountId, matched, total: items.length })
      }
      if (ctx) {
        // Even on empty payload we emit the checkpoint — Phase 3 ran and
        // returned nothing (rare but possible: org with no identifiable
        // decision-makers). Re-running on resume would burn the same
        // tokens for the same null result.
        await this.events.phaseCompleted(
          { jobId: ctx.jobId, accountId, phase: 'classify', percent: 85, correlationId: ctx.correlationId },
          manager,
        )
      }
    })
  }

  /** Persist the phase-2 « X écartés (hors périmètre) » block into
   *  ``raw_analysis.contacts_out_of_scope``.
   *
   *  No-op on an absent or empty block — that is the normal case (nothing was
   *  dropped, or the IA predates the field), and writing a `0` there would put a
   *  misleading "0 écarté" on the dossier instead of nothing at all. */
  async saveContactsOutOfScope(accountId: string, block: unknown): Promise<void> {
    const parsed = contactsOutOfScopeSchema.safeParse(block)
    if (!parsed.success || parsed.data.dropped <= 0) return
    await this.accounts.applyContactsOutOfScope(accountId, parsed.data)
  }

  /**
   * Persist the Phase-3 org graph into ``raw_analysis.org`` (decisionChain /
   * uncoveredZones / stakeholderMap / approachOrder). No-op on an empty graph.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * FUSION PAR DELTA (31/08/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * `touchedPersonIds` NON VIDE = ce graphe entrant est le produit d'une VAGUE,
   * pas d'un run complet. La phase 3 réassemble un graphe entier à partir des
   * seules personnes qu'on lui a envoyées : l'écrire tel quel remplaçait un
   * graphe de 2 241 personnes par un graphe de 50, et défaisait à chaque vague
   * ce que la précédente venait d'apprendre.
   *
   * On fusionne donc — seules les personnes touchées sont recalculées, champ
   * par champ, sous l'arbitrage de `applyFieldUpdates` : **une correction
   * humaine gagne toujours**. Les champs qu'un humain a posés sont lus dans le
   * ledger `org_graph_corrections` (non annulés) et déclarés intouchables.
   *
   * `touchedPersonIds` VIDE = run complet, chemin byte-identique à avant.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LA VALEUR DE RETOUR (#2755, 23/09/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * `true` si un graphe a RÉELLEMENT été écrit, `false` sur le no-op. Sans
   * elle, `enrichOrganigram` ne pouvait pas distinguer « l'IA n'a rien
   * assemblé cette fois » d'un succès, et disait « organigramme mis à jour »
   * sur un onglet resté à l'état vide — mesuré en beta : un clic sur
   * « Enrichir la carte » qui semble réussir, sans jamais faire apparaître
   * de graphe.
   */
  async saveOrgChart(
    accountId: string,
    org: Record<string, unknown> | undefined,
    options?: { touchedPersonIds?: readonly string[] },
  ): Promise<boolean> {
    if (!org || Object.keys(org).length === 0) return false
    const touched = options?.touchedPersonIds ?? []
    await this.accounts.applyOrgChart(
      accountId,
      touched.length === 0 ? org : await this.mergeDelta(accountId, org, touched),
    )
    // #2543.7 — la date de CETTE collecte du segment entités (Phase 3
    // organigramme), que le ciblage du rattrapage (#2543) comparera à une
    // future capacité datée sur ce segment. Inconditionnel comme
    // `applyContactsCollectedAt` : atteint seulement quand un graphe a
    // RÉELLEMENT été écrit (le early-return au-dessus couvre le cas vide).
    await this.accounts.applyEntitiesCollectedAt(accountId, new Date())
    return true
  }

  /**
   * Fusionne le graphe d'une vague dans celui qui est stocké.
   *
   * Sur le moindre doute — pas de graphe lisible en base, graphe entrant
   * illisible — on rend l'entrant TEL QUEL : c'est le comportement d'avant ce
   * lot, donc jamais une régression, et une fusion qu'on ne sait pas faire ne
   * doit pas se deviner.
   */
  private async mergeDelta(
    accountId: string,
    org: Record<string, unknown>,
    touchedPersonIds: readonly string[],
  ): Promise<Record<string, unknown>> {
    try {
      const rows: Array<{ raw_analysis: Record<string, unknown> | null }> = await this.dataSource.query(
        'SELECT raw_analysis FROM accounts WHERE id = $1 LIMIT 1',
        [accountId],
      )
      const storedOrg = rows[0]?.raw_analysis?.['org'] as Record<string, unknown> | undefined
      const current = orgGraphSchema.safeParse(storedOrg?.['orgGraph'])
      const incoming = orgGraphSchema.safeParse(org['orgGraph'])
      if (!current.success || !incoming.success) return org

      const merged = mergeOrgGraphDelta({
        current: current.data,
        incoming: incoming.data,
        touchedPersonIds,
        humanHeldFields: await this.humanHeldFields(accountId),
      })
      return { ...org, orgGraph: merged }
    } catch (err) {
      this.logger.warn('Fusion par delta impossible — le graphe de la vague est écrit tel quel', {
        accountId,
        error: err,
      })
      return org
    }
  }

  /**
   * `personId` → champs qu'un humain a corrigés, depuis le ledger.
   *
   * Une correction ANNULÉE (`reverted_at`) n'en est plus une : la ligne reste
   * (on archive, on ne supprime pas), mais elle ne protège plus rien.
   */
  private async humanHeldFields(accountId: string): Promise<Record<string, string[]>> {
    const rows: Array<{ object_id: string; field: string }> = await this.dataSource.query(
      `SELECT DISTINCT object_id, field
         FROM org_graph_corrections
        WHERE account_id = $1 AND reverted_at IS NULL AND object_type = 'person'
          -- #2126.44 — une correction personnelle ne protège rien dans la base partagée.
          AND scope <> 'personal' AND motive IN ('corrected', 'obsolete', 'confirmed')`,
      [accountId],
    )
    const held: Record<string, string[]> = {}
    for (const row of rows) {
      held[row.object_id] = [...(held[row.object_id] ?? []), row.field]
    }
    return held
  }

  /** Persist the anti-hallucination Judge verdict into ``raw_analysis.judge``
   *  ({issues, confidence, passed, verdict, checks, researchConfidence}). The
   *  verdict is advisory (surfaced in the dossier, never a gate). No phase
   *  outbox event — the Judge is not a resumable phase. No-op on an empty
   *  verdict. Same JSONB shallow-merge as ``saveOrgChart``. */
  async saveJudge(accountId: string, verdict: Record<string, unknown> | undefined): Promise<void> {
    if (!verdict || Object.keys(verdict).length === 0) return
    await this.accounts.applyJudge(accountId, verdict)
  }

  /**
   * #4760 — les besoins HISTORIQUES nommés (signaux et offres rangés en archive par la fenêtre de
   * fraîcheur), lus depuis `raw_analysis.signal_layers`. Appelant : `AnalysisWorker.recordHistoricalNeeds`.
   */
  async readSignalLayers(accountId: string): Promise<ReadSignalLayers> {
    return this.accounts.readSignalLayers(accountId)
  }

  /**
   * #4760 — NOMME les besoins historiques dans le dossier : `raw_analysis.historical_needs` (libellé, date
   * réelle, source, total). Fusion JSONB superficielle, comme `saveJudge` : rien d'autre du dossier n'est
   * touché. `null` retire la clé — un fait périmé redevient inconnu, il ne reste pas affiché.
   */
  async saveHistoricalNeeds(accountId: string, block: HistoricalNeedsBlock | null): Promise<void> {
    if (block === null) {
      await this.dataSource.query(
        `UPDATE accounts SET raw_analysis = raw_analysis - 'historical_needs'
          WHERE id = $1 AND raw_analysis ? 'historical_needs'`,
        [accountId],
      )
      return
    }
    await this.dataSource.query(
      `UPDATE accounts
          SET raw_analysis = COALESCE(raw_analysis, '{}'::jsonb) || jsonb_build_object('historical_needs', $1::jsonb)
        WHERE id = $2`,
      [JSON.stringify(block), accountId],
    )
  }

  /**
   * Les offres d'emploi que l'analyse a écrites dans le dossier.
   *
   * Lues DEPUIS la base, et non retenues en mémoire pendant le run : le dossier
   * est la source, et une copie divergerait dès qu'une phase tardive corrige une
   * offre. Une offre sans intitulé est écartée ici — proposer « (sans titre) »
   * à qualifier demande d'aller lire la source pour comprendre, c'est-à-dire le
   * travail qu'on prétendait épargner.
   */
  async readJobSignals(
    accountId: string,
  ): Promise<
    { title: string; skills: string[]; location: string | null; sourceUrl: string | null; detectedAt: string | null }[]
  > {
    const rows = await this.accounts.readJobSignals(accountId)
    return rows
      .map(row => ({
        title: String(row?.['intitule'] ?? row?.['title'] ?? '').trim(),
        skills: Array.isArray(row?.['competences']) ? (row['competences'] as string[]).map(String) : [],
        location: (row?.['lieu'] ?? row?.['location'] ?? null) as string | null,
        sourceUrl: (row?.['url'] ?? row?.['source_url'] ?? null) as string | null,
        detectedAt: (row?.['date'] ?? row?.['datePublication'] ?? null) as string | null,
      }))
      .filter(row => row.title.length > 0)
  }

  /**
   * #3978 — après un rejeu de RECHERCHE seule (« Actualiser », veille quotidienne,
   * rattrapage ciblé du segment `signals`) : pains, enjeux et signaux viennent d'être
   * reclassés par domaine dans `raw_analysis`, leurs pistes existantes reçoivent ce
   * domaine là où il manque — jamais plus (aucune piste créée, aucun domaine posé écrasé).
   */
  async refreshOpportunityDomains(accountId: string): Promise<void> {
    await this.opportunities.fillClassifiedDomains(accountId)
  }

  async savePlan(
    accountId: string,
    userId: string,
    data: AnalysisPlanData | undefined,
    ctx?: PhaseEventContext,
  ): Promise<void> {
    // Multi-user Phase 2: stamp the action_plans row with the run owner's active
    // workspace (same rationale as saveResearch). Resolved outside the TX so the
    // lookup never holds the write transaction open. See
    // agent_docs/multi-user-workspaces.md.
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // Snapshot the score BEFORE the plan write so the Historique can journal a
    // real movement (§8). Best-effort — a read blip must never block the plan.
    const previousScore = await this.readPriorityScoreSafe(accountId, workspaceId)
    // #2306.15 — la version du profil ESN qui a conditionné CE run vivait déjà
    // sur `analysis_runs.profile_provenance` (recette finale §13, lue par
    // `AccountsController.getProfileProvenance`), mais pas sur le bloc
    // `dossier_read` lui-même : un score consulté loin de son run n'avait
    // aucun moyen de dire avec quel profil il avait été lu. Mutation en place,
    // AVANT `applyPlan`, pour que la valeur voyage dans le MÊME JSON persisté.
    await this.attachEsnProfileVersion(accountId, data)
    // LOIC-FIX O.1 — une étape non faite ne se déclare jamais faite. Un plan qui
    // arrive SANS messages (étape « messages » interrompue par un redémarrage,
    // dégradée ou sans personne) le dit dans le dossier lui-même
    // (`raw_analysis.plan.messagesStatus`) : l'écran ne peut plus confondre « rien
    // à rédiger » et « rédaction non faite ». Posé AVANT `applyPlan`, dans le MÊME
    // JSON persisté, comme la version du profil ESN ci-dessus.
    if (data && !(data as { contactMessages?: unknown[] }).contactMessages?.length) {
      ;(data as { messagesStatus?: 'missing' }).messagesStatus = 'missing'
      this.logger.warn('Plan sans messages contacts — étape « messages » marquée non faite', { accountId })
    }
    await this.dataSource.transaction(async manager => {
      if (data?.actionPlan) {
        await this.actionPlans.create(accountId, userId, workspaceId, data.actionPlan, manager)
      }
      // Also merge the full plan into ``account.raw_analysis.plan`` — the web
      // Plan tab reads it from there, not from the ``action_plans`` table.
      // Without this the tab stays blank even though the plan exists.
      if (data) {
        await this.accounts.applyPlan(accountId, data, manager)
        // #2543.7 — la date de CETTE collecte du segment stratégie (Phase 4
        // plan), que le ciblage du rattrapage (#2543) comparera à une future
        // capacité datée sur ce segment. Inconditionnel comme
        // `applyContactsCollectedAt`, dans la MÊME transaction que le plan
        // qu'elle date.
        await this.accounts.applyStrategyCollectedAt(accountId, new Date(), manager)
        // #2118.51 — même geste, pour le CINQUIÈME segment : la lecture du
        // dossier en sept axes (`evaluation.dossier_read`, #2118). Ce plan est
        // le SEUL point où Phase 4 écrit réellement ce bloc — stampée ici,
        // inconditionnellement, dans la MÊME transaction.
        await this.accounts.applyDossierReadCollectedAt(accountId, new Date(), manager)
      }
      // Ready-to-send messages (Phase 4 bellum_messages) ride on the plan payload
      // (``data.contactMessages``); apply them onto the persisted contacts so the
      // dossier shows the "messages prêts à envoyer" deliverable.
      const messages = (data as { contactMessages?: AnalysisContactMessage[] } | undefined)?.contactMessages
      if (messages?.length) {
        const matched = await this.contacts.applyMessages(accountId, messages, manager)
        this.logger.log('saveContactMessages matched', { accountId, matched, total: messages.length })
      }
      await this.accounts.markCompleted(accountId, manager)
      if (ctx) {
        await this.events.phaseCompleted(
          { jobId: ctx.jobId, accountId, phase: 'plan', percent: 100, correlationId: ctx.correlationId },
          manager,
        )
      }
    })
    // Record the completed analysis in the activity history (drives /actions).
    // Best-effort and OUTSIDE the transaction: a history-write failure must
    // never roll back or fail an analysis that already completed.
    await this.recordAnalysisCompleted(accountId, userId)
    // §8 « Historique » : journal a REAL score movement (before ≠ after). The
    // canonical score is set by ``applyPlan`` above, so we read the after-value
    // and compare. Best-effort + additive — never blocks an analysis that
    // completed, never emits on a first score (previousScore null).
    await this.recordAccountScoreChanged(accountId, userId, workspaceId, previousScore, data)
    // Materialize the account's opportunities from the freshly-persisted blob
    // (Opportunity Graph). Additive + idempotent + best-effort: it never throws,
    // so a materialization blip can't fail an analysis that already completed.
    await this.opportunities.materialize(accountId)
  }

  /** Best-effort "analysis_started" activity row (Historique page + weekly
   *  stats). Mirrors {@link recordAnalysisCompleted}: uses the caller-supplied
   *  workspace when known (launch already resolved it), else resolves it, and
   *  swallows its own errors so a history-write blip never blocks a launch. */
  async recordAnalysisStarted(
    accountId: string,
    userId: string,
    workspaceId?: string | null,
    analysisRunId?: string | null,
  ): Promise<void> {
    try {
      const wsId = workspaceId ?? (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
      await this.dataSource.getRepository(UserActionEntity).insert({
        user_id: userId,
        workspace_id: wsId,
        account_id: accountId,
        action_type: 'analysis_started',
        // `analysis_run_id` is the correlation key that lets the Historique
        // resolve this row's real outcome instead of asserting "En cours"
        // forever. `metadata` is jsonb, so this needs no migration. Absent when
        // the run row could not be written — the reader then reports an unknown
        // outcome, never a guessed one.
        metadata: { detail: 'Analyse lancée', ...(analysisRunId ? { analysis_run_id: analysisRunId } : {}) },
      })
    } catch (error) {
      this.logger.error('Failed to record analysis_started action', { error, accountId, userId })
    }
  }

  /** Best-effort "analysis_completed" activity row for the Historique page.
   *  Resolves the run owner's active workspace so the (workspace-scoped) team
   *  history reads see it. Swallows its own errors — history is non-critical. */
  async recordAnalysisCompleted(accountId: string, userId: string): Promise<void> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.dataSource.getRepository(UserActionEntity).insert({
        user_id: userId,
        workspace_id: workspaceId,
        account_id: accountId,
        action_type: 'analysis_completed',
        metadata: { detail: 'Analyse complète' },
      })
    } catch (error) {
      this.logger.error('Failed to record analysis_completed action', { error, accountId, userId })
    }
  }

  /** The account's current priority score, or ``null`` on any read error — the
   *  score-change journal is a nicety, never a reason to fail a plan write. */
  private async readPriorityScoreSafe(accountId: string, workspaceId: string): Promise<number | null> {
    try {
      // #2671 — la lecture de compte porte sa borne d'espace.
      return await this.accounts.getPriorityScore(accountId, workspaceId)
    } catch (error) {
      this.logger.warn('Could not read prior score for the Historique — skipping score-change journal', { error })
      return null
    }
  }

  /**
   * #2306.15 — pose ``dossier_read.esn_profile_version`` depuis la provenance
   * DÉJÀ écrite sur le run le plus récent de ce compte (``analysis_runs
   * .profile_provenance``, recette finale §13). Mutation en place sur
   * ``data`` : no-op quand il n'y a pas de bloc ``dossier_read`` (rien à
   * annoter), best-effort — une lecture en échec ne doit jamais faire tomber
   * le plan qu'elle se contente d'annoter.
   */
  private async attachEsnProfileVersion(accountId: string, data: AnalysisPlanData | undefined): Promise<void> {
    const evaluation = (data as { evaluation?: Record<string, unknown> } | undefined)?.evaluation
    const dossierRead = evaluation?.['dossier_read']
    if (!dossierRead || typeof dossierRead !== 'object') return
    try {
      const rows = await this.dataSource.query<
        Array<{ profile_provenance: { esnProfileVersion?: number | null } | null }>
      >('SELECT profile_provenance FROM analysis_runs WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1', [
        accountId,
      ])
      const esnProfileVersion = rows[0]?.profile_provenance?.esnProfileVersion ?? null
      ;(dossierRead as Record<string, unknown>)['esn_profile_version'] = esnProfileVersion
    } catch (error) {
      this.logger.warn('Could not read profile provenance for dossier_read.esn_profile_version (non-fatal)', {
        error,
        accountId,
      })
    }
  }

  /**
   * Best-effort ``account_score_changed`` activity row (§8). Emits ONLY on a
   * real movement: both the old and the new score must be present AND differ.
   * A first score (``previousScore`` null) or an unchanged score writes nothing
   * — the row exists to say « le score de X est passé de A à B », never to
   * restate a completed analysis. ``analysis_completed`` already covers the run.
   */
  async recordAccountScoreChanged(
    accountId: string,
    userId: string,
    workspaceId: string,
    previousScore: number | null,
    data: AnalysisPlanData | undefined,
  ): Promise<void> {
    try {
      // ``applyPlan`` sets ``priority_score = COALESCE(reconciled, priority_score)``,
      // so the after-value is the reconciled score when present, else unchanged.
      const reconciled = typeof data?.priorityScore === 'number' ? data.priorityScore : null
      const newScore = reconciled ?? previousScore
      if (previousScore === null || newScore === null || newScore === previousScore) return

      await this.dataSource.getRepository(UserActionEntity).insert({
        user_id: userId,
        workspace_id: workspaceId,
        account_id: accountId,
        action_type: 'account_score_changed',
        // ``from``/``to`` drive the direction badge; ``detail`` is the
        // language-neutral ``A → B`` shown as-is. jsonb → no migration.
        metadata: { from: previousScore, to: newScore, detail: `${previousScore} → ${newScore}` },
      })
    } catch (error) {
      this.logger.error('Failed to record account_score_changed action', { error, accountId, userId })
    }
  }

  // ── Resume helpers ──────────────────────────────────────────────────────
  // The worker calls these when the outbox indicates a phase has already
  // completed on a previous attempt, so we skip re-running it but still
  // need the data to feed downstream phases.

  /** Returns the persisted Phase 1 research blob for an account. */
  async loadResearch(accountId: string, userId: string): Promise<AnalysisResearchData | undefined> {
    const result = await this.accounts.findOne(accountId, userId)
    if ('problem' in result) return undefined
    return (result.output.raw_analysis as AnalysisResearchData | null) ?? undefined
  }

  /** Returns the persisted contact list for an account, shaped for both
   *  the IA Phase 3 input (``AnalysisContactSeed[]``) and Phase 4 input
   *  (``AnalysisEnrichedContact[]``). One DB read, two views — cheaper
   *  than hitting the table twice for the same row set. */
  async loadContactsForResume(
    accountId: string,
    userId: string,
  ): Promise<{ seeds: AnalysisContactSeed[]; classified: AnalysisEnrichedContact[] }> {
    const rows = await this.contacts.findByAccount(accountId, userId)
    const seeds: AnalysisContactSeed[] = rows.map(c => ({
      fullName: c.full_name ?? '',
      title: c.title ?? '',
      linkedinUrl: c.linkedin_url ?? '',
      city: '',
      country: '',
      source: c.source ?? 'apollo',
      // An Apollo search-tier contact IS its id: without it a resumed run sends
      // back a lone first name, which the identity guard refuses at the door —
      // the resume would silently shrink the contact list it is resuming.
      ...(readApolloId(c) ? { apolloId: readApolloId(c) as string } : {}),
    }))
    const classified: AnalysisEnrichedContact[] = rows.map(c => ({
      fullName: c.full_name ?? '',
      ...(readApolloId(c) ? { apolloId: readApolloId(c) as string } : {}),
      entity: c.entity ?? '',
      role: c.decision_role ?? '',
      priority: c.priority ?? 0,
      summary: c.profile_summary ?? '',
      whyContact: c.why_contact ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      emailVerified: c.email_verified ?? false,
      ...(c.career_levers?.length ? { careerLevers: c.career_levers } : {}),
      ...(c.implicit_fears?.length ? { implicitFears: c.implicit_fears } : {}),
    }))
    return { seeds, classified }
  }

  /**
   * Le plan de Phase 4 est-il RÉELLEMENT en base pour ce compte ?
   *
   * Le graphe et nous n'avons pas la même notion de « fait ». Son checkpointer
   * marque une phase faite dès que le nœud a tourné ; nous, seulement quand
   * l'écriture a commité. Un flux coupé entre les deux laisse un graphe
   * convaincu que le plan est produit alors que nous n'avons rien reçu — et il
   * le sautera à chaque relance. C'est cette question, posée à NOTRE base, qui
   * tranche : un plan sauté n'est légitime que si le plan existe ici.
   */
  async hasPersistedPlan(accountId: string, userId: string): Promise<boolean> {
    const result = await this.accounts.findOne(accountId, userId)
    if ('problem' in result) return false
    const raw = result.output.raw_analysis as { plan?: unknown } | null
    return Boolean(raw?.plan)
  }
}
