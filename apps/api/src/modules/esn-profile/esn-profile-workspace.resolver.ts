import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  type AnalysisBusinessUnit,
  type AnalysisProfileData,
  type AnswerMetaMap,
  type BusinessUnitLayerSource,
  type EsnAnswers,
  type LayeredProfile,
  type LayeredProfileSources,
  type LayerVersions,
  type WorkspaceRole,
  businessUnitAccessSchema,
  businessUnitKindSchema,
  businessUnitMembershipSchema,
  composeLayeredProfile,
  effectiveEntryStrategy,
  effectiveInferredPlacedRoles,
  esnAnswersToProfileData,
  hasPermission,
  inheritedAnswerKeys,
  layerVersionsOf,
  mergeWorkspaceAnswers,
  parseStoredInferredPlacedRoles,
  parseStoredPortfolio,
  portfolioVisibilitySchema,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { memoizeForRequest } from '../../common/request-memo'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { mapRowToAnswerMeta } from './answer-meta.mapper'
import { mapRowToAnswers } from './esn-answers.mapper'

/**
 * Everything the read AND write paths need to reason about the caller's ESN
 * profile inside their workspace, resolved in one place.
 */
export interface EsnProfileWorkspaceContext {
  /** Active workspace id, `null` when the user belongs to none (legacy path). */
  workspaceId: string | null
  /** The caller's role in that workspace, `null` when none resolved. */
  role: WorkspaceRole | null
  /** Whether the caller may edit the shared company profile (`team:manage`). */
  canManageCompany: boolean
  /** The workspace's current canonical (company) profile row, if any. */
  canonicalRow: EsnProfileEntity | null
  /** The caller's own current profile row (their personal overlay), if any. */
  ownRow: EsnProfileEntity | null
}

/**
 * Workspace-aware resolution of the ESN profile: the COMPANY profile belongs
 * to the workspace (its canonical `esn_profiles` row), each member keeps a
 * light personal overlay on their own row. Shared by the read-only
 * {@link EsnProfileReader} (analysis/chat/discover/messages) and the
 * read-write `EsnProfileService` (settings editor + onboarding) so both
 * resolve THE SAME merged profile.
 *
 * Deliberately repo-only (no WorkspaceModule import — that would drag Mailer/
 * Config into the reader graph): the active-workspace lookup mirrors
 * `WorkspaceContextService.resolveActiveWorkspace` (owned workspace first,
 * oldest membership otherwise) but FAILS SOFT — a user with no workspace, or
 * any lookup error, degrades to the legacy per-user profile instead of
 * throwing, because a profile read must never break an analysis run.
 */
@Injectable()
export class EsnProfileWorkspaceResolver {
  private readonly logger = new Logger(EsnProfileWorkspaceResolver.name)

  constructor(
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles: Repository<EsnProfileEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    // ⚠️ L'ESPACE CHOISI — l'étape que ce résolveur avait perdue (#1670-bis).
    // Voir le docblock de `resolveActiveWorkspaceSoft`.
    @InjectRepository(WorkspaceActiveSelectionEntity)
    private readonly selections: Repository<WorkspaceActiveSelectionEntity>,
  ) {}

  async resolveContext(userId: string): Promise<EsnProfileWorkspaceContext> {
    // #4450 — GET /onboarding/state le demandait trois fois (réponses, fraîcheur
    // d'effectif, administrateur attendu) : UNE lecture par requête GET, comme
    // `resolveActiveWorkspace`. Hors requête GET (écriture, job) : relu à chaque appel.
    const context = await memoizeForRequest(`esn-profile-context:${userId}`, () => this.loadContext(userId))
    return { ...context }
  }

  private async loadContext(userId: string): Promise<EsnProfileWorkspaceContext> {
    const ownRow = await this.esnProfiles.findOne({ where: { user_id: userId, is_current: true } })
    const active = await this.resolveActiveWorkspaceSoft(userId)
    if (!active) {
      return { workspaceId: null, role: null, canManageCompany: false, canonicalRow: null, ownRow }
    }
    const canonicalRow = await this.esnProfiles.findOne({
      where: { workspace_id: active.workspaceId, is_workspace_canonical: true, is_current: true },
    })
    return {
      workspaceId: active.workspaceId,
      role: active.role,
      canManageCompany: hasPermission(active.role, 'team:manage'),
      canonicalRow,
      ownRow,
    }
  }

