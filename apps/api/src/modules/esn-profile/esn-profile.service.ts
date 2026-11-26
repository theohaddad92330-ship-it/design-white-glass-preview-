import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
  AnalysisProfileData,
  AnswerMetaMap,
  EsnAnswers,
  EsnProfileWorkspaceMeta,
  ProfileContextRegenerableSection,
  ProfileContextResponse,
  SaveAnswers,
} from '@bellum/contracts'
import {
  EFFECTIF_FRESHNESS_ANSWER_KEYS,
  isAnswerFilled,
  isPersonalAnswerKey,
  RESEAU_FRESHNESS_ANSWER_KEYS,
  splitAnswersByScope,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProfileContextService } from '../profile-context/profile-context.service'
import { confirmAnswerMeta, stampAnswerMeta } from './answer-meta.mapper'
import { EsnProfileWorkspaceResolver, type EsnProfileWorkspaceContext } from './esn-profile-workspace.resolver'
import { bumpVersionIfChanged } from './esn-profile-version'
import { PlacedRolesInferenceService } from './placed-roles-inference.service'

/** Whether a partial save actually carries at least one field. */
function hasAnyAnswer(answers: SaveAnswers): boolean {
  return Object.values(answers).some(value => value !== undefined)
}

/**
 * #2007.11 — répondre à une question RETIRE son statut « passée » : une
 * réponse ultérieure gagne toujours sur un skip antérieur (même doctrine que
 * « une correction humaine gagne toujours »). Seules les clés dont la valeur
 * ARRIVE réellement (jamais `undefined`) sont retirées — un réenvoi complet
 * inchangé ne doit rien effacer qu'il n'a pas réellement touché.
 */
function clearSkippedKeys(entity: EsnProfileEntity, answers: SaveAnswers): void {
  const touched = new Set((Object.keys(answers) as Array<keyof SaveAnswers>).filter(key => answers[key] !== undefined))
  if (touched.size === 0) return
  const current = entity.skipped_question_keys ?? []
  if (current.length === 0) return
  const next = current.filter(key => !touched.has(key as keyof SaveAnswers))
  if (next.length !== current.length) entity.skipped_question_keys = next
}

/**
 * #2035.8 / #2045.15 — « conserver période et fraîcheur » : quand CE save
 * touche une bande d'effectif (`EFFECTIF_FRESHNESS_ANSWER_KEYS`) OU une bande
 * de réseau personnel déclaré (`RESEAU_FRESHNESS_ANSWER_KEYS`,
 * `@bellum/contracts`), on note l'instant. `now` en paramètre, jamais
 * `new Date()` à l'intérieur : la fonction reste pure et testable sans
 * horloge système.
 *
 * #2045.15 — les deux familles de clés partagent la MÊME colonne
 * (`effectif_observed_at`) : chacune a son propre SEUIL de péremption côté
 * lecture (`readEffectifFreshness` 90j / `readReseauFreshness` 180j), mais
 * l'écriture — « quand cette clé a-t-elle été déclarée ? » — est un seul et
 * même geste, quelle que soit la famille. Dupliquer la colonne aurait
 * demandé une migration pour un fait qui ne change rien à SA propre
 * sémantique (une date d'observation reste une date d'observation).
 *
 * ⚠️ Seule l'ABSENCE de la clé dans `answers` (`undefined`, jamais envoyée)
 * laisse la date d'avant intacte. Une clé PRÉSENTE mais vidée (`null`/`''`,
 * un utilisateur qui efface sa réponse) EST un geste daté — elle s'horodate
 * comme une valeur, l'effacement n'est pas un non-événement.
 */
const OBSERVED_AT_ANSWER_KEYS = [...EFFECTIF_FRESHNESS_ANSWER_KEYS, ...RESEAU_FRESHNESS_ANSWER_KEYS] as const

function stampEffectifObservedAt(entity: EsnProfileEntity, answers: SaveAnswers, now: Date): void {
  const touched = OBSERVED_AT_ANSWER_KEYS.filter(key => answers[key] !== undefined)
  if (touched.length === 0) return
  const nowIso = now.toISOString()
  entity.effectif_observed_at = {
    ...(entity.effectif_observed_at ?? {}),
    ...Object.fromEntries(touched.map(key => [key, nowIso])),
  }
}

