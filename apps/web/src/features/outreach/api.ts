import type {
  BenchPushRequest,
  CampaignAudienceEvent,
  CampaignAudienceNeed,
  CampaignAudienceRequest,
  CampaignAudienceResult,
  ApproveOutreachMessagesRequest,
  ApproveOutreachMessagesResult,
  CreateOutreachCallTaskRequest,
  CreateOutreachDelegationRequest,
  CreateScopedDelegationRequest,
  CreateOutreachSequenceRequest,
  CreateOutreachStepInput,
  DeclareOutreachEngagementSignalInput,
  DeclareOutreachStepOutcomeInput,
  DelegationVerdict,
  DuplicateOutreachSequenceRequest,
  FlagOutreachMessageQualityRequest,
  OutreachApprovalView,
  OutreachCallTask,
  OutreachEligibilityResponse,
  OutreachDelegationView,
  OutreachMessage,
  OutreachMessageChannel,
  OutreachMessageVariable,
  OutreachQualityFlagKind,
  OutreachSequence,
  RenewDelegationRequest,
  ReorderOutreachStepsInput,
  ReviseOutreachMessageRequest,
  SetOutreachMessageVariableRequest,
  TransitionOutreachRequest,
  UpdateOutreachStepInput,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { AlternativeHookResponse } from './alternative-hooks'

/** #3419.3 — le corps de `POST /ia/message` pour la consigne « accroche alternative ». */
type AlternativeHookRequest = {
  contactId: string
  channel: 'email' | 'linkedin' | 'phone'
  revision: { kind: 'alternative_hook'; currentBody: string; previousHooks: string[] }
}

/**
 * Séquences d'outreach multi-touch (roadmap §8) — client HTTP.
 * Les étapes email PRÉPARENT (brouillon + rappel daté) ; l'envoi reste le
 * send-email existant, déclenché par l'humain — aucune route d'envoi ici.
 */
export const outreachApi = {
  list(contactId?: string): Promise<OutreachSequence[]> {
    const qs = contactId ? `?contact_id=${encodeURIComponent(contactId)}` : ''
    return apiFetch<OutreachSequence[]>({ path: `/outreach/sequences${qs}` })
  },
  /** #5029.1 — les séquences qui proposent CE consultant (Reverse Market : « déjà proposé à ce compte »). */
  listForConsultant(consultantId: string): Promise<OutreachSequence[]> {
    return apiFetch<OutreachSequence[]>({
      path: `/outreach/sequences?consultant_id=${encodeURIComponent(consultantId)}`,
    })
  },
  /** #5029.1 — « Proposer ce profil » : UNE séquence playbook F sur UN contact (jamais `/audience`). */
  benchPush(body: BenchPushRequest): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, BenchPushRequest>({
      path: '/outreach/sequences/bench-push',
      method: 'POST',
      body,
    })
  },
  create(body: CreateOutreachSequenceRequest): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, CreateOutreachSequenceRequest>({
      path: '/outreach/sequences',
      method: 'POST',
      body,
    })
  },
  pause(id: string): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence>({ path: `/outreach/sequences/${id}/pause`, method: 'POST' })
  },
  resume(id: string): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence>({ path: `/outreach/sequences/${id}/resume`, method: 'POST' })
  },
  cancel(id: string): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence>({ path: `/outreach/sequences/${id}/cancel`, method: 'POST' })
  },
  stepDone(id: string, stepId: string): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence>({ path: `/outreach/sequences/${id}/steps/${stepId}/done`, method: 'POST' })
  },
  /** #2153.39 — une séquence n'est pas une liste figée : ajoute une étape à
   *  une séquence encore vivante (active ou en pause). */
  addStep(id: string, input: CreateOutreachStepInput): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, CreateOutreachStepInput>({
      path: `/outreach/sequences/${id}/steps`,
      method: 'POST',
      body: input,
    })
  },
  /** #2378.5 / #2378.6 — retoucher une étape encore À FAIRE (mêmes gardes de cadence qu'à la création). */
  updateStep(id: string, stepId: string, input: UpdateOutreachStepInput): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, UpdateOutreachStepInput>({
      path: `/outreach/sequences/${id}/steps/${stepId}`,
      method: 'PATCH',
      body: input,
    })
  },
  /** #2378.5 — retirer une étape à faire : elle est ARCHIVÉE (skipped) côté serveur, jamais supprimée. */
  removeStep(id: string, stepId: string): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence>({ path: `/outreach/sequences/${id}/steps/${stepId}/remove`, method: 'POST' })
  },
  /** #2909 (#2378.2) — déclarer (ou effacer) le signal d'ouverture/clic
   *  RAPPORTÉ par le commercial ; jamais détecté automatiquement. */
  declareEngagementSignal(
    id: string,
    stepId: string,
    body: DeclareOutreachEngagementSignalInput,
  ): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, DeclareOutreachEngagementSignalInput>({
      path: `/outreach/sequences/${id}/steps/${stepId}/engagement`,
      method: 'PATCH',
      body,
    })
  },
  /** #2203.62 / #2378.7 — dupliquer vers un AUTRE contact : la route existe et
   *  est testée côté serveur depuis 1255e7a34, ce client était le SEUL
   *  appelant qui manquait (mono-contact, c74 : l'originale ne bouge pas). */
  /** Lot L-B — réordonner les étapes encore à faire (mêmes créneaux, nouvel ordre). */
  reorderSteps(id: string, body: ReorderOutreachStepsInput): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, ReorderOutreachStepsInput>({
      path: `/outreach/sequences/${id}/steps/reorder`,
      method: 'POST',
      body,
    })
  },
  /** Lot L-B — l'issue DÉCLARÉE d'une étape (invitation acceptée ou non, issue d'un appel). */
  declareOutcome(id: string, stepId: string, body: DeclareOutreachStepOutcomeInput): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, DeclareOutreachStepOutcomeInput>({
      path: `/outreach/sequences/${id}/steps/${stepId}/outcome`,
      method: 'PATCH',
      body,
    })
  },
  /** Lot L-B — « RDV pris » : termine la séquence (cause `meeting_booked`). */
  meetingBooked(id: string, stepId?: string): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, { step_id?: string }>({
      path: `/outreach/sequences/${id}/meeting-booked`,
      method: 'POST',
      body: stepId ? { step_id: stepId } : {},
    })
  },
  /** Lot L-B — « Mettre toutes mes séquences en pause jusqu'au… ». */
  startVacation(until: string): Promise<{ paused: number }> {
    return apiFetch<{ paused: number }, { until: string }>({
      path: '/outreach/sequences/vacation',
      method: 'POST',
      body: { until },
    })
  },
  /** Lot L-B — reprendre : les échéances restantes sont décalées de la durée de la pause. */
  resumeVacation(): Promise<{ resumed: number }> {
    return apiFetch<{ resumed: number }>({ path: '/outreach/sequences/vacation/resume', method: 'POST' })
  },
  /** Lot L-B — les exclusions à l'inscription, contact par contact. */
  eligibility(contactIds: string[]): Promise<OutreachEligibilityResponse> {
    return apiFetch<OutreachEligibilityResponse, { contact_ids: string[] }>({
      path: '/outreach/sequences/eligibility',
      method: 'POST',
      body: { contact_ids: contactIds },
    })
  },
  duplicate(id: string, body: DuplicateOutreachSequenceRequest): Promise<OutreachSequence> {
    return apiFetch<OutreachSequence, DuplicateOutreachSequenceRequest>({
      path: `/outreach/sequences/${id}/duplicate`,
      method: 'POST',
      body,
    })
  },
}