  /**
   * The caller's resolved answers: canonical company fields + their personal
   * overlay. Two legacy-identical shortcuts: no canonical profile (never
   * backfilled / owner never onboarded) → the caller's own row exactly as
   * before; canonical row IS the caller's own row (mono-user workspace,
   * post-backfill owner) → same thing. Only a member of a multi-user
   * workspace with a canonical profile sees merged output.
   */
  async resolveMergedAnswers(userId: string): Promise<EsnAnswers> {
    return this.mergeFromContext(await this.resolveContext(userId), userId)
  }

  /**
   * Les mêmes réponses, PLUS d'où vient chacune (#1671-ter).
   *
   * Le flux d'onboarding a besoin de la distinction que la fusion efface : une
   * question d'entreprise héritée ne se repose pas, une question personnelle
   * héritée si. Sans elle, l'associé qui rejoint une ESN déjà renseignée se
   * voyait reposer les douze questions — dont onze sont des faits sur l'ESN.
   *
   * ⚠️ Les deux raccourcis de {@link mergeFromContext} sont ici aussi, et pour
   * la même raison : pas de ligne canonique, ou la ligne canonique EST celle du
   * membre ⇒ il n'hérite de personne. C'est le seul endroit qui connaisse
   * l'IDENTITÉ, donc le seul qui puisse trancher ce cas — `inheritedAnswerKeys`
   * ne voit que des valeurs.
   */
  async resolveAnswersWithOrigin(userId: string): Promise<{ answers: EsnAnswers; inherited: (keyof EsnAnswers)[] }> {
    const context = await this.resolveContext(userId)
    const own = mapRowToAnswers(context.ownRow)
    if (!context.canonicalRow || context.canonicalRow.user_id === userId) return { answers: own, inherited: [] }
    const canonical = mapRowToAnswers(context.canonicalRow)
    return { answers: mergeWorkspaceAnswers(canonical, own), inherited: inheritedAnswerKeys(canonical, own) }
  }

  /**
   * #4158.12 — l'appelant est-il un MEMBRE qui arrive avant que l'administrateur
   * ait décrit l'ESN ? Oui ⇒ le propriétaire de l'espace (celui dont on nommera
   * le prénom et le nom), sinon `null`.
   *
   * La MÊME lecture du contexte que l'écriture (`persistAnswers`, branche
   * « membre sans canonique ») : un espace sans fiche canonique, un appelant
   * sans `team:manage`. Deux dérivations de cette condition finiraient par
   * diverger (GA-26). Un utilisateur sans espace (chemin d'avant) n'attend
   * personne.
   */
  async resolveAwaitingCompanyAdmin(userId: string): Promise<{ adminUserId: string } | null> {
    const context = await this.resolveContext(userId)
    if (!context.workspaceId || context.canManageCompany || context.canonicalRow) return null
    const workspace = await this.workspaces.findOne({ where: { id: context.workspaceId } })
    return workspace ? { adminUserId: workspace.owner_user_id } : null
  }

  /**
   * #2035.8 — QUAND chaque bande d'effectif a été répondue, résolue comme les
   * réponses elles-mêmes : `stampEffectifObservedAt` (`esn-profile.service.ts`)
   * n'écrit JAMAIS une clé COMPANY (`consultant_size`, `consultant_size_group_band`)
   * ailleurs que sur la ligne canonique, ni une clé PERSONNELLE
   * (`consultants_managed_by_user_band`, `consultant_size_business_unit_band`)
   * ailleurs que sur la ligne propre — les deux maps ne se recouvrent donc
   * jamais sur la même clé, et une simple union suffit (pas de conflit à
   * arbitrer, contrairement à `mergeWorkspaceAnswers`).
   */
  async resolveEffectifObservedAt(userId: string): Promise<Record<string, string>> {
    const context = await this.resolveContext(userId)
    return {
      ...(context.canonicalRow?.effectif_observed_at ?? {}),
      ...(context.ownRow?.effectif_observed_at ?? {}),
    }
  }