/**
 * #2045.15 — même mécanique que {@link stampEffectifObservedAt}, appliquée au
 * réseau personnel déclaré (`RESEAU_FRESHNESS_ANSWER_KEYS`, @bellum/contracts)
 * — MÊME colonne `effectif_observed_at` (une map générique clé→date, jamais
 * spécifique à l'effectif malgré son nom), AUCUNE migration. Fonction séparée
 * plutôt qu'une liste fusionnée : chaque famille de fraîcheur garde son seuil
 * et son propriétaire (GA-26), seule la colonne de stockage est partagée.
 */
function stampReseauObservedAt(entity: EsnProfileEntity, answers: SaveAnswers, now: Date): void {
  const touched = RESEAU_FRESHNESS_ANSWER_KEYS.filter(key => answers[key] !== undefined)
  if (touched.length === 0) return
  const nowIso = now.toISOString()
  entity.effectif_observed_at = {
    ...(entity.effectif_observed_at ?? {}),
    ...Object.fromEntries(touched.map(key => [key, nowIso])),
  }
}

/**
 * The profile fields whose value ACTUALLY changed — only keys the caller sent
 * (`answers`) AND whose before ≠ after (a member's ignored company edit leaves
 * `next` unchanged, so it is not counted). Drives the §8 `profile_updated`
 * journal, which must never fire on a no-op save.
 */
function changedProfileFields(answers: SaveAnswers, before: EsnAnswers, next: EsnAnswers): string[] {
  const changed: string[] = []
  for (const key of Object.keys(answers) as Array<keyof SaveAnswers>) {
    if (answers[key] === undefined) continue
    const beforeValue = (before as Record<string, unknown>)[key as string]
    const nextValue = (next as Record<string, unknown>)[key as string]
    if (JSON.stringify(beforeValue) !== JSON.stringify(nextValue)) changed.push(key as string)
  }
  return changed
}

@Injectable()
export class EsnProfileService {
  private readonly logger = new Logger(EsnProfileService.name)

  constructor(
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles: Repository<EsnProfileEntity>,
    private readonly profileContext: ProfileContextService,
    private readonly resolver: EsnProfileWorkspaceResolver,
    // §8 « Historique » : trace `profile_updated` sur une modif RÉELLE du profil
    // ESN. `@Optional()` et EN DERNIER — le spec en `new(repo, ctx, resolver)`
    // reste valide, et son absence = simple no-op (aucune trace).
    @Optional()
    @InjectRepository(UserActionEntity)
    private readonly userActions?: Repository<UserActionEntity>,
    // Métiers placés DÉDUITS (11/10/2026) — recalculés à chaque enregistrement
    // du profil. `@Optional()` et EN DERNIER, même raison que ci-dessus.
    @Optional()
    private readonly placedRolesInference?: PlacedRolesInferenceService,
  ) {}

  /** The caller's resolved answers: canonical company profile of their
   *  workspace merged with their personal overlay; legacy per-user answers
   *  (byte-identical) when no canonical profile exists. */
  async getAnswers(userId: string): Promise<EsnAnswers> {
    return this.resolver.resolveMergedAnswers(userId)
  }

  /** Les mêmes réponses, plus les clés qui viennent de la fiche de l'entreprise
   *  (#1671-ter). Délègue au résolveur, comme tout le reste : une seconde
   *  dérivation ici finirait par diverger de celle du lecteur d'analyse. */
  async getAnswersWithOrigin(userId: string): Promise<{ answers: EsnAnswers; inherited: (keyof EsnAnswers)[] }> {
    return this.resolver.resolveAnswersWithOrigin(userId)
  }

  /** #4158.12 — délègue au résolveur : la condition d'attente est celle de
   *  l'écriture (`persistAnswers`), jamais une seconde dérivation. */
  async getAwaitingCompanyAdmin(userId: string): Promise<{ adminUserId: string } | null> {
    return this.resolver.resolveAwaitingCompanyAdmin(userId)
  }

  /** #2035.8 — délègue au résolveur : une seconde dérivation ici finirait par
   *  diverger de celle des réponses elles-mêmes. */
  async getEffectifObservedAt(userId: string): Promise<Record<string, string>> {
    return this.resolver.resolveEffectifObservedAt(userId)
  }

  /** #2006.22 — délègue au résolveur : le statut par clé (confirmé / proposé /
   *  corrigé / inconnu), fusionné entreprise + personnel comme les réponses. */
  async getAnswerMeta(userId: string): Promise<AnswerMetaMap> {
    return this.resolver.resolveAnswerMeta(userId)
  }

