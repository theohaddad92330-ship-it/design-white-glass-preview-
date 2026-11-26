import { callAnalysisRefusal } from '@bellum/contracts'
import type {
  CallAnalysis,
  CallInProgressState,
  CallLogOutcome,
  CallRecord,
  CallStateEvent,
  TelephonyCredentials,
  TelephonyStatus,
  WriteSource,
} from '@bellum/contracts'
import { BadRequestException, ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'node:crypto'
import { Repository } from 'typeorm'
import { TelephonyCallLogEntity } from '../../database/entities/telephony-call-log.entity'
import { TelephonyCallStateEntity } from '../../database/entities/telephony-call-state.entity'
import { TelephonyConnectionEntity } from '../../database/entities/telephony-connection.entity'
import { CrmService } from '../crm/crm.service'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { IaClient } from '../ia/ia.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { composeCallNote } from './call-parse'
import { DEFAULT_CALL_WINDOW_DAYS, fetchTranscript, listCalls, probe, type TelephonyAccess } from './telephony.client'

/**
 * #2403.12 — combien de temps un état `in_progress` reste valide SANS
 * confirmation. Même plafond que `MEETING_LOOKBACK_MS` (`laura.controller.ts`)
 * : un appel plus long que ça n'est pas réaliste pour ce produit, et un
 * `call.ended` perdu ne doit pas couper Laura indéfiniment — un timeout n'est
 * pas un échec (doctrine), mais il n'arrête pas non plus la reprise pour
 * toujours.
 */
export const CALL_STATE_MAX_DURATION_MS = 4 * 60 * 60 * 1000

/** Combien de temps un état `terminated` reste visible avant de périmer — la
 *  ligne existe surtout pour l'idempotence du webhook, pas pour être lue longtemps. */
export const CALL_STATE_TERMINATED_TTL_MS = 5 * 60 * 1000

/**
 * La téléphonie : journal d'appels, et transcriptions quand l'espace les a
 * autorisées.
 *
 * Ce que ce service fait, et surtout ce qu'il ne fait pas :
 *
 * - **Il ne transcrit rien.** Il lit ce que l'outil d'appel a déjà produit.
 *   Enregistrer une conversation est une décision de l'ESN, pas un service qu'on
 *   rend en douce.
 * - **Il ne lit une transcription que si la case est cochée.** Le défaut est
 *   `false` en base : une connexion créée sans que la question soit posée ne lit
 *   aucune transcription.
 * - **Il ne journalise jamais deux fois le même appel.** La trace est écrite
 *   AVANT la note, dans une table à contrainte d'unicité : deux passes
 *   concurrentes ne peuvent pas produire deux notes.
 */
@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name)

  constructor(
    @InjectRepository(TelephonyConnectionEntity)
    private readonly connections: Repository<TelephonyConnectionEntity>,
    @InjectRepository(TelephonyCallLogEntity)
    private readonly logs: Repository<TelephonyCallLogEntity>,
    @InjectRepository(TelephonyCallStateEntity)
    private readonly callStates: Repository<TelephonyCallStateEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Le versement au CRM. `@Optional()` : sans CRM connecté, les appels se
    // lisent quand même — ils ne se journalisent simplement nulle part.
    @Optional() private readonly crm?: CrmService,
    // #4016 L12 — l'analyse d'un appel passe par le même modèle de structuration
    // que les comptes rendus de rendez-vous. `@Optional()` : sans lui, l'analyse
    // est indisponible et le reste de la téléphonie marche.
    @Optional() private readonly ia?: IaClient,
  ) {}

  async status(userId: string): Promise<TelephonyStatus> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    if (!row) {
      return {
        connected: false,
        provider: null,
        connectedAt: null,
        transcriptsEnabled: false,
        recordingConsentAnnounced: false,
      }
    }
    return {
      connected: true,
      provider: row.provider,
      connectedAt: row.created_at?.toISOString() ?? null,
      transcriptsEnabled: row.transcripts_enabled,
      recordingConsentAnnounced: row.recording_consent_announced === true,
    }
  }

  /**
   * Enregistre les identifiants de l'espace.
   *
   * Refusé en salle de démonstration, comme l'ATS : un prospect ne dépose pas
   * les clés du standard téléphonique de son entreprise sur un espace que
   * d'autres visiteurs traversent.
   */
  async connect(userId: string, credentials: TelephonyCredentials): Promise<TelephonyStatus> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException('La connexion d’un outil d’appel est désactivée dans l’espace de démonstration.')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const secret =
      credentials.provider === 'aircall'
        ? `${credentials.apiId ?? ''}\n${credentials.apiKey}`
        : credentials.provider === 'allo'
          ? `${credentials.alloNumber ?? ''}\n${credentials.apiKey}`
          : credentials.apiKey

    const existing = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    await this.connections.save(
      this.connections.create({
        ...(existing ? { id: existing.id } : {}),
        workspace_id: workspaceId,
        created_by: userId,
        provider: credentials.provider,
        credentials_enc: encryptToken(secret),
        transcripts_enabled: credentials.transcriptsEnabled,
        // #4016 L12 — la déclaration est DATÉE quand elle est faite ; reconnecter
        // l'outil ne rajeunit pas une déclaration déjà posée.
        recording_consent_announced: credentials.recordingConsentAnnounced,
        recording_consent_announced_at: credentials.recordingConsentAnnounced
          ? existing?.recording_consent_announced
            ? (existing.recording_consent_announced_at ?? new Date())
            : new Date()
          : null,
        last_used_at: null,
      }),
    )
    return this.status(userId)
  }

  async disconnect(userId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.connections.delete({ workspace_id: workspaceId })
    // Une connexion supprimée ne doit pas laisser un état "en appel" orphelin
    // que plus rien ne peut jamais terminer.
    await this.callStates.delete({ workspace_id: workspaceId })
  }

  /**
   * #2403.12 — (RE)GÉNÈRE le secret du webhook « appel en cours ».
   *
   * Rendu en clair UNE SEULE FOIS, dans la réponse — jamais relu ensuite (même
   * discipline que les identifiants d'API : `credentials_enc` n'est exposé par
   * aucune route). Une rotation invalide immédiatement l'ancien secret : deux
   * appels concurrents à cette route ne peuvent pas laisser les deux secrets
   * actifs à la fois, le second `save` gagne.
   */
  async rotateWebhookSecret(
    userId: string,
    apiPublicUrl: string | undefined,
  ): Promise<{ webhookUrl: string; secret: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const existing = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    if (!existing) throw new BadRequestException('Aucun outil d’appel connecté.')

    const secret = randomBytes(32).toString('hex')
    await this.connections.update({ workspace_id: workspaceId }, { webhook_secret_enc: encryptToken(secret) })

    const base = (apiPublicUrl ?? '').replace(/\/+$/, '')
    return { webhookUrl: `${base}/webhooks/telephony/${workspaceId}`, secret }
  }

  /**
   * #2403.12 — applique un événement du webhook « appel en cours ».
   *
   * Retourne `false` sans lever quand l'espace n'a pas (encore) de secret de
   * webhook configuré — c'est au contrôleur, qui a déjà lu ce secret pour
   * vérifier la signature, de décider du code HTTP (503) ; ce service ne
   * connaît que l'état métier.
   */
  async applyCallEvent(workspaceId: string, event: CallStateEvent): Promise<void> {
    const now = new Date()
    const state: CallInProgressState = event.event === 'call.started' ? 'in_progress' : 'terminated'
    const expiresAt = new Date(
      now.getTime() + (state === 'in_progress' ? CALL_STATE_MAX_DURATION_MS : CALL_STATE_TERMINATED_TTL_MS),
    )

    const existing = await this.callStates.findOne({ where: { workspace_id: workspaceId, user_id: event.userId } })
    await this.callStates.save(
      this.callStates.create({
        ...(existing ? { id: existing.id } : {}),
        workspace_id: workspaceId,
        user_id: event.userId,
        state,
        call_id: event.callId,
        expires_at: expiresAt,
      }),
    )
  }

  /**
   * #2403.12 — CE membre de l'espace est-il en appel MAINTENANT ?
   *
   * `false` par défaut — aucun état, un état `terminated`, ou un état
   * `in_progress` PÉRIMÉ (webhook `call.ended` jamais reçu) se rendent tous
   * pareil : Laura ne se tait jamais sur une supposition, seulement sur un
   * état CONNU et FRAIS.
   */
  async isCallInProgress(workspaceId: string, userId: string, now: Date = new Date()): Promise<boolean> {
    const row = await this.callStates.findOne({ where: { workspace_id: workspaceId, user_id: userId } })
    if (!row) return false
    return row.state === 'in_progress' && row.expires_at.getTime() > now.getTime()
  }

  /**
   * Le secret de webhook DÉCHIFFRÉ de l'espace — lu par le contrôleur pour
   * vérifier une signature, jamais rendu par une route.
   */
  async webhookSecretFor(workspaceId: string): Promise<string | null> {
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    if (!row?.webhook_secret_enc) return null
    return decryptToken(row.webhook_secret_enc)
  }

  /** Les identifiants répondent-ils ? */
  async test(userId: string): Promise<{ reachable: boolean }> {
    const access = await this.resolveAccess(userId)
    if (!access) throw new BadRequestException('Aucun outil d’appel connecté.')
    return { reachable: await probe(access.access) }
  }

  /**
   * Les appels de la fenêtre.
   *
   * Sert « prépare mon prochain call avec l'historique » (§14 n°37) et le brief
   * d'avant rendez-vous. Sans connexion, on rend une liste vide APRÈS l'avoir
   * dit dans `status` — l'écran ne doit jamais présenter « aucun appel » quand
   * la vérité est « aucun outil branché ».
   */
  async listRecentCalls(userId: string, options: { days?: number; limit?: number } = {}): Promise<CallRecord[]> {
    const resolved = await this.resolveAccess(userId)
    if (!resolved) return []
    const since = new Date(Date.now() - (options.days ?? DEFAULT_CALL_WINDOW_DAYS) * 86_400_000)
    const calls = await listCalls(resolved.access, since, options.limit)
    if (!resolved.transcriptsEnabled) return calls

    // Les transcriptions sont chargées une par une et sans jamais faire tomber
    // l'appel : un fournisseur qui refuse la transcription rend un appel sans
    // transcription, pas une erreur.
    return Promise.all(
      calls.map(async call => ({ ...call, transcript: await fetchTranscript(resolved.access, call.id) })),
    )
  }

  /**
   * #4016 L12 (Louis 11/10) — ANALYSE UN APPEL ENREGISTRÉ, AVEC CONSENTEMENT ANNONCÉ.
   *
   * Renversement daté de GA-399 : on analyse des appels, mais jamais sans que
   * l'espace ait déclaré que l'enregistrement est annoncé aux deux parties
   * (art. 226-1 du Code pénal). Les refus passent AVANT toute lecture de
   * transcription et tout appel au modèle : sans la déclaration, le texte d'une
   * conversation ne quitte même pas l'outil d'appel.
   *
   * Le résultat est calculé à la demande et RENDU, jamais stocké : le corps d'une
   * conversation n'est pas archivé par Bellum. Une transcription absente n'est
   * pas remplacée par un résumé inventé.
   */
  async analyzeCall(userId: string, callId: string): Promise<CallAnalysis> {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException('L’analyse d’appels est indisponible dans l’espace de démonstration.')
    }
    const resolved = await this.resolveAccess(userId)
    if (!resolved) throw new BadRequestException('Aucun outil d’appel connecté.')

    const refusal = callAnalysisRefusal({
      transcriptsEnabled: resolved.transcriptsEnabled,
      recordingConsentAnnounced: resolved.recordingConsentAnnounced,
    })
    if (refusal === 'consent_not_announced') {
      throw new ForbiddenException(
        'L’enregistrement des appels n’est pas déclaré comme annoncé aux deux parties : aucun appel n’est analysé.',
      )
    }
    if (refusal === 'transcripts_disabled') {
      throw new ForbiddenException('La lecture des transcriptions est désactivée pour cet espace.')
    }
    if (!this.ia) throw new BadRequestException('L’analyse d’appels n’est pas disponible.')

    const transcript = (await fetchTranscript(resolved.access, callId))?.trim()
    if (!transcript) throw new BadRequestException('Aucune transcription disponible pour cet appel.')

    const envelope = await this.ia.structureMeetingNotes({
      notes: transcript,
      fromTranscript: true,
      inputKind: 'transcript',
    })
    await this.touch(resolved.workspaceId)
    return toCallAnalysis(callId, (envelope?.data ?? {}) as Record<string, unknown>)
  }

  /**
   * Verse les appels de la fenêtre dans le CRM, en note sur la fiche du contact.
   *
   * L'ordre compte : la trace d'idempotence est écrite AVANT la note. Si
   * l'écriture de la note échoue ensuite, on aura sauté un appel — ce qui se
   * répare — plutôt que d'en avoir déposé deux, ce qui ne se répare pas dans un
   * CRM que le client regarde tous les jours.
   *
   * Un appel dont on ne sait rapprocher personne n'est PAS journalisé : une note
   * orpheline dans un CRM est du bruit que personne ne nettoie jamais.
   */
  async logCallsToCrm(userId: string, options: { days?: number } = {}): Promise<CallLogOutcome> {
    const resolved = await this.resolveAccess(userId)
    if (!resolved) throw new BadRequestException('Aucun outil d’appel connecté.')
    if (!this.crm) throw new BadRequestException('Aucun CRM connecté.')

    const calls = await this.listRecentCalls(userId, options)
    const skipped: CallLogOutcome['skipped'] = []
    let logged = 0

    for (const call of calls) {
      if (!call.counterpartEmail) {
        skipped.push({ callId: call.id, reason: 'Aucun e-mail pour rapprocher une fiche' })
        continue
      }
      const record = await this.crm.findContactRecord(userId, call.counterpartEmail)
      if (!record) {
        skipped.push({ callId: call.id, reason: 'Aucune fiche trouvée dans le CRM' })
        continue
      }

      // Réservation d'abord : la contrainte d'unicité rejette la seconde passe.
      try {
        await this.logs.insert({
          workspace_id: resolved.workspaceId,
          provider: call.provider,
          call_id: call.id,
          crm_note_id: null,
        })
      } catch {
        skipped.push({ callId: call.id, reason: 'Déjà journalisé' })
        continue
      }

      try {
        // Un versement de téléphonie est un geste de SYSTÈME : personne n'a
        // relu la note avant qu'elle parte. Depuis BEL-INT-603 elle passe donc
        // par la porte d'écriture et attend une approbation — la conséquence
        // assumée de « toutes les écritures CRM ».
        // #2855 — la PROVENANCE : cet appel précis, jamais le nom du fournisseur
        // de téléphonie (doctrine : nos fournisseurs ne se nomment jamais).
        const source: WriteSource = { kind: 'call', ref: call.id }
        const note = await this.crm.logActivity(userId, record.recordId, composeCallNote(call), {
          origin: 'system',
          idempotencyKey: `telephony:${call.provider}:${call.id}`,
          source,
        })
        if (!note) {
          skipped.push({ callId: call.id, reason: 'Note en attente d’approbation' })
          continue
        }
        await this.logs.update(
          { workspace_id: resolved.workspaceId, provider: call.provider, call_id: call.id },
          { crm_note_id: note.id },
        )
        logged += 1
      } catch (error) {
        // La trace reste posée : mieux vaut sauter cet appel que risquer une
        // seconde note au prochain passage.
        skipped.push({
          callId: call.id,
          reason: error instanceof Error ? error.message : 'Écriture refusée par le CRM',
        })
      }
    }

    await this.touch(resolved.workspaceId)
    return { logged, skipped }
  }

  /** Les identifiants déchiffrés de l'espace, ou `null` s'il n'y en a pas. */
  private async resolveAccess(userId: string): Promise<{
    workspaceId: string
    access: TelephonyAccess
    transcriptsEnabled: boolean
    recordingConsentAnnounced: boolean
  } | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const row = await this.connections.findOne({ where: { workspace_id: workspaceId } })
    if (!row) return null
    const secret = decryptToken(row.credentials_enc)
    if (row.provider === 'aircall') {
      const [apiId, apiKey] = secret.split('\n')
      if (!apiId || !apiKey) return null
      return {
        workspaceId,
        access: { provider: 'aircall', apiId, apiKey },
        transcriptsEnabled: row.transcripts_enabled,
        recordingConsentAnnounced: row.recording_consent_announced === true,
      }
    }
    if (row.provider === 'allo') {
      const [alloNumber, apiKey] = secret.split('\n')
      if (!alloNumber || !apiKey) return null
      return {
        workspaceId,
        access: { provider: 'allo', alloNumber, apiKey },
        transcriptsEnabled: row.transcripts_enabled,
        recordingConsentAnnounced: row.recording_consent_announced === true,
      }
    }
    return {
      workspaceId,
      access: { provider: 'ringover', apiKey: secret },
      transcriptsEnabled: row.transcripts_enabled,
      recordingConsentAnnounced: row.recording_consent_announced === true,
    }
  }

  /** Marque le dernier usage RÉEL. Best-effort : une écriture de comptabilité ne
   *  doit jamais faire échouer un versement réussi. */
  private async touch(workspaceId: string): Promise<void> {
    try {
      await this.connections.update({ workspace_id: workspaceId }, { last_used_at: new Date() })
    } catch (error) {
      this.logger.warn('Horodatage de la connexion téléphonie en échec (non bloquant)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** La réponse du modèle, en texte propre : une liste de chaînes non vides. */
function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item ?? '').trim()).filter(Boolean) : []
}

function toCallAnalysis(callId: string, data: Record<string, unknown>): CallAnalysis {
  const nextSteps = Array.isArray(data['next_steps']) ? (data['next_steps'] as unknown[]) : []
  return {
    callId,
    summary: String(data['summary'] ?? '').trim(),
    decisions: textList(data['decisions']),
    nextSteps: nextSteps
      .map(item => (item ?? {}) as Record<string, unknown>)
      .map(row => ({
        action: String(row['action'] ?? '').trim(),
        owner: String(row['owner'] ?? '').trim(),
        due: String(row['due'] ?? '').trim(),
      }))
      .filter(step => step.action.length > 0),
    openQuestions: textList(data['open_questions']),
    signals: textList(data['signals']),
  }
}