  /**
   * #2006.22 — le statut PAR CLÉ (`AnswerMetaMap`), fusionné comme
   * `resolveEffectifObservedAt` juste au-dessus : même raison, même union sans
   * conflit — une clé COMPANY ne s'écrit jamais que sur la ligne canonique, une
   * clé PERSONNELLE jamais que sur la ligne propre, les deux maps ne se
   * recouvrent donc jamais sur la même clé.
   *
   * `mapRowToAnswerMeta` existait déjà (`answer-meta.mapper.ts`, migration
   * `1795000000001-OnboardingAnswerMeta.ts`) mais n'avait AUCUN appelant — donc
   * aucun client ne recevait jamais de statut, et Réglages › Profil affichait
   * chaque réponse avec la même coche, migrée ou confirmée. C'est ici que ce
   * fil se referme.
   */
  async resolveAnswerMeta(userId: string): Promise<AnswerMetaMap> {
    const context = await this.resolveContext(userId)
    return { ...mapRowToAnswerMeta(context.canonicalRow), ...mapRowToAnswerMeta(context.ownRow) }
  }

  /**
   * #2007.11 — les clés passées volontairement, fusionnées comme
   * `resolveEffectifObservedAt` : une UNION dédupliquée, jamais un remplacement
   * — passer une question ENTREPRISE depuis la ligne canonique et une question
   * PERSONNELLE depuis sa propre ligne doivent toutes les deux ressortir.
   */
  async resolveSkippedQuestionKeys(userId: string): Promise<string[]> {
    const context = await this.resolveContext(userId)
    const keys = new Set([
      ...(context.canonicalRow?.skipped_question_keys ?? []),
      ...(context.ownRow?.skipped_question_keys ?? []),
    ])
    return [...keys]
  }

  /**
   * Le profil vendeur dans la forme que lisent les prompts, PORTEFEUILLE
   * d'offre compris (addendum Stelya §5).
   *
   * Ici et nulle part ailleurs : c'est le seul endroit qui a déjà le contexte
   * d'espace sous la main, donc la lecture du portefeuille ne coûte aucune
   * requête de plus — et surtout, brancher le portefeuille dans chaque appelant
   * aurait garanti d'en oublier un, qui aurait alors raisonné dans un autre
   * prisme que ses voisins. C'est exactement le défaut que le retour bêta
   * décrit.
   *
   * Portefeuille absent ou illisible ⇒ profil byte-identique à l'historique.
   */
  async resolveProfileData(userId: string): Promise<AnalysisProfileData> {
    const context = await this.resolveContext(userId)
    const answers = this.mergeFromContext(context, userId)
    const row = context.canonicalRow ?? context.ownRow
    const out = esnAnswersToProfileData(answers, parseStoredPortfolio(row?.offer_portfolio))
    // Métiers placés DÉDUITS (décision Louis 11/10/2026) : seulement quand rien
    // n'est déclaré (le déclaré gagne), moins ceux que l'humain a retirés. Lus
    // sur la MÊME ligne que le portefeuille — aucune requête de plus.
    const inferred = effectiveInferredPlacedRoles(
      parseStoredInferredPlacedRoles(row?.inferred_placed_roles),
      answers.placed_roles ?? [],
      row?.dismissed_inferred_roles ?? [],
    )
    if (inferred.length > 0) out.inferredPlacedRoles = inferred.map(r => ({ role: r.role, terms: [...r.terms] }))
    // D9 (décision Louis 14/09/2026, valider le contexte commercial) — Laura
    // cite le contexte comme validé : voir la doctrine du champ sur
    // `AnalysisProfileData.profileContextValidatedAt` (analysis.ts).
    const profileContextValidatedAt = await this.resolveProfileContextValidatedAt(userId)
    if (profileContextValidatedAt) out.profileContextValidatedAt = profileContextValidatedAt
    // #2118.16 — la stratégie validée à l'audit part au moteur ; le verdict la cite.
    const entryStrategy = await this.resolveEntryStrategy(userId)
    if (entryStrategy) out.entryStrategy = entryStrategy
    // #2118.9 — les BU que le commercial PORTE, dans l'espace actif seulement.
    if (context.workspaceId) {
      const businessUnits = await this.resolveBusinessUnits(context.workspaceId, userId)
      if (businessUnits.length > 0) out.businessUnits = businessUnits
    }
    return out
  }