  /** Le profil vendeur dans la forme que lisent les prompts — portefeuille
   *  d'offre compris. Délègue au résolveur : une seconde dérivation ici
   *  finirait par diverger de celle du lecteur d'analyse. */
  async resolveProfileData(userId: string): Promise<AnalysisProfileData> {
    return this.resolver.resolveProfileData(userId)
  }

  /** How the caller's profile is shared in their workspace — drives the
   *  Réglages › Profil split (shared company profile vs personal prefs). */
  async getWorkspaceMeta(userId: string): Promise<EsnProfileWorkspaceMeta> {
    const context = await this.resolver.resolveContext(userId)
    return {
      shared: context.canonicalRow !== null,
      // No workspace → the legacy per-user profile is fully editable.
      // #4158.12 — un membre SANS fiche canonique n'écrit plus l'entreprise
      // (`persistAnswers`) : l'écran ne doit pas lui promettre une saisie qui
      // serait ignorée en silence.
      canEditCompany: context.workspaceId === null || context.canManageCompany,
      role: context.role,
    }
  }

  async regenerateProfileContext(userId: string): Promise<EsnAnswers> {
    const answers = await this.getAnswers(userId)
    await this.profileContext.triggerGeneration(userId, answers)
    return answers
  }

  /** #2908 (#2010.16 / #2011.10) — « Régénérer cette section » : voir
   *  {@link ProfileContextService.regenerateSection} pour la doctrine. */
  async regenerateProfileContextSection(
    userId: string,
    section: ProfileContextRegenerableSection,
  ): Promise<ProfileContextResponse> {
    const answers = await this.getAnswers(userId)
    return this.profileContext.regenerateSection(userId, answers, section)
  }

  /**
   * #2022.7 — la réédition du questionnaire est TERMINÉE : c'est ici, et
   * nulle part ailleurs dans ce service, que le nouveau profil remplace
   * l'ancien.
   *
   * `reedited: true` porte la décision D9 (Louis 14/09/2026) au seul moment où
   * elle est vraie : le contenu qui a produit le contexte a changé ET la
   * nouvelle version est complète, donc un contexte VALIDÉ peut être remplacé
   * et sa validation retirée. Pendant la réédition, `upsertAnswers` n'a rien
   * déclenché — l'ancien profil est resté actif, validation comprise.
   *
   * Best-effort comme l'était l'appel qu'il remplace : une génération qui ne
   * démarre pas ne doit pas faire échouer la complétion du questionnaire.
   */
  async completeReedition(userId: string): Promise<void> {
    try {
      const answers = await this.getAnswers(userId)
      await this.profileContext.triggerGeneration(userId, answers, { reedited: true })
    } catch (error) {
      // Avale son échec À DESSEIN : la complétion du questionnaire est déjà
      // écrite quand on arrive ici. La laisser échouer ferait dire « ta
      // complétion n'a pas été enregistrée » alors qu'elle l'a été, et le
      // « Régénérer » de Réglages › Profil reste le chemin de rattrapage.
      this.logger.warn('Profile generation on questionnaire completion failed — the completion itself stands', {
        error,
      })
    }
  }

  /**
   * Workspace-aware write:
   *  - no workspace resolved → the legacy per-user upsert, byte-identical;
   *  - owner/admin (`team:manage`) → company fields land on the workspace's
   *    canonical row (claiming their own row as canonical if none exists yet),
   *    personal fields on their own row;
   *  - member → personal fields only; company fields are IGNORED once a
   *    canonical profile exists (the canonical is read-only for them — the
   *    returned answers reflect the canonical values, so the editor shows the
   *    truth rather than a phantom write).
   */
  async upsertAnswers(userId: string, answers: SaveAnswers): Promise<EsnAnswers> {
    const context = await this.resolver.resolveContext(userId)
    // Snapshot the resolved answers BEFORE the write mutates the context rows,
    // so the §8 journal fires only on a real change (diffed against `next`) —
    // and so does #2006.22's `stampAnswerMeta` (`persistAnswers` below), pour
    // la MÊME raison : un réenvoi complet inchangé ne doit rien confirmer.
    const before = this.resolver.mergeFromContext(context, userId)
    await this.persistAnswers(userId, answers, context, before)
    const next = await this.resolver.resolveMergedAnswers(userId)
    // #2022.7 — la génération ne part PAS d'ici : un enregistrement de réponses
    // est une SOUS-ÉTAPE, pas une complétion. Elle part de
    // {@link completeReedition}, que la complétion du questionnaire appelle une
    // fois (`OnboardingService.complete`). Deux raisons, et la seconde n'est
    // pas un détail :
    //  1. c'est le comportement demandé — on ne remplace un profil qu'une fois
    //     le nouveau COMPLET ; tant que la réédition court, le profil ACTIF
    //     reste l'ancien (il garde donc aussi sa validation, D9) ;
    //  2. une génération par sous-étape est un APPEL MODÈLE PAYÉ pour un état
    //     intermédiaire que personne ne lit — dix sous-étapes, dix générations,
    //     dont neuf jetées.
    // Écarté : versionner `esn_profiles` À CHAQUE sous-étape pour déclencher la
    // génération. #2306.24 : `version` n'avance QUE quand secteurs/offres
    // changent (`bumpVersionIfChanged`), ce qui nourrit « comptes concernés » —
    // sans rien déclencher ici.
    void this.recordProfileUpdated(userId, context.workspaceId, changedProfileFields(answers, before, next))
    // Métiers placés DÉDUITS (11/10/2026) — le contexte a pu changer : la
    // déduction suit. Best-effort, jamais bloquante, jamais sur `placed_roles`.
    void this.placedRolesInference?.recomputeQuietly(userId)
    return next
  }

