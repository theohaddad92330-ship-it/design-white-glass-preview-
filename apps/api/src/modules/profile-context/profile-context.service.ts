import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import type {
  AnalysisBusinessUnit,
  AuditMoveDecisionMove,
  AuditMoveDecisions,
  AuditMoveDecisionStatus,
  EntryStrategy,
  EsnAnswers,
  ProfileContext,
  ProfileContextCorrectableField,
  ProfileContextCorrections,
  ProfileContextRegenerableSection,
  ProfileContextStatus,
  ProfileContextFailureReason,
  SourceHealth,
  WithheldStoredContext,
} from '@bellum/contracts'
import {
  AUDIT_MOVE_TARGET_BY_RULE,
  applyProfileContextCorrections,
  commercialAuditVersionOf,
  commercialTensionRuleIdSchema,
  deriveAnswerProvenanceForModel,
  mergeRegeneratedProfileContextSection,
  profileContextFailureReasonSchema,
} from '@bellum/contracts'
import { failure, success, type Result } from '@bellum/utils'
import { Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { IaClient } from '../ia/ia.client'
import { AUDIT_MOVE_TASK_WRITER, type AuditMoveTaskWriter } from './audit-move-task.port'
import { ANSWER_META_READER, type AnswerMetaReader } from './answer-meta.port'
import { BUSINESS_UNITS_READER, type BusinessUnitsReader } from './business-units.port'
import { CONNECTED_TOOLS_READER, type ConnectedToolsReader } from './connected-tools.port'
import { ProfileContextRevisionService } from './profile-context-revision.service'
import { withheldStoredContext } from './stored-context-doctrine'
import { ProfilerGateway } from './profiler.gateway'
import { ProfilerProgressService } from './profiler-progress.service'
import { SKIPPED_QUESTIONS_READER, type SkippedQuestionsReader } from './skipped-questions.port'
import { WORKSPACE_ID_READER, type WorkspaceIdReader } from './workspace-id.port'

function parseFailureReason(raw: string | null | undefined): ProfileContextFailureReason | null {
  const parsed = profileContextFailureReasonSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

type ProfileContextSnapshot = {
  profile_context: ProfileContext | null
  status: ProfileContextStatus
  // #4969 — le code de la panne, sous `failed` seulement.
  failureReason: ProfileContextFailureReason | null
  // D9 — décision Louis 14/09/2026 : valider le contexte commercial. `null`
  // sauf quand `status === 'validated'` — jamais une date fantôme laissée par
  // un statut qui a bougé depuis (voir `getMe` ci-dessous).
  validatedAt: string | null
  // #2062.1 / #2069.1 — ce qui a été RETENU à la lecture, et la date du texte
  // retenu. `null` = rien n'a été retenu. Un texte stocké qui viole la doctrine
  // ne part pas en silence : « un fait périmé redevient inconnu AVEC SA DATE ».
  withheld: WithheldStoredContext | null
  // #2073.8 — LA STRATÉGIE CHOISIE, distincte du champ CALCULÉ par le
  // profileur (`profile_context.idealAccountProfile.entryStrategy`). `null` =
  // aucun choix explicite : le lecteur retombe sur le champ calculé (voir
  // `buildCommercialAudit`, `apps/web/.../lib/build-audit.ts`).
  chosenEntryStrategy: EntryStrategy | null
  // #2074.16 — LES DÉCISIONS HUMAINES (valider/modifier/écarter) sur les
  // mouvements d'audit PROPOSÉS (`AuditMove`, verrouillé). `{}` = aucune
  // décision : le mouvement reste `propose`.
  auditMoveDecisions: AuditMoveDecisions
  // #2908 (#2011.4) — L'EMPREINTE DE CONTENU du dossier, distincte du
  // COMPTEUR `profile_context_version` : deux générations au contenu
  // identique la portent pareille. `null` tant qu'aucune génération n'a
  // encore posé d'empreinte.
  commercialAuditVersion: string | null
  // #2012.12 (épopée #2776) — couverture réduite par source facultative,
  // posée par `ProfilerAgent` sur `AgentMeta.source_health`. `null` = aucun
  // signal encore posé.
  sourceHealth: Record<string, SourceHealth> | null
  // #2908 (#2010.4) — L'ÉTAT « CORRIGÉ », par champ. `{}` = aucune correction.
  // `profile_context` ci-dessus porte déjà les corrections APPLIQUÉES
  // (`applyProfileContextCorrections`) ; ce champ dit QUOI marquer « corrigé ».
  corrections: ProfileContextCorrections
}

type ValidateFailureCode = 'no_profile_context'

export type ValidateFailure = {
  code: ValidateFailureCode
  message: string
}

@Injectable()
export class ProfileContextService {
  private readonly logger = new Logger(ProfileContextService.name)

  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly iaClient: IaClient,
    private readonly profilerProgress: ProfilerProgressService,
    private readonly profilerGateway: ProfilerGateway,
    private readonly revisions: ProfileContextRevisionService,
    @Inject(CONNECTED_TOOLS_READER)
    private readonly connectedTools: ConnectedToolsReader,
    @Inject(WORKSPACE_ID_READER)
    private readonly workspaceIdReader: WorkspaceIdReader,
    @Inject(ANSWER_META_READER)
    private readonly answerMetaReader: AnswerMetaReader,
    @Inject(BUSINESS_UNITS_READER)
    private readonly businessUnitsReader: BusinessUnitsReader,
    @Inject(SKIPPED_QUESTIONS_READER)
    private readonly skippedQuestionsReader: SkippedQuestionsReader,
    // #2775 — même doctrine que `AnalysisService`/`OnboardingService` :
    // `AnalyticsModule` est `@Global()`, injecté `@Optional()` pour qu'une
    // absence dégrade en no-op plutôt que de faire tomber le graphe, et pour
    // qu'aucun test existant de ce service n'ait à changer sa construction.
    @Optional()
    private readonly analytics?: ProductAnalyticsService,
    // #2074.16 — le port vers Actions (`audit-move-task.port.ts`). `@Optional()` :
    // absent, la décision s'enregistre sans tâche, et aucun test existant ne
    // change sa construction.
    @Optional()
    @Inject(AUDIT_MOVE_TASK_WRITER)
    private readonly auditMoveTasks?: AuditMoveTaskWriter,
  ) {}

  async getMe(userId: string): Promise<ProfileContextSnapshot> {
    const row = await this.profiles.findOne({
      where: { user_id: userId },
      select: [
        'user_id',
        'profile_context',
        'profile_context_status',
        'profile_context_failure_reason',
        'profile_context_validated_at',
        'chosen_entry_strategy',
        'audit_move_decisions',
        'commercial_audit_version',
        'source_health',
        'profile_context_corrections',
      ],
    })
    const status = row?.profile_context_status ?? 'not_generated'
    const corrections: ProfileContextCorrections = row?.profile_context_corrections ?? {}
    // #2062.1 / #2069.1 — LA GARDE DE LECTURE. Corriger un prompt ne corrige
    // pas ce qui est déjà écrit : le 15/09/2026, `/welcome` servait encore « la
    // probabilité d'un besoin urgent » et quatre noms d'entreprises cliquables
    // qu'aucune source n'avait rendus — générés avant leurs correctifs, et
    // dormant dans cette colonne. Ce qui est retenu ici est NOMMÉ (`withheld`),
    // avec la date de l'instantané : la ligne stockée, elle, n'est pas touchée.
    const stored = row?.profile_context ?? null
    const snapshot = stored ? await this.revisions.liveSnapshotMeta(userId) : null
    const { context, withheld } = withheldStoredContext(stored, { schemaVersion: snapshot?.schemaVersion ?? null })
    if (withheld.length > 0) {
      this.logger.warn(`Stored profile_context withheld for user ${userId}: ${withheld.join(', ')}`)
    }
    return {
      // #2908 (#2010.4) — les corrections humaines s'appliquent PAR-DESSUS le
      // contenu généré, ici comme dans `persistSuccess` : « une correction
      // humaine gagne toujours », relue à chaque fois, jamais figée dans la
      // colonne `profile_context` elle-même.
      profile_context: applyProfileContextCorrections(context, corrections),
      status,
      failureReason: status === 'failed' ? parseFailureReason(row?.profile_context_failure_reason) : null,
      withheld: withheld.length > 0 ? { fields: withheld, storedAt: snapshot?.createdAt ?? null } : null,
      // D9 — décision Louis 14/09/2026 : valider le contexte commercial.
      // Gaté sur `status`, jamais lu tel quel : une régénération bascule le
      // statut sans forcément vider la colonne (voir `triggerGeneration`), et
      // un horodatage encore présent dans la base ne veut plus rien dire.
      validatedAt: status === 'validated' ? (row?.profile_context_validated_at?.toISOString() ?? null) : null,
      // #2073.8 — colonne SÉPARÉE du champ calculé, jamais touchée par la
      // garde de lecture ci-dessus (`withheldStoredContext` ne porte que sur
      // `profile_context`) : un choix persisté n'est jamais retenu.
      chosenEntryStrategy: row?.chosen_entry_strategy ?? null,
      // #2074.16 — idem, colonne séparée : `{}` = aucune décision.
      auditMoveDecisions: row?.audit_move_decisions ?? {},
      // #2908 (#2011.4) — idem, colonne séparée : `null` tant qu'aucune
      // génération n'a encore posé d'empreinte.
      commercialAuditVersion: row?.commercial_audit_version ?? null,
      // #2012.12 (épopée #2776) — idem, colonne séparée : `null` tant qu'aucune
      // génération n'a encore posé de signal.
      sourceHealth: row?.source_health ?? null,
      corrections,
    }
  }

  /**
   * #2073.8 — « Choisir cette stratégie » : PERSISTE le choix de
   * l'utilisateur dans SA PROPRE colonne (`profiles.chosen_entry_strategy`),
   * distincte du champ CALCULÉ par le profileur
   * (`profile_context.idealAccountProfile.entryStrategy`).
   *
   * Même raisonnement que {@link validate} ci-dessus : `profiles` ne figure
   * pas dans `PROVENANCE_ENTITY_TYPES` (réservé à account/contact/project/
   * consultant/mission/submission), et ce champ n'a qu'UN SEUL écrivain
   * possible — un clic de l'utilisateur sur SA PROPRE ligne. `applyFieldUpdates`
   * / `decideFieldWrite` arbitrent des écritures CONCURRENTES de plusieurs
   * sources sur LA MÊME colonne (humain / connecteur / pipeline / modèle) ;
   * ici il n'y a qu'une source, sur une colonne DISTINCTE du champ calculé —
   * étendre ce registre pour un geste qui n'a rien à arbitrer inventerait un
   * second arbitre pour rien arbitrer. Le geste utilisateur est auto-approuvé
   * (le clic EST la décision) : pas de confirmation avant cet appel, et un
   * second choix REMPLACE simplement le premier — le dernier clic gagne.
   */
  async chooseEntryStrategy(userId: string, entryStrategy: EntryStrategy): Promise<ProfileContextSnapshot> {
    await this.profiles.update({ user_id: userId }, { chosen_entry_strategy: entryStrategy })
    return this.getMe(userId)
  }

  /**
   * #2074.16 — « L'utilisateur VALIDE ou MODIFIE avant création dans Actions » :
   * PERSISTE le geste (Valider / Modifier / Écarter) sur UN mouvement d'audit
   * PROPOSÉ (`AuditMove`, `packages/contracts/.../commercial-audit-moves.ts`,
   * verrouillé), clé sur SON `ruleId` dans SA PROPRE colonne
   * (`profiles.audit_move_decisions`, JSONB), jamais dans `profile_context`.
   *
   * Même raisonnement que {@link chooseEntryStrategy} juste au-dessus : un
   * clic de l'utilisateur sur SA PROPRE ligne, auto-approuvé (le clic EST la
   * décision), un second geste sur le MÊME `ruleId` REMPLACE simplement le
   * premier. Lecture-puis-écriture (pas un `jsonb_build_object` atomique
   * côté SQL) : acceptable ici parce qu'un seul utilisateur écrit sa propre
   * ligne au clic, jamais deux sources concurrentes sur la même clé.
   */
  async recordAuditMoveDecision(
    userId: string,
    ruleId: string,
    status: AuditMoveDecisionStatus,
    move?: AuditMoveDecisionMove,
  ): Promise<ProfileContextSnapshot> {
    const row = await this.profiles.findOne({ where: { user_id: userId }, select: ['user_id', 'audit_move_decisions'] })
    const decisions: AuditMoveDecisions = { ...(row?.audit_move_decisions ?? {}) }
    decisions[ruleId] = { status, decidedAt: new Date().toISOString() }
    await this.profiles.update({ user_id: userId }, { audit_move_decisions: decisions })
    await this.createAuditMoveTask(userId, ruleId, status, move)
    return this.getMe(userId)
  }

  /**
   * #2074.16 — « Valider » / « Modifier » crée l'action dans Actions (une
   * tâche, au nom de l'appelant) ; « Écarter » n'en crée aucune. Clé
   * d'idempotence `<ruleId>:<cible>` (cible = `AUDIT_MOVE_TARGET_BY_RULE`,
   * `aucune` quand la règle n'en vise pas) : re-valider ne double pas. Sans
   * objet transmis, AUCUNE tâche — un titre ne s'invente pas. Une écriture
   * ratée ne perd pas la décision : re-valider la rejoue, idempotente.
   */
  private async createAuditMoveTask(
    userId: string,
    ruleId: string,
    status: AuditMoveDecisionStatus,
    move: AuditMoveDecisionMove | undefined,
  ): Promise<void> {
    if (status === 'ecarte' || !this.auditMoveTasks) return
    const title = move?.subject?.trim()
    if (!title) return
    const rule = commercialTensionRuleIdSchema.safeParse(ruleId)
    const target = rule.success ? AUDIT_MOVE_TARGET_BY_RULE[rule.data] : null
    try {
      await this.auditMoveTasks.createOnce(userId, {
        sourceKey: `${ruleId}:${target ?? 'aucune'}`,
        title,
        objective: move?.reason?.trim() || null,
        expectedResult: move?.expectedResult?.trim() || null,
      })
    } catch (error) {
      this.logger.warn(`#2074.16 tâche du mouvement ${ruleId} non posée : ${(error as Error).message}`)
    }
  }

  /**
   * #2908 (#2010.4) — « corriger ce champ » : PERSISTE une correction humaine
   * sur UN champ FERMÉ de `profile_context` (`PROFILE_CONTEXT_CORRECTABLE_FIELDS`,
   * packages/contracts), clé sur son chemin dans SA PROPRE colonne
   * (`profiles.profile_context_corrections`, JSONB) — jamais dans
   * `profile_context` lui-même, qui est réécrit EN ENTIER à chaque
   * régénération (#2009). Même raisonnement que {@link recordAuditMoveDecision}
   * juste au-dessus : un clic de l'utilisateur sur SA propre ligne,
   * auto-approuvé, un second geste sur le MÊME champ REMPLACE simplement le
   * premier. La lecture (`getMe`/`validate`) applique cette correction
   * PAR-DESSUS le contenu généré, régénération comprise : la colonne séparée
   * n'est jamais touchée par une régénération, donc la correction survit.
   */
  async correctField(
    userId: string,
    field: ProfileContextCorrectableField,
    value: string,
  ): Promise<ProfileContextSnapshot> {
    const row = await this.profiles.findOne({
      where: { user_id: userId },
      select: ['user_id', 'profile_context_corrections'],
    })
    const corrections: ProfileContextCorrections = { ...(row?.profile_context_corrections ?? {}) }
    corrections[field] = { value, correctedAt: new Date().toISOString() }
    await this.profiles.update({ user_id: userId }, { profile_context_corrections: corrections })
    return this.getMe(userId)
  }

  async setStatus(
    userId: string,
    status: ProfileContextStatus,
    failureReason?: ProfileContextFailureReason,
  ): Promise<void> {
    // #4969 — la raison n'existe que sous `failed` : tout autre statut l'efface (jamais une raison périmée).
    await this.profiles.update(
      { user_id: userId },
      status === 'failed'
        ? { profile_context_status: status, profile_context_failure_reason: failureReason ?? null }
        : { profile_context_status: status },
    )
  }

  /**
   * #2075.B — POST /profile-context/validate : l'appelant est
   * `CommercialAuditScreen` (le bouton « Relire et valider », branche
   * `page-restitution-audit`, pas encore fusionnée — voir le rapport de ce lot).
   *
   * Une correction humaine gagne toujours : ce n'est PAS un champ à provenance
   * multiple (humain vs pipeline vs modèle, `packages/contracts/.../provenance.ts`,
   * réservé à `account`/`contact`/`project`/`consultant`/`mission`/`submission`) —
   * `profiles` n'y figure pas, et c'est le SEUL geste qui écrit ce champ : un
   * clic de l'utilisateur sur SA propre ligne. Le chemin `applyFieldUpdates` /
   * `decideFieldWrite` ne s'applique donc pas ici sans étendre ce registre, hors
   * périmètre de ce lot.
   *
   * On archive, on ne supprime pas : ce geste ne touche JAMAIS
   * `profile_context_revisions` — l'historique par version reste intact, cette
   * écriture ne fait que dater la validation du contenu actuellement en place.
   * `undefined` refusé AVANT la lecture (findOne avec `user_id: undefined`
   * rendrait la première ligne de la table).
   */
  async validate(userId: string): Promise<Result<ProfileContextSnapshot, ValidateFailure>> {
    if (!userId) return failure({ code: 'no_profile_context', message: 'Identifiant utilisateur manquant' })

    const row = await this.profiles.findOne({
      where: { user_id: userId },
      select: [
        'user_id',
        'profile_context',
        'profile_context_status',
        'profile_context_version',
        'chosen_entry_strategy',
        'audit_move_decisions',
        'commercial_audit_version',
        'source_health',
        'profile_context_corrections',
      ],
    })
    if (!row?.profile_context) {
      return failure({
        code: 'no_profile_context',
        message: 'Aucun contexte de profil généré : rien à valider.',
      })
    }

    const validatedAt = new Date()
    await this.profiles.update(
      { user_id: userId },
      {
        profile_context_status: 'validated',
        profile_context_validated_at: validatedAt,
        // #2010.17 — survit à la PROCHAINE régénération (qui remet
        // `profile_context_validated_at` à `null` et bouge
        // `profile_context_version`) : c'est ce qui permet, pendant une revue
        // en cours, de retrouver QUELLE ancienne révision était la dernière
        // validée (`ProfileContextRevisionService.list`, `was_last_validated`).
        last_validated_context_version: row.profile_context_version,
      },
    )

    // #2062.1 — la même garde de lecture qu'au `getMe` : valider le contexte ne
    // valide pas une phrase que la doctrine refuse. La réponse rend donc le
    // contexte SERVABLE, et nomme ce qui a été retenu.
    const snapshot = await this.revisions.liveSnapshotMeta(userId)
    const { context, withheld } = withheldStoredContext(row.profile_context, {
      schemaVersion: snapshot?.schemaVersion ?? null,
    })
    const corrections: ProfileContextCorrections = row.profile_context_corrections ?? {}
    return success({
      profile_context: applyProfileContextCorrections(context, corrections),
      status: 'validated',
      // #4969 — une contexte validé n'a pas échoué : aucune raison d'échec.
      failureReason: null,
      validatedAt: validatedAt.toISOString(),
      withheld: withheld.length > 0 ? { fields: withheld, storedAt: snapshot?.createdAt ?? null } : null,
      // #2073.8 — colonne séparée, non touchée par la validation : la réponse
      // remplace le cache entier côté écran (`useValidateProfileContext`), un
      // choix déjà fait ne doit donc pas sembler s'être effacé au clic.
      chosenEntryStrategy: row.chosen_entry_strategy ?? null,
      // #2074.16 — idem.
      auditMoveDecisions: row.audit_move_decisions ?? {},
      // #2908 (#2011.4) — idem : colonne séparée, la validation ne la touche pas.
      commercialAuditVersion: row.commercial_audit_version ?? null,
      // #2012.12 (épopée #2776) — idem : colonne séparée, la validation ne la touche pas.
      sourceHealth: row.source_health ?? null,
      // #2908 (#2010.4) — idem : colonne séparée, la validation ne la touche pas.
      corrections,
    })
  }

  // #2009.14 — `generationKey` voyage jusqu'ici pour être persisté à côté du
  // contexte lui-même : c'est ce que {@link triggerGeneration} relit au
  // prochain appel pour reconnaître une répétition et réutiliser ce résultat.
  private async persistSuccess(
    userId: string,
    profileContext: ProfileContext,
    generationKey: string,
    // #2012.12 (épopée #2776) — la couverture réduite par source facultative
    // (`AgentMeta.source_health`), jusque-là jetée à cette même frontière.
    // Colonne séparée de `profile_context` : `meta` et `data` restent deux
    // objets distincts sur l'enveloppe.
    sourceHealth: Record<string, SourceHealth> | null,
  ): Promise<void> {
    try {
      await this.revisions.recordNewVersion(userId, profileContext, generationKey)
      // #2908 (#2011.4) — l'EMPREINTE DE CONTENU, posée à côté du compteur que
      // `recordNewVersion` vient de faire avancer. Calculée sur le contenu
      // reçu du modèle, jamais recalculée depuis la ligne relue : les deux
      // doivent porter EXACTEMENT le même contenu.
      await this.profiles.update(
        { user_id: userId },
        { commercial_audit_version: commercialAuditVersionOf(profileContext), source_health: sourceHealth },
      )
      this.logger.log(`Profile context persisted for user ${userId}`)
    } catch (err) {
      this.logger.error(`Failed to persist profile context for user ${userId}`, err instanceof Error ? err.stack : err)
      await this.setStatus(userId, 'failed', 'persist_failed')
      await this.profilerGateway.emitError(userId, 'Persistance du profil échouée.')
      // #2775 — la panne RÉELLE est ICI, pas au retour du modèle : le modèle a
      // répondu, `recordNewVersion` a échoué. `stage: 'persist'` distingue
      // cette panne de celle du modèle lui-même (`stage: 'llm'`, voir
      // `triggerGeneration`) — deux événements RÉELS, jamais confondus.
      void this.analytics?.track('onboarding_generation_failed', { userId, properties: { stage: 'persist' } })
      return
    }
    await this.profilerGateway.emitDone(userId)
    // #2775 — le seul instant où la génération est VRAIMENT terminée : la
    // révision est ÉCRITE, pas seulement reçue du modèle.
    void this.analytics?.track('onboarding_generation_completed', { userId })
  }

  /**
   * #2008/#2009 — clé d'idempotence : workspace + BU + utilisateur + version
   * du prompt + contenu des réponses.
   *
   * #2009.11 — la version du prompt PROFILEUR entre désormais dans la clé :
   * lue côté IA (`GET /config/prompt-version/profiler`, `prompt_version_for`,
   * seule source de vérité, GA-26) via {@link IaClient.promptVersion} et
   * {@link resolvePromptVersion}, AVANT l'appel générateur. `unknown` quand la
   * lecture échoue — jamais un blocage de la génération pour une métadonnée
   * non critique, même doctrine que le workspace et la BU ci-dessous.
   *
   * #2009.8 — la BU entre dans la clé : les périmètres PORTÉS (lus par
   * {@link BusinessUnitsReader}, bornés à l'espace actif et à l'utilisateur).
   * ⚠️ Sans périmètre porté, la clé reste BYTE-IDENTIQUE à celle d'avant :
   * aucun profil déjà généré n'est régénéré parce que la couche BU existe.
   * Le WORKSPACE, lui, est maintenant résolu par {@link WorkspaceIdReader}
   * (#2009.7) — `null` pour un profil legacy sans espace, jamais deviné. Le
   * contenu des réponses (JSON à clés triées) tient toujours lieu de
   * « version des réponses » : deux appels aux réponses byte-identiques, dans
   * le MÊME espace, portent la même clé.
   */
  private generationKey(
    userId: string,
    workspaceId: string | null,
    businessUnits: readonly AnalysisBusinessUnit[],
    promptVersion: string | null,
    answers: EsnAnswers,
  ): string {
    // #2009.8 — le périmètre, sous une forme STABLE (champs dans un ordre fixe,
    // la liste déjà triée par nom à la lecture) : deux lectures du même
    // périmètre donnent la même clé.
    const scope =
      businessUnits.length > 0
        ? `bu=${JSON.stringify(
            businessUnits.map(unit => [unit.name, unit.kind, unit.territory ?? null, unit.specialties ?? []]),
          )}:`
        : ''
    // #2009.11 — `unknown` quand la lecture a échoué : un contexte déjà
    // généré n'est pas invalidé par une panne de métadonnée sans rapport.
    return `${userId}:${workspaceId ?? 'none'}:${scope}prompt=${promptVersion ?? 'unknown'}:${JSON.stringify(answers, Object.keys(answers).sort())}`
  }

  /**
   * #2009.11 — résolu AVANT le calcul de la clé, comme l'espace et le
   * périmètre porté : `IaClient.promptVersion` dégrade déjà en `null` sur une
   * panne réseau, mais cette lecture ne doit jamais non plus bloquer le
   * déclenchement de la génération elle-même — même doctrine que
   * {@link resolveWorkspaceId}.
   */
  private async resolvePromptVersion(): Promise<string | null> {
    try {
      return await this.iaClient.promptVersion('profiler')
    } catch (error) {
      this.logger.warn('Prompt version unreadable — idempotency key degrades to prompt=unknown', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * #2007.3 / #2009.8 — résolu AVANT le calcul de la clé, comme l'espace.
   * Best-effort : une lecture ratée dégrade en `[]` (même doctrine que
   * {@link resolveConnectedTools}) — jamais un périmètre deviné.
   */
  private async resolveBusinessUnits(userId: string): Promise<AnalysisBusinessUnit[]> {
    try {
      return await this.businessUnitsReader.resolveCarriedBusinessUnits(userId)
    } catch (error) {
      this.logger.warn('Business units unreadable — profiler call degrades to []', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return []
    }
  }

  /**
   * #2009.7 — résolu AVANT le calcul de la clé : une lecture ratée ne doit
   * jamais bloquer la génération elle-même, elle dégrade en `null` (même
   * espace que « pas de workspace »), comme {@link resolveConnectedTools}.
   */
  private async resolveWorkspaceId(userId: string): Promise<string | null> {
    try {
      return await this.workspaceIdReader.resolveWorkspaceId(userId)
    } catch (error) {
      this.logger.warn('Workspace id unreadable — idempotency key degrades to no-workspace', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return null
    }
  }

  /**
   * #2007.8 — les outils RÉELLEMENT branchés pour cet utilisateur, distincts
   * des réponses `tooling_*` déclaratives déjà portées par `answers`. Lus par
   * un PORT (`connected-tools.port.ts`) et non par le service du registre :
   * GA-07 refuse qu'un service aille chercher celui d'un autre module, et la
   * traduction « outil connecté → nom affichable » vit donc dans le câblage,
   * pas ici. Best-effort : une lecture ratée dégrade en `[]`, jamais bloquante
   * pour la génération elle-même.
   */
  private async resolveConnectedTools(userId: string): Promise<string[]> {
    try {
      return await this.connectedTools.listConnected(userId)
    } catch (error) {
      this.logger.warn('Connected tools unreadable — profiler call degrades to []', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return []
    }
  }

  /**
   * #2007.6/#2007.7/#2007.10/#2007.12 — la carte de provenance/statut,
   * résolue best-effort : une lecture ratée dégrade en `{}` (même doctrine
   * que {@link resolveConnectedTools}), donc `deriveAnswerProvenanceForModel`
   * rend trois listes vides plutôt que de bloquer la génération.
   */
  private async resolveAnswerProvenance(userId: string) {
    try {
      const meta = await this.answerMetaReader.resolveAnswerMeta(userId)
      return deriveAnswerProvenanceForModel(meta)
    } catch (error) {
      this.logger.warn('Answer provenance unreadable — profiler call degrades to empty lists', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return deriveAnswerProvenanceForModel({})
    }
  }

  /**
   * #2007.11 — les clés passées volontairement, résolues best-effort : une
   * lecture ratée dégrade en `[]` (même doctrine que
   * {@link resolveAnswerProvenance}), jamais bloquante pour la génération.
   */
  private async resolveSkippedQuestions(userId: string): Promise<string[]> {
    try {
      return await this.skippedQuestionsReader.resolveSkippedQuestionKeys(userId)
    } catch (error) {
      this.logger.warn('Skipped questions unreadable — profiler call degrades to []', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      })
      return []
    }
  }

  /**
   * #2009.15 — la « version d'entrée » à journaliser. JAMAIS le contenu des
   * réponses en clair (doctrine sécurité, aucune donnée métier dans un log) :
   * seul un hash court les représente — deux appels aux réponses
   * byte-identiques portent le même `answersVersion`, sans qu'on puisse
   * relire une seule réponse depuis le journal.
   */
  private answersVersion(answers: EsnAnswers): string {
    return createHash('sha256')
      .update(JSON.stringify(answers, Object.keys(answers).sort()))
      .digest('hex')
      .slice(0, 12)
  }

  // #2008 — générations en cours, par clé d'idempotence. Empêche le double
  // déclenchement prouvé par l'audit #2009 : `esn-profile.controller.ts`
  // (`updateMine`) appelle `upsertAnswers()` — qui déclenche déjà une
  // génération en tâche de fond — PUIS rappelle `triggerGeneration()` sur les
  // MÊMES réponses résolues, payant le modèle deux fois pour un seul geste.
  // En mémoire process (pas de file partagée entre réplicas) : un doublon qui
  // atterrit sur une AUTRE instance n'est pas vu — limite assumée, même
  // périmètre que ci-dessus.
  private readonly inFlightGenerations = new Set<string>()

  /**
   * Resolves once `status='generating'` is persisted so the caller can
   * return an HTTP response that, when re-queried, reflects the new state.
   *
   * `options.reedited` — D9 (décision Louis 14/09/2026, valider le contexte
   * commercial) : `true` UNIQUEMENT quand cet appel vient d'une RÉÉDITION des
   * réponses ESN (`EsnProfileService.upsertAnswers`, où le contenu qui a
   * produit le contexte vient réellement de changer). Tout autre appelant —
   * le bouton « Régénérer » (`regenerateProfileContext`), le déclenchement
   * automatique sur changement de prénom (`ProfilesService.upsertMe`) — laisse
   * le défaut `false`. Une correction humaine gagne toujours : un contexte
   * VALIDÉ n'est jamais écrasé par un chemin qui n'a rien réédité, et
   * seule une réédition retire sa validation.
   */
  async triggerGeneration(userId: string, answers: EsnAnswers, options: { reedited?: boolean } = {}): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(userId)
    // #2007.3 / #2009.8 — le périmètre porté, lu une fois : il part au
    // Profileur ET dans la clé (deux usages, une seule lecture).
    const businessUnits = await this.resolveBusinessUnits(userId)
    // #2009.11 — la version du prompt PROFILEUR, lue côté IA avant l'appel.
    const promptVersion = await this.resolvePromptVersion()
    const key = this.generationKey(userId, workspaceId, businessUnits, promptVersion, answers)

    // #2008 — une génération identique est déjà en cours : ne pas en lancer
    // une seconde. Le client ouvre son état d'avancement via le statut déjà
    // exposé (`GET /profile-context/me`) et le canal socket existant — cette
    // méthode n'a rien de plus à faire pour cet appel.
    if (this.inFlightGenerations.has(key)) {
      this.logger.log(`Profile generation already in flight for user ${userId} — skipping duplicate trigger`)
      return
    }
    // Posé de façon SYNCHRONE, avant le premier `await` : deux appels
    // rapprochés (même tick) voient tous les deux la clé posée par le
    // premier avant que son propre `await this.setStatus(...)` ne rende la
    // main — sinon la fenêtre entre la lecture et l'écriture du Set
    // laisserait passer exactement le doublon qu'on veut fermer.
    this.inFlightGenerations.add(key)
    try {
      const profile = await this.profiles.findOne({
        where: { user_id: userId },
        select: ['user_id', 'first_name', 'profile_context_status', 'profile_context_generation_key'],
      })

      // D9 — décision Louis 14/09/2026 : valider le contexte commercial. Un
      // chemin qui n'a rien réédité ne touche jamais un contexte validé — il
      // libère sa propre clé d'idempotence AVANT de sortir, pour qu'une
      // réédition juste après ne se trouve pas bloquée derrière un
      // déclenchement qui n'a jamais démarré de génération.
      if (profile?.profile_context_status === 'validated' && !options.reedited) {
        this.logger.log(`Profile context validated for user ${userId} — automatic regeneration skipped (D9)`)
        this.inFlightGenerations.delete(key)
        return
      }

      // #2009.14 — une génération RÉUSSIE existe déjà pour cette MÊME clé
      // (même utilisateur, même espace, mêmes réponses) : rien de nouveau à
      // demander au modèle, `profile_context` porte déjà ce résultat. Un
      // `failed` avec la même clé n'entre PAS ici : un échec doit pouvoir se
      // rejouer, jamais se voir « réutilisé ».
      if (profile?.profile_context_status === 'succeeded' && profile.profile_context_generation_key === key) {
        this.logger.log(`Profile generation result reused for user ${userId} — same idempotency key`)
        this.inFlightGenerations.delete(key)
        return
      }

      if (options.reedited) {
        await this.profiles.update(
          { user_id: userId },
          { profile_context_status: 'generating', profile_context_validated_at: null },
        )
      } else {
        await this.setStatus(userId, 'generating')
      }
      // #2009.15 — journalise le déclenchement RÉEL (pas le doublon skip,
      // déjà loggé plus haut, ni le saut D9) : le déclencheur, l'auteur, et
      // une version d'entrée qui ne porte jamais le contenu des réponses.
      this.logger.log(
        `Profile generation started — trigger=${options.reedited ? 'reedited' : 'regenerate'} user=${userId} answersVersion=${this.answersVersion(answers)}`,
      )
      // #2775 — le même garde-fou que le log ci-dessus : posé ICI, jamais sur
      // un déclenchement SAUTÉ (doublon #2008, D9, résultat réutilisé #2009.14
      // — les trois `return` au-dessus n'atteignent jamais cette ligne). C'est
      // l'instant où le travail RÉEL commence côté backend, pas la réponse
      // HTTP qui le précède (`triggerGeneration` résout dès que le statut
      // passe à `generating`, bien avant que le modèle ait répondu).
      void this.analytics?.track('onboarding_generation_started', {
        userId,
        workspaceId,
        properties: { reedited: options.reedited === true },
      })
      const progressCallback = this.profilerProgress.buildCallback(userId)
      // #2007.8 — résolu APRÈS le retour synchrone (status déjà persisté) :
      // une lecture lente du registre d'outils ne retarde jamais la réponse
      // HTTP, seulement l'appel au Profileur qui tournait déjà en tâche de
      // fond.
      Promise.all([
        this.resolveConnectedTools(userId),
        this.resolveAnswerProvenance(userId),
        this.resolveSkippedQuestions(userId),
      ])
        .then(([connectedTools, provenance, skippedQuestionKeys]) =>
          this.iaClient.generateProfile({
            userId,
            firstName: profile?.first_name,
            answers,
            connectedTools,
            // #2007.3 — le périmètre PORTÉ (BU / agence), borné espace + utilisateur.
            businessUnits,
            answerProvenanceLines: provenance.answerProvenanceLines,
            importedContextKeys: provenance.importedContextKeys,
            correctedAnswersLines: provenance.correctedAnswersLines,
            // #2007.11 — les clés que l'utilisateur a volontairement PASSÉES.
            skippedQuestionKeys,
            progressCallback,
          }),
        )
        .then(envelope => {
          if (envelope.status === 'success' && envelope.data) {
            return this.persistSuccess(userId, envelope.data, key, envelope.meta?.source_health ?? null)
          }
          // #2775 — le modèle a répondu mais sans succès (`error`/`cancelled`) :
          // une panne RÉELLE côté modèle, jamais côté persistance (`persistSuccess`
          // n'a jamais été appelé) — `stage: 'llm'` le distingue de `'persist'`.
          void this.analytics?.track('onboarding_generation_failed', { userId, properties: { stage: 'llm' } })
          return this.setStatus(userId, 'failed', 'model_error')
        })
        .catch(err => {
          this.logger.error(`Profiler generation failed for user ${userId}`, err instanceof Error ? err.stack : err)
          void this.analytics?.track('onboarding_generation_failed', { userId, properties: { stage: 'llm' } })
          return this.setStatus(userId, 'failed', 'model_unreachable')
        })
        .finally(() => {
          this.inFlightGenerations.delete(key)
        })
    } catch (err) {
      // La préparation (statut, lecture du prénom) a échoué avant même de
      // lancer l'appel IA — libérer la clé pour qu'un retry ne reste pas
      // bloqué derrière une génération qui n'a jamais démarré.
      this.inFlightGenerations.delete(key)
      throw err
    }
  }

  /**
   * #2908 (#2010.16 / #2011.10) — « Régénérer cette section » : le Profileur
   * ne sait produire `profile_context` qu'en UN appel (`apps/ia/app/agents/
   * profiler.py` n'a aucun prompt par section) — la tranche minimale qui lève
   * le geste empêché sans construire ce découpage côté modèle relance donc
   * l'appel COMPLET, puis ne RETIENT que la section demandée
   * (`mergeRegeneratedProfileContextSection`, @bellum/contracts) : les autres
   * sections du contenu persisté ne bougent pas.
   *
   * Contrairement à {@link triggerGeneration} (fire-and-forget, suivi par
   * socket), ATTENDU en entier : une régénération de section n'a pas besoin
   * du statut global `generating` (le reste de l'écran reste affichable
   * pendant l'appel) ni du canal de progression — l'appelant HTTP porte son
   * propre état de chargement. Même borne de temps que la génération
   * complète (`IaClient.generateProfile`, `timeoutMs: 120_000`).
   *
   * Rien à fusionner (aucun `profile_context` encore persisté) : la section
   * régénérée ne remplace rien, `mergeRegeneratedProfileContextSection` rend
   * alors le résultat frais en entier — même repli qu'une première
   * génération.
   */
  async regenerateSection(
    userId: string,
    answers: EsnAnswers,
    section: ProfileContextRegenerableSection,
  ): Promise<ProfileContextSnapshot> {
    const row = await this.profiles.findOne({
      where: { user_id: userId },
      select: ['user_id', 'first_name', 'profile_context'],
    })

    const workspaceId = await this.resolveWorkspaceId(userId)
    const businessUnits = await this.resolveBusinessUnits(userId)
    const promptVersion = await this.resolvePromptVersion()
    const [connectedTools, provenance, skippedQuestionKeys] = await Promise.all([
      this.resolveConnectedTools(userId),
      this.resolveAnswerProvenance(userId),
      this.resolveSkippedQuestions(userId),
    ])

    const envelope = await this.iaClient.generateProfile({
      userId,
      firstName: row?.first_name,
      answers,
      connectedTools,
      businessUnits,
      answerProvenanceLines: provenance.answerProvenanceLines,
      importedContextKeys: provenance.importedContextKeys,
      correctedAnswersLines: provenance.correctedAnswersLines,
      skippedQuestionKeys,
    })

    if (envelope.status === 'success' && envelope.data) {
      const merged = mergeRegeneratedProfileContextSection(row?.profile_context ?? null, section, envelope.data)
      // Suffixe `:section=` — jamais la même clé qu'une génération complète
      // sur les mêmes réponses : les deux doivent pouvoir tourner sans que
      // #2009.14 (résultat réutilisé) n'avale l'une pour l'autre.
      const key = `${this.generationKey(userId, workspaceId, businessUnits, promptVersion, answers)}:section=${section}`
      await this.persistSuccess(userId, merged, key, envelope.meta?.source_health ?? null)
    } else {
      this.logger.warn(`Section regeneration failed for user ${userId}, section=${section}`)
    }
    return this.getMe(userId)
  }
}