  /**
   * #2007.3 / #2009.8 — les BU que cet utilisateur PORTE dans son espace
   * ACTIF, pour le Profileur (port `BUSINESS_UNITS_READER`, câblé dans
   * `profile-context.module.ts`). La MÊME lecture bornée que #2118.9 — une
   * seule requête, une seule borne (espace + utilisateur). Hors espace : `[]`,
   * sans requête.
   */
  async resolveCarriedBusinessUnits(userId: string): Promise<AnalysisBusinessUnit[]> {
    const context = await this.resolveContext(userId)
    return context.workspaceId ? this.resolveBusinessUnits(context.workspaceId, userId) : []
  }

  /**
   * #2118.16 — la stratégie d'entrée qui fait foi, par la règle du contrat
   * (`effectiveEntryStrategy` : la choisie, sinon la calculée — GA-26). Les deux
   * sources vivent sur `profiles` : la colonne du choix (#2073.8) et le champ
   * calculé du JSONB du profileur. Fail-soft : `null`, jamais une exception.
   */
  private async resolveEntryStrategy(userId: string): Promise<AnalysisProfileData['entryStrategy'] | null> {
    return this.esnProfiles.manager
      .query<{ chosen: unknown; computed: unknown }[]>(
        `SELECT chosen_entry_strategy AS chosen, profile_context->'idealAccountProfile'->>'entryStrategy' AS computed FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      )
      .then(rows => effectiveEntryStrategy(rows?.[0]?.chosen, rows?.[0]?.computed))
      .catch(() => null)
  }

  /**
   * #2118.9 — la dimension BU existe depuis #2005.3 (`business_units` +
   * `business_unit_members`, une TABLE et non une colonne : une personne peut
   * porter deux agences) ; elle n'atteignait aucun prompt. Bornée par les DEUX
   * colonnes (`workspace_id`, `user_id`) — `user_id` seul ferait entrer les BU
   * d'un autre espace — et aux seules BU actives. Un champ non déclaré est
   * absent ; une ligne illisible est écartée, jamais complétée. Fail-soft.
   */
  private async resolveBusinessUnits(workspaceId: string, userId: string): Promise<AnalysisBusinessUnit[]> {
    return this.esnProfiles.manager
      .query<{ name: unknown; kind: unknown; territory: unknown; specialties: unknown }[]>(
        `SELECT bu.name, bu.kind, bu.territory, bu.specialties FROM business_unit_members m JOIN business_units bu ON bu.id = m.business_unit_id AND bu.workspace_id = m.workspace_id WHERE m.workspace_id = $1 AND m.user_id = $2 AND bu.status = 'active' ORDER BY bu.name`,
        [workspaceId, userId],
      )
      .then(rows => (rows ?? []).flatMap(toAnalysisBusinessUnit))
      .catch(() => [])
  }

  /**
   * D9 — `profiles.profile_context_validated_at`, gaté sur
   * `profile_context_status === 'validated'` (même garde que
   * `ProfileContextService.getMe`, dupliquée ici parce que ce résolveur ne
   * dépend d'aucun autre module — c'est tout son intérêt, voir le docblock de
   * la classe). Un statut qui a bougé depuis rend `null` même si la colonne
   * porte encore une ancienne date : un horodatage fantôme mentirait sur ce
   * qui vient de se passer. Fail-soft : une lecture ratée rend `null`, jamais
   * une exception — un profil doit pouvoir se résoudre sans savoir si son
   * contexte a été validé.
   */
  private async resolveProfileContextValidatedAt(userId: string): Promise<string | null> {
    return this.esnProfiles.manager
      .query<{ profile_context_status: string | null; profile_context_validated_at: Date | null }[]>(
        `SELECT profile_context_status, profile_context_validated_at FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      )
      .then(rows => {
        const row = rows?.[0]
        if (!row || row.profile_context_status !== 'validated' || !row.profile_context_validated_at) return null
        return row.profile_context_validated_at.toISOString()
      })
      .catch(() => null)
  }