  /**
   * Best-effort `profile_updated` activity row (§8). Emits ONLY when at least
   * one field actually changed AND the caller's workspace is known — the
   * (workspace-scoped) team Journal reads by `workspace_id`. A no-op save, a
   * member's ignored company edit, or a legacy user without a workspace writes
   * nothing. Never blocks the profile save.
   */
  private async recordProfileUpdated(userId: string, workspaceId: string | null, fields: string[]): Promise<void> {
    if (!this.userActions || !workspaceId || fields.length === 0) return
    try {
      await this.userActions.insert({
        user_id: userId,
        workspace_id: workspaceId,
        account_id: null,
        contact_id: null,
        action_type: 'profile_updated',
        // Détail localisé côté web ; `fields` = trace des champs touchés (jsonb,
        // aucune migration). JAMAIS de donnée fictive : uniquement des champs
        // réellement modifiés.
        metadata: { detail: 'Contexte commercial', fields },
      })
    } catch (error) {
      this.logger.warn('Failed to record profile_updated action — profile save is unaffected', { error })
    }
  }

  private async persistAnswers(
    userId: string,
    answers: SaveAnswers,
    context: EsnProfileWorkspaceContext,
    before: EsnAnswers,
  ): Promise<void> {
    // Legacy path — user without any workspace: today's behaviour, unchanged.
    if (!context.workspaceId) {
      await this.upsertOwnRow(userId, answers, context.ownRow, before)
      return
    }

    const { company, personal } = splitAnswersByScope(answers)

    if (!context.canManageCompany) {
      // A member never touches the canonical.
      // #4158.12 — ni n'en fabrique une avant l'heure : tant que l'administrateur
      // n'a pas décrit l'ESN, le membre n'écrit QUE ses réponses personnelles
      // (jamais une fiche entreprise orpheline, qui ferait diverger les
      // analyses). Quand l'administrateur crée la canonique, le membre en hérite
      // (`resolveAnswersWithOrigin`). Les fiches orphelines DÉJÀ écrites ne sont
      // pas migrées : rien n'est perdu, la canonique prime.
      if (hasAnyAnswer(personal)) await this.upsertOwnRow(userId, personal, context.ownRow, before)
      return
    }

    // Owner/admin (`team:manage`).
    if (!context.canonicalRow) {
      // First managed write claims their own row as the workspace canonical.
      await this.upsertOwnRow(userId, answers, context.ownRow, before, {
        workspace_id: context.workspaceId,
        is_workspace_canonical: true,
      })
      return
    }

    if (context.canonicalRow.user_id === userId) {
      // The canonical row IS their row (owner post-backfill) — single write.
      await this.upsertOwnRow(userId, answers, context.canonicalRow, before)
      return
    }

    // Admin who is not the canonical row's author: company fields go to the
    // canonical row, personal fields to their own row.
    if (hasAnyAnswer(company)) {
      this.esnProfiles.merge(context.canonicalRow, company)
      const now = new Date()
      stampEffectifObservedAt(context.canonicalRow, company, now)
      stampReseauObservedAt(context.canonicalRow, company, now)
      // #2006.22 — c'est L'ADMIN qui fait le geste (`userId`), pas
      // l'utilisateur propriétaire de la ligne canonique.
      stampAnswerMeta(context.canonicalRow, company, before, userId, now)
      clearSkippedKeys(context.canonicalRow, company)
      bumpVersionIfChanged(context.canonicalRow, company, before) // #2306.24
      await this.esnProfiles.save(context.canonicalRow)
    }
    if (hasAnyAnswer(personal)) await this.upsertOwnRow(userId, personal, context.ownRow, before)
  }