export const outreachKeys = {
  all: ['outreach'] as const,
  list: (contactId?: string) => ['outreach', 'list', contactId ?? 'all'] as const,
  /** #5029.1 — sous `['outreach', 'list']` : toute invalidation des listes la relit aussi. */
  byConsultant: (consultantId: string) => ['outreach', 'list', 'consultant', consultantId] as const,
  eligibility: (contactIds: readonly string[]) =>
    ['outreach', 'eligibility', [...contactIds].sort().join(',')] as const,
  messages: (view?: OutreachApprovalView, contactId?: string) =>
    ['outreach', 'messages', view ?? 'all', contactId ?? 'all'] as const,
  /** #2366.1 / #2366.2 — la carte de Laura et la fiche Contact relisent le MÊME objet par cette clé. */
  message: (id: string) => ['outreach', 'message', id] as const,
  /** #3702.9 — les mandats d'envoi délégué (c89). */
  delegations: ['outreach', 'delegations'] as const,
}

/**
 * #3702.9 — le mandat d'envoi délégué : explicite, borné, révocable. Aucune de
 * ces routes n'envoie — elles posent, suspendent ou retirent une autorisation.
 */
export const outreachDelegationsApi = {
  list(): Promise<OutreachDelegationView[]> {
    return apiFetch<OutreachDelegationView[]>({ path: '/outreach/delegations' })
  },
  create(
    body: CreateOutreachDelegationRequest,
  ): Promise<{ delegation: OutreachDelegationView; excluded: { id: string; reason: string }[] }> {
    return apiFetch<
      { delegation: OutreachDelegationView; excluded: { id: string; reason: string }[] },
      CreateOutreachDelegationRequest
    >({ path: '/outreach/delegations', method: 'POST', body })
  },
  act(id: string, action: 'pause' | 'resume' | 'revoke'): Promise<OutreachDelegationView> {
    return apiFetch<OutreachDelegationView>({ path: `/outreach/delegations/${id}/${action}`, method: 'POST' })
  },
  /** #4016 L5 — SIGNER un mandat d'espace pour une portée. N'envoie rien : pose l'autorisation. */
  sign(body: CreateScopedDelegationRequest): Promise<OutreachDelegationView> {
    return apiFetch<OutreachDelegationView, CreateScopedDelegationRequest>({
      path: '/outreach/delegations/scoped',
      method: 'POST',
      body,
    })
  },
  /** #4016 L5 — renouveler = re-signer (un nouveau mandat, l'ancien remplacé). */
  renew(id: string, body: RenewDelegationRequest): Promise<OutreachDelegationView> {
    return apiFetch<OutreachDelegationView, RenewDelegationRequest>({
      path: `/outreach/delegations/${id}/renew`,
      method: 'POST',
      body,
    })
  },
  /**
   * #3702 (R26) — le statut réel par étape, jamais une réservation de quota
   * (lecture seule, même route que la recette API du lot N06). Rien côté web
   * ne l'appelait : l'arrêt sur réponse/opposition/exclusion était vérifiable
   * par API, jamais VISIBLE sur l'écran — `DelegationBlock` l'affiche
   * désormais, compté par raison, jamais une ligne à zéro.
   */
  steps(id: string): Promise<{ message_id: string; contact_id: string; status: string; verdict: DelegationVerdict }[]> {
    return apiFetch<{ message_id: string; contact_id: string; status: string; verdict: DelegationVerdict }[]>({
      path: `/outreach/delegations/${id}/steps`,
    })
  },
}