  /**
   * Les deux révisions du profil de cet utilisateur (recette finale §53 —
   * P0-02) : celle des RÉPONSES et celle du CONTEXTE dérivé.
   *
   * Elles vivent dans deux tables et répondent à deux questions distinctes.
   * `esn_profiles.version` dit quelle révision des réponses a été lue ;
   * `profiles.profile_context_version` dit quelle révision de la sortie du
   * Profiler était en vigueur. Une régénération de contexte à réponses
   * inchangées ne bouge que la seconde — les confondre en perdrait la trace.
   *
   * Fail-soft comme tout ce qui vit ici : une lecture ratée rend `null`, jamais
   * une exception. Un run doit pouvoir partir sans savoir numéroter son profil.
   */
  async resolveProfileVersions(
    userId: string,
  ): Promise<{ esnProfileVersion: number | null; profileContextVersion: number | null }> {
    const esnProfileVersion = await this.esnProfiles
      .findOne({ where: { user_id: userId }, order: { version: 'DESC' }, select: ['version'] })
      .then(row => row?.version ?? null)
      .catch(() => null)

    const profileContextVersion = await this.esnProfiles.manager
      .query<{ profile_context_version: number | null }[]>(
        `SELECT profile_context_version FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      )
      .then(rows => rows?.[0]?.profile_context_version ?? null)
      .catch(() => null)

    return { esnProfileVersion, profileContextVersion }
  }

  /**
   * #2005.4 / #2005.5 / #2005.6 — le profil à TROIS COUCHES (entreprise · BU ·
   * personne) comme UN objet.
   *
   * Ici et nulle part ailleurs, pour la raison qui y a déjà mis le portefeuille
   * et les BU : c'est le seul endroit qui a le contexte d'espace sous la main.
   * Rien n'est recopié — chaque fait est lu là où il vit, et la composition
   * comme la version appartiennent au contrat (`composeLayeredProfile`, GA-26).
   *
   * Fail-soft comme tout ce résolveur : une lecture ratée laisse ses facettes à
   * `null` (donc NOMMÉES dans `unknown`), jamais une exception.
   */
  async resolveLayeredProfile(userId: string, now: Date = new Date()): Promise<LayeredProfile> {
    const context = await this.resolveContext(userId)
    const answers = this.mergeFromContext(context, userId)
    const workspaceId = context.workspaceId
    const [businessUnits, facts] = workspaceId
      ? await Promise.all([
          this.readLayerBusinessUnits(workspaceId, userId),
          this.readPersonFacts(workspaceId, userId, firstOfMonthUtc(now)),
        ])
      : [[], null]
    return composeLayeredProfile({
      answers,
      businessUnits,
      person: {
        workspaceRole: context.role,
        businessUnitAccess: facts?.businessUnitAccess ?? null,
        portfolioVisibility: facts?.portfolioVisibility ?? null,
        timezone: facts?.timezone ?? null,
        copilotPreferences: facts?.copilotPreferences ?? null,
        currentObjective: facts?.currentObjective ?? null,
      },
    })
  }

  /** #2005.11 — les trois versions de couche du profil de cet utilisateur. */
  async resolveLayerVersions(userId: string, now: Date = new Date()): Promise<LayerVersions> {
    return layerVersionsOf(await this.resolveLayeredProfile(userId, now))
  }

  /**
   * #2005.5 — les BU que la personne PORTE, avec ce qui les décrit : bornées par
   * les DEUX colonnes (`workspace_id`, `user_id`), aux seules BU actives. Les
   * comptes rattachés et les membres se COMPTENT (zéro est un fait) ; un compte
   * archivé n'est plus dans le périmètre.
   */
  private async readLayerBusinessUnits(workspaceId: string, userId: string): Promise<BusinessUnitLayerSource[]> {
    return this.esnProfiles.manager
      .query<Record<string, unknown>[]>(
        `SELECT bu.id, bu.name, bu.kind, m.membership, bu.territory, bu.specialties, bu.consultant_count, bu.team_size, bu.lead_user_id, bu.portfolio_note, bu.capacity_available_consultants, bu.quarter_objective,
           (SELECT count(*)::int FROM business_unit_members mm WHERE mm.business_unit_id = bu.id AND mm.workspace_id = bu.workspace_id) AS member_count,
           (SELECT count(*)::int FROM accounts a WHERE a.business_unit_id = bu.id AND a.workspace_id = bu.workspace_id AND a.status <> 'archived') AS attached_account_count
         FROM business_unit_members m
         JOIN business_units bu ON bu.id = m.business_unit_id AND bu.workspace_id = m.workspace_id
         WHERE m.workspace_id = $1 AND m.user_id = $2 AND bu.status = 'active'
         ORDER BY bu.name`,
        [workspaceId, userId],
      )
      .then(rows => (rows ?? []).flatMap(toBusinessUnitLayerSource))
      .catch(() => [])
  }

  /**
   * #2005.6 — ce que la personne est dans l'espace, hors questionnaire : son
   * niveau d'accès BU, la visibilité de portefeuille de l'espace, son fuseau,
   * ses préférences épinglées pour Laura et son objectif du mois. UNE requête,
   * chaque jointure bornée à la personne (et à l'espace quand la table en a un).
   */
  private async readPersonFacts(workspaceId: string, userId: string, periodMonth: string): Promise<PersonFacts | null> {
    return this.esnProfiles.manager
      .query<Record<string, unknown>[]>(
        `SELECT m.business_unit_access, w.portfolio_visibility, p.timezone, up.preferences,
           o.target_meetings, o.target_accounts, o.target_revenue
         FROM workspaces w
         LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = $2
         LEFT JOIN profiles p ON p.user_id = $2
         LEFT JOIN user_preferences up ON up.user_id = $2
         LEFT JOIN member_objectives o ON o.workspace_id = w.id AND o.user_id = $2 AND o.period_month = $3::date
         WHERE w.id = $1
         LIMIT 1`,
        [workspaceId, userId, periodMonth],
      )
      .then(rows => (rows?.[0] ? toPersonFacts(rows[0], periodMonth) : null))
      .catch(() => null)
  }

  /** Pure merge step over an already-resolved context (avoids a double read
   *  when the caller also needs the context for the write path). */
  mergeFromContext(context: EsnProfileWorkspaceContext, userId: string): EsnAnswers {
    const own = mapRowToAnswers(context.ownRow)
    if (!context.canonicalRow || context.canonicalRow.user_id === userId) return own
    return mergeWorkspaceAnswers(mapRowToAnswers(context.canonicalRow), own)
  }

  /**
   * Fail-soft mirror of `WorkspaceContextService.resolveActiveWorkspace` :
   * l'espace CHOISI, sinon celui que l'utilisateur possède (le plus ancien
   * d'abord), sinon sa plus ancienne adhésion, sinon `null` (ne jette jamais —
   * l'appelant retombe sur le profil par utilisateur).
   *
   * ⚠️ CE MIROIR AVAIT PERDU LA PREMIÈRE ÉTAPE, ET C'EST TOUT LE DÉFAUT.
   * Il se disait « miroir » de `resolveActiveWorkspace` et sautait sa lecture de
   * `workspace_active_selections`. Or le déclencheur de création de compte donne
   * à CHAQUE inscrit son propre espace en `owner` : un associé qui rejoint l'ESN
   * d'un collègue possède donc toujours un espace personnel vide, et la branche
   * « possédé d'abord » y retombait systématiquement.
   *
   * Conséquence, remontée par un client le 07/09/2026 : « mon associé a déjà
   * rempli la fiche de notre ESN, mais mon onboarding me repose toutes les
   * questions ». Le partage existait pourtant déjà et fonctionnait
   * (`mergeWorkspaceAnswers`, `is_workspace_canonical`) — il était simplement
   * pointé sur le mauvais espace, donc `canonicalRow` valait `null` et la fusion
   * court-circuitait. Onze des douze questions du premier temps sont des faits
   * sur l'ESN, pas sur la personne.
   *
   * ⚠️ L'adhésion est REVÉRIFIÉE avant d'honorer un choix, comme dans l'original :
   * un siège retiré ne doit pas continuer d'ouvrir l'espace. Un choix devenu
   * caduc est simplement ignoré ici — contrairement à l'original, ce miroir ne le
   * SUPPRIME pas : il est sur un chemin de LECTURE, et une lecture qui écrit
   * ferait un second propriétaire pour la même donnée.
   */
  private async resolveActiveWorkspaceSoft(
    userId: string,
  ): Promise<{ workspaceId: string; role: WorkspaceRole } | null> {
    try {
      const selection = await this.selections.findOne({ where: { user_id: userId } })
      if (selection) {
        const chosen = await this.members.findOne({
          where: { user_id: userId, workspace_id: selection.workspace_id },
        })
        if (chosen) return { workspaceId: chosen.workspace_id, role: chosen.role }
      }

      const owned = await this.workspaces.findOne({
        where: { owner_user_id: userId },
        order: { created_at: 'ASC' },
      })
      if (owned) return { workspaceId: owned.id, role: 'owner' }

      const membership = await this.members.findOne({
        where: { user_id: userId },
        order: { created_at: 'ASC' },
      })
      if (membership) return { workspaceId: membership.workspace_id, role: membership.role }
      return null
    } catch (err) {
      this.logger.warn(
        `Workspace resolution failed for user ${userId} — falling back to the per-user profile`,
        err instanceof Error ? err.stack : String(err),
      )
      return null
    }
  }
}

type PersonFacts = Omit<LayeredProfileSources['person'], 'workspaceRole'>

/** Le mois courant tel que `member_objectives` le range (1er du mois, UTC). */
function firstOfMonthUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function nullableCount(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** #2005.5 — une BU de la couche, lue en brut ; une ligne illisible est écartée, jamais complétée. */
function toBusinessUnitLayerSource(row: Record<string, unknown>): BusinessUnitLayerSource[] {
  const id = nullableText(row.id)
  const name = nullableText(row.name)
  const kind = businessUnitKindSchema.safeParse(row.kind)
  const membership = businessUnitMembershipSchema.safeParse(row.membership)
  if (!id || !name || !kind.success || !membership.success) return []
  return [
    {
      id,
      name,
      kind: kind.data,
      membership: membership.data,
      territory: nullableText(row.territory),
      specialties: Array.isArray(row.specialties)
        ? row.specialties.filter((value): value is string => typeof value === 'string')
        : [],
      consultantCount: nullableCount(row.consultant_count),
      teamSize: nullableCount(row.team_size),
      memberCount: nullableCount(row.member_count) ?? 0,
      leadUserId: nullableText(row.lead_user_id),
      portfolioNote: nullableText(row.portfolio_note),
      attachedAccountCount: nullableCount(row.attached_account_count) ?? 0,
      // #2005.5 (DÉCISION Louis 17/09, lot CP2) — capacité et objectif du
      // trimestre, saisis par le responsable de BU.
      capacityAvailableConsultants: nullableCount(row.capacity_available_consultants),
      quarterObjective: nullableText(row.quarter_objective),
    },
  ]
}

/** #2005.6 — les faits de la personne ; une valeur hors contrat vaut `null`. */
function toPersonFacts(row: Record<string, unknown>, periodMonth: string): PersonFacts {
  const access = businessUnitAccessSchema.safeParse(row.business_unit_access)
  const visibility = portfolioVisibilitySchema.safeParse(row.portfolio_visibility)
  const preferences =
    row.preferences && typeof row.preferences === 'object' && !Array.isArray(row.preferences)
      ? (row.preferences as Record<string, unknown>)
      : null
  const meetings = nullableCount(row.target_meetings)
  const accounts = nullableCount(row.target_accounts)
  const revenue = nullableCount(row.target_revenue)
  return {
    businessUnitAccess: access.success ? access.data : null,
    portfolioVisibility: visibility.success ? visibility.data : null,
    timezone: nullableText(row.timezone),
    copilotPreferences: preferences,
    currentObjective:
      meetings !== null || accounts !== null || revenue !== null ? { periodMonth, meetings, accounts, revenue } : null,
  }
}

/** #2118.9 — une ligne de BU lue en brut, ou rien : aucun champ n'est deviné. */
function toAnalysisBusinessUnit(row: {
  name: unknown
  kind: unknown
  territory: unknown
  specialties: unknown
}): AnalysisBusinessUnit[] {
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const kind = businessUnitKindSchema.safeParse(row.kind)
  if (!name || !kind.success) return []
  const unit: AnalysisBusinessUnit = { name, kind: kind.data }
  const territory = typeof row.territory === 'string' ? row.territory.trim() : ''
  if (territory) unit.territory = territory
  const specialties = Array.isArray(row.specialties)
    ? row.specialties
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)
    : []
  if (specialties.length > 0) unit.specialties = specialties
  return [unit]
}