  /**
   * #4425.4 — « Confirmer » une réponse dont l'origine n'est pas établie, sans
   * la réécrire (voir {@link confirmAnswerMeta}). Aucune table : c'est la colonne
   * `answer_meta` qui porte déjà l'enveloppe.
   *
   * Le verrou de rôle de {@link persistAnswers} est tenu : un membre d'un espace
   * partagé ne confirme pas un champ d'ENTREPRISE (il le signale) ; un champ
   * personnel reste le sien.
   */
  async confirmAnswer(userId: string, key: keyof EsnAnswers): Promise<AnswerMetaMap> {
    const context = await this.resolver.resolveContext(userId)
    const merged = this.resolver.mergeFromContext(context, userId)
    if (!isAnswerFilled(merged[key] as string | number | readonly unknown[] | null | undefined)) {
      throw new BadRequestException('answer_not_filled')
    }

    let target: EsnProfileEntity | null
    if (context.workspaceId === null || isPersonalAnswerKey(key)) {
      target = context.ownRow
    } else if (context.canManageCompany) {
      target = context.canonicalRow ?? context.ownRow
    } else {
      throw new ForbiddenException('company_answer_locked')
    }
    if (!target) throw new BadRequestException('answer_row_missing')

    if (confirmAnswerMeta(target, key, userId, new Date())) await this.esnProfiles.save(target)
    return this.resolver.resolveAnswerMeta(userId)
  }

  /** The pre-workspace upsert, factored: merge into the user's current row
   *  (creating version 1 when none), plus optional canonical stamping. */
  private async upsertOwnRow(
    userId: string,
    answers: SaveAnswers,
    current: EsnProfileEntity | null,
    before: EsnAnswers,
    stamp?: Partial<Pick<EsnProfileEntity, 'workspace_id' | 'is_workspace_canonical'>>,
  ): Promise<EsnProfileEntity> {
    const base = current ?? this.esnProfiles.create({ user_id: userId, version: 1, is_current: true })
    const merged = this.esnProfiles.merge(base, answers, stamp ?? {})
    const now = new Date()
    stampEffectifObservedAt(merged, answers, now)
    stampReseauObservedAt(merged, answers, now)
    // #2006.22 — « une réponse saisie ou corrigée par l'utilisateur est
    // confirmed » : c'est ici, et au seul autre point d'écriture juste
    // au-dessus (la ligne canonique), que `SaveAnswers` devient réellement
    // une colonne de `esn_profiles`.
    stampAnswerMeta(merged, answers, before, userId, now)
    clearSkippedKeys(merged, answers)
    // #2306.24 — secteurs/offres changés ⇒ version + 1 (sinon « impacted-by-profile-change » reste vide).
    if (current) bumpVersionIfChanged(merged, answers, before) // création = version 1, jamais 2
    return this.esnProfiles.save(merged)
  }

  /** #2007.11 — la liste fusionnée des clés passées volontairement (délègue au
   *  résolveur, même raison que {@link getAnswerMeta}). */
  async getSkippedQuestionKeys(userId: string): Promise<string[]> {
    return this.resolver.resolveSkippedQuestionKeys(userId)
  }

  /**
   * #2007.11 — noter qu'une question a été PASSÉE, sur la ligne PROPRE de
   * l'utilisateur : passer une question est un geste personnel (« je ne
   * réponds pas à ça maintenant »), pas une écriture de profil d'entreprise —
   * elle ne demande donc jamais `records:write` sur le canonique, à la
   * différence d'`upsertAnswers`. Idempotent : repasser une clé déjà passée ne
   * duplique rien.
   */
  async skipQuestion(userId: string, key: keyof EsnAnswers): Promise<string[]> {
    const context = await this.resolver.resolveContext(userId)
    const base = context.ownRow ?? this.esnProfiles.create({ user_id: userId, version: 1, is_current: true })
    const current = base.skipped_question_keys ?? []
    if (!current.includes(key as string)) {
      base.skipped_question_keys = [...current, key as string]
      await this.esnProfiles.save(base)
    }
    return this.resolver.resolveSkippedQuestionKeys(userId)
  }
}