/**
 * #2366 / #2382 — le message canonique et le centre d'approbation. AUCUNE route
 * d'envoi : valider n'est jamais exécuter.
 */
export const outreachMessagesApi = {
  /**
   * #2366.1 — `contactId` : la fiche Contact filtre sur le MÊME objet que le
   * centre d'approbation (`view`), les deux paramètres étant indépendants
   * côté serveur (`OutreachMessageController.list`).
   */
  list(view?: OutreachApprovalView, contactId?: string): Promise<OutreachMessage[]> {
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (contactId) params.set('contact_id', contactId)
    const qs = params.toString()
    return apiFetch<OutreachMessage[]>({ path: `/outreach/messages${qs ? `?${qs}` : ''}` })
  },
  /**
   * #2366.2 — une lecture par identifiant : c'est elle qui permet à une carte
   * de Laura de RELIRE l'état à jour d'un message canonique au lieu de garder
   * pour toujours le texte figé au moment de sa génération.
   */
  get(id: string): Promise<OutreachMessage> {
    return apiFetch<OutreachMessage>({ path: `/outreach/messages/${id}` })
  },
  /** #2382.9 — chaque élément porte la version AFFICHÉE ; le serveur exclut ce qui a changé depuis. */
  approve(body: ApproveOutreachMessagesRequest): Promise<ApproveOutreachMessagesResult> {
    return apiFetch<ApproveOutreachMessagesResult, ApproveOutreachMessagesRequest>({
      path: '/outreach/messages/approve',
      method: 'POST',
      body,
    })
  },
  /** #2366.5 — les appels à passer, avec leur propre machine d'états. */
  listCalls(): Promise<OutreachCallTask[]> {
    return apiFetch<OutreachCallTask[]>({ path: '/outreach/call-tasks' })
  },
  /** #2366.5 — l'issue d'un appel (sans réponse, rappel convenu, qualifié…),
   *  posée d'un geste depuis « Appels à passer ». */
  transitionCall(id: string, body: TransitionOutreachRequest): Promise<OutreachCallTask> {
    return apiFetch<OutreachCallTask, TransitionOutreachRequest>({
      path: `/outreach/call-tasks/${id}/transition`,
      method: 'POST',
      body,
    })
  },
  /** Lot L-A (#4164) — reporter l'échéance d'un appel (file Aujourd'hui). */
  postponeCall(id: string, scheduledAt: string): Promise<OutreachCallTask> {
    return apiFetch<OutreachCallTask, { scheduled_at: string }>({
      path: `/outreach/call-tasks/${id}/postpone`,
      method: 'POST',
      body: { scheduled_at: scheduledAt },
    })
  },
  /**
   * #2366.5 — les deux appelants produits de `POST /outreach/call-tasks` :
   * le script d'appel préparé depuis la fiche contact, ET le script d'appel
   * courant côté engagement (section « Appels » du centre d'approbation
   * était vide en prod faute de créateur).
   */
  createCall(body: CreateOutreachCallTaskRequest): Promise<OutreachCallTask> {
    return apiFetch<OutreachCallTask, CreateOutreachCallTaskRequest>({
      path: '/outreach/call-tasks',
      method: 'POST',
      body,
    })
  },
  /** #2877 (#2385.4) — un signal qualité DÉCLARÉ (faux fait, CTA, persona) : ni l'état ni le texte ne bougent. */
  flagQuality(id: string, body: FlagOutreachMessageQualityRequest): Promise<{ kind: OutreachQualityFlagKind }> {
    return apiFetch<{ kind: OutreachQualityFlagKind }, FlagOutreachMessageQualityRequest>({
      path: `/outreach/messages/${id}/quality-flag`,
      method: 'POST',
      body,
    })
  },
  /** #3419.1 — les variables de la version courante du message (valeur, source, date, confiance, usage externe). */
  variables(id: string): Promise<OutreachMessageVariable[]> {
    return apiFetch<OutreachMessageVariable[]>({ path: `/outreach/messages/${id}/variables` })
  },
  setVariable(id: string, body: SetOutreachMessageVariableRequest): Promise<OutreachMessageVariable> {
    return apiFetch<OutreachMessageVariable, SetOutreachMessageVariableRequest>({
      path: `/outreach/messages/${id}/variables`,
      method: 'POST',
      body,
    })
  },
  /**
   * #3419.3 — une accroche alternative pour le message courant : `/ia/message` avec la
   * consigne `revision` (réécrire l'OUVERTURE, sur un autre élément réel du dossier, sans
   * rien inventer). Lecture : rien n'est écrit sur le message.
   */
  alternativeHook(input: {
    contactId: string
    channel: OutreachMessageChannel
    currentBody: string
    previousHooks: string[]
  }): Promise<AlternativeHookResponse> {
    return apiFetch<{ success: boolean; data: AlternativeHookResponse }, AlternativeHookRequest>({
      path: '/ia/message',
      method: 'POST',
      body: {
        contactId: input.contactId,
        // Le moteur rédige en e-mail / LinkedIn / téléphone ; un autre canal se réécrit comme un e-mail.
        channel: input.channel === 'linkedin' || input.channel === 'phone' ? input.channel : 'email',
        revision: { kind: 'alternative_hook', currentBody: input.currentBody, previousHooks: input.previousHooks },
      },
    }).then(res => {
      if (!res?.success) throw new Error('alternative hook failed')
      return res.data ?? {}
    })
  },
  /** #2366.10 — une modification crée une version. */
  revise(id: string, body: ReviseOutreachMessageRequest): Promise<OutreachMessage> {
    return apiFetch<OutreachMessage, ReviseOutreachMessageRequest>({
      path: `/outreach/messages/${id}`,
      method: 'PATCH',
      body,
    })
  },
}

/**
 * Épopée #2974 (lot V39) — la prévisualisation d'une audience de campagne.
 * Lecture seule côté serveur : une LISTE de contacts éligibles, mono-contact,
 * et ce qui en sort avec sa raison. Aucune séquence n'est armée ici.
 */
export const campaignAudienceApi = {
  preview(body: CampaignAudienceRequest): Promise<CampaignAudienceResult> {
    return apiFetch<CampaignAudienceResult, CampaignAudienceRequest>({
      path: '/outreach/audience/preview',
      method: 'POST',
      body,
    })
  },
  /** #2380.11 — les événements proposés par la source « participants d'un événement ». */
  events(): Promise<CampaignAudienceEvent[]> {
    return apiFetch<CampaignAudienceEvent[]>({ path: '/outreach/audience/events' })
  },
  /** #2202.15 — les besoins proposés par la source « besoin » (ceux qui portent au moins une personne). */
  needs(): Promise<CampaignAudienceNeed[]> {
    return apiFetch<CampaignAudienceNeed[]>({ path: '/outreach/audience/needs' })
  },
}
