import type {
  ConsultantExperience,
  ConsultantSkill,
  DraftTalentMessageInput,
  PrepareTalentMessageInput,
  TalentDocument,
  TalentDocumentFileUrl,
  TalentDocumentKind,
  TalentDocumentText,
  TalentDuplicateAction,
  TalentDuplicateDecision,
  TalentDuplicateMatch,
  TalentDuplicatePreview,
  TalentDuplicatesReport,
  TalentMessageDraft,
  TalentPreparedMessage,
  TalentRetention,
  UpsertSkillInput,
  ValidateSkillInput,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

export const talentKeys = {
  skills: (id: string) => ['talents', id, 'skills'] as const,
  experiences: (id: string) => ['talents', id, 'experiences'] as const,
  documents: (id: string) => ['talents', id, 'documents'] as const,
  documentFile: (id: string, documentId: string) => ['talents', id, 'documents', documentId, 'file'] as const,
  documentText: (id: string, documentId: string) => ['talents', id, 'documents', documentId, 'text'] as const,
  preparedMessages: (id: string) => ['talents', id, 'messages'] as const,
  retention: () => ['talents', 'retention'] as const,
  duplicates: (candidate: DuplicateCandidate) => ['talents', 'duplicates', candidate] as const,
  identity: (id: string) => ['talents', id, 'identity'] as const,
  identityPreview: (id: string, otherId: string) => ['talents', id, 'identity', otherId] as const,
  skillSuggestion: (term: string) => ['talents', 'skill-suggestion', term] as const,
}

/** Ce qu'on connaît de la personne pendant qu'on la tape. Tout est facultatif. */
type DuplicateCandidate = { full_name?: string; email?: string; phone?: string }

/**
 * Ce que le référentiel appellerait cette compétence.
 *
 * `canonical: null` est le cas le plus fréquent, et il est VOULU : on ne
 * rapproche pas un mot inconnu du terme connu le plus ressemblant.
 */
type SkillSuggestion = { term: string; canonical: string | null; origin: 'workspace' | 'referential' | null }

type IdentityDecisionInput = {
  otherTalentId: string
  action: TalentDuplicateAction
  assigneeId: string | null
}

type AddDocumentInput = {
  kind: TalentDocumentKind
  filename: string
  mimeType: string | null
  text: string
  sizeBytes: number | null
}

export const talentApi = {
  skills(id: string): Promise<{ items: ConsultantSkill[] }> {
    return apiFetch<{ items: ConsultantSkill[] }>({ path: `/talents/${id}/skills` })
  },
  upsertSkill(id: string, input: UpsertSkillInput): Promise<ConsultantSkill> {
    return apiFetch<ConsultantSkill, UpsertSkillInput>({ path: `/talents/${id}/skills`, method: 'PUT', body: input })
  },
  removeSkill(id: string, skillId: string): Promise<void> {
    return apiFetch<void>({ path: `/talents/${id}/skills/${skillId}`, method: 'DELETE' })
  },
  validateSkill(id: string, skillId: string, input: ValidateSkillInput): Promise<ConsultantSkill> {
    return apiFetch<ConsultantSkill, ValidateSkillInput>({
      path: `/talents/${id}/skills/${skillId}/validation`,
      method: 'PUT',
      body: input,
    })
  },
  /** #2328.9/.10/.22 — les expériences structurées, base des preuves d'une
   *  compétence. Lecture seule ici : la saisie reste hors de cette tranche. */
  experiences(id: string): Promise<{ items: ConsultantExperience[] }> {
    return apiFetch<{ items: ConsultantExperience[] }>({ path: `/talents/${id}/experiences` })
  },
  documents(id: string): Promise<{ items: TalentDocument[] }> {
    return apiFetch<{ items: TalentDocument[] }>({ path: `/talents/${id}/documents` })
  },
  addDocument(
    id: string,
    input: AddDocumentInput,
  ): Promise<{ document: TalentDocument; skillsAdded: number; truncated: boolean }> {
    return apiFetch<{ document: TalentDocument; skillsAdded: number; truncated: boolean }, AddDocumentInput>({
      path: `/talents/${id}/documents`,
      method: 'POST',
      body: input,
    })
  },
  /** #4034.3 — l'URL signée (≤ 5 min) de l'ORIGINAL ; 404 sans original conservé. */
  documentFileUrl(id: string, documentId: string): Promise<TalentDocumentFileUrl> {
    return apiFetch<TalentDocumentFileUrl>({ path: `/talents/${id}/documents/${documentId}/file-url` })
  },
  /** #4034.4/.5 — le texte extrait, mis en page dans l'aperçu. */
  documentText(id: string, documentId: string): Promise<TalentDocumentText> {
    return apiFetch<TalentDocumentText>({ path: `/talents/${id}/documents/${documentId}/text` })
  },
  removeDocument(id: string, documentId: string): Promise<void> {
    return apiFetch<void>({ path: `/talents/${id}/documents/${documentId}`, method: 'DELETE' })
  },
  /** #2185.51 — brouillons, jamais envoyés (le copilote prépare, le commercial envoie). */
  preparedMessages(id: string): Promise<{ items: TalentPreparedMessage[] }> {
    return apiFetch<{ items: TalentPreparedMessage[] }>({ path: `/talents/${id}/messages` })
  },
  prepareMessage(id: string, input: PrepareTalentMessageInput): Promise<TalentPreparedMessage> {
    return apiFetch<TalentPreparedMessage, PrepareTalentMessageInput>({
      path: `/talents/${id}/messages`,
      method: 'POST',
      body: input,
    })
  },
  /** #4347 — Laura RÉDIGE l'objet et le corps ; rien n'est enregistré ni envoyé par cet appel. */
  draftMessage(id: string, input: DraftTalentMessageInput): Promise<TalentMessageDraft> {
    return apiFetch<TalentMessageDraft, DraftTalentMessageInput>({
      path: `/talents/${id}/messages/draft`,
      method: 'POST',
      body: input,
    })
  },
  retention(): Promise<TalentRetention & { dueNow: number }> {
    return apiFetch<TalentRetention & { dueNow: number }>({ path: '/talents/retention/settings' })
  },
  setRetention(input: TalentRetention): Promise<TalentRetention> {
    return apiFetch<TalentRetention, TalentRetention>({
      path: '/talents/retention/settings',
      method: 'PUT',
      body: input,
    })
  },
  duplicates(candidate: DuplicateCandidate): Promise<{ items: TalentDuplicateMatch[] }> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(candidate)) if (value) query.set(key, value)
    return apiFetch<{ items: TalentDuplicateMatch[] }>({ path: `/talents/duplicates?${query.toString()}` })
  },
  /** #2327 — les doublons possibles d'une fiche existante. Lecture seule. */
  identity(id: string): Promise<TalentDuplicatesReport> {
    return apiFetch<TalentDuplicatesReport>({ path: `/talents/${id}/identity` })
  },
  /** #2327.19 — les deux fiches côte à côte. Lecture seule. */
  identityPreview(id: string, otherId: string): Promise<TalentDuplicatePreview> {
    return apiFetch<TalentDuplicatePreview>({ path: `/talents/${id}/identity/${otherId}` })
  },
  /** #2327.20 — une décision humaine ; aucune ne fusionne. */
  decideIdentity(id: string, input: IdentityDecisionInput): Promise<TalentDuplicateDecision> {
    return apiFetch<TalentDuplicateDecision, IdentityDecisionInput>({
      path: `/talents/${id}/identity/decisions`,
      method: 'POST',
      body: input,
    })
  },
  /** #2327.25 — annuler une décision : datée, jamais effacée. */
  undoIdentity(id: string, decisionId: string): Promise<void> {
    return apiFetch<void>({ path: `/talents/${id}/identity/decisions/${decisionId}/undo`, method: 'POST' })
  },
  skillSuggestion(term: string): Promise<SkillSuggestion> {
    return apiFetch<SkillSuggestion>({ path: `/talents/skill-suggestion?term=${encodeURIComponent(term)}` })
  },
  /**
   * Dépose (ou retire, `photoUrl: null`) la photo d'un talent (piège n°3 du
   * PDF-22 §01, 31/08/2026). `photoUrl` porte une donnée URI validée côté
   * client (`talentPhotoSchema`) — le serveur revalide en dernier ressort.
   */
  setPhoto(id: string, photoUrl: string | null): Promise<{ photoUrl: string | null }> {
    return apiFetch<{ photoUrl: string | null }, { photoUrl: string | null }>({
      path: `/talents/${id}/photo`,
      method: 'PUT',
      body: { photoUrl },
    })
  },
}

/**
 * Les fiches qui pourraient déjà être la personne qu'on tape (§3.3).
 *
 * ⚠️ Elle PROPOSE, elle ne fusionne jamais — la route est une lecture, et la
 * décision « ce n'est pas la même personne » vient d'un clic.
 *
 * Le nom doit faire au moins trois caractères : « Ma » ressemble à tout le
 * monde, et une requête par frappe pour un résultat inutilisable n'aide
 * personne. `retry: false` : cette lecture est un CONFORT — si elle échoue, la
 * saisie continue, elle ne doit ni bloquer ni réessayer en boucle.
 */
export function useTalentDuplicates(candidate: DuplicateCandidate, enabled: boolean) {
  const searchable = (candidate.full_name ?? '').trim().length >= 3 || Boolean(candidate.email || candidate.phone)
  return useQuery({
    queryKey: talentKeys.duplicates(candidate),
    queryFn: () => talentApi.duplicates(candidate),
    enabled: enabled && searchable,
    retry: false,
    select: response => response.items,
  })
}

/** Ce que le référentiel appellerait la compétence en cours de frappe (§3.3). */
export function useSkillSuggestion(term: string) {
  return useQuery({
    queryKey: talentKeys.skillSuggestion(term),
    queryFn: () => talentApi.skillSuggestion(term),
    enabled: term.trim().length >= 2,
    retry: false,
  })
}

export function useTalentSkills(id: string | undefined) {
  return useQuery({
    queryKey: talentKeys.skills(id ?? 'none'),
    queryFn: () => talentApi.skills(id as string),
    enabled: Boolean(id),
    select: response => response.items,
  })
}

export function useUpsertTalentSkill(id: string) {
  const qc = useQueryClient()
  return useMutation<ConsultantSkill, Error, UpsertSkillInput>({
    mutationFn: input => talentApi.upsertSkill(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: talentKeys.skills(id) }),
    onError: () => toast.error(i18n.t('consultants:skills.saveError')),
  })
}

export function useRemoveTalentSkill(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { skillId: string }>({
    mutationFn: ({ skillId }) => talentApi.removeSkill(id, skillId),
    onSuccess: () => qc.invalidateQueries({ queryKey: talentKeys.skills(id) }),
    onError: () => toast.error(i18n.t('consultants:skills.deleteError')),
  })
}

/** #2328.12/.13 — la validation RECRUTEUR d'une compétence, depuis la fiche
 *  talent. `validatedBy` reste un paramètre du contrat (`ValidateSkillInput`)
 *  plutôt qu'un `'recruiter'` figé ici : le bouton consultant, s'il naît un
 *  jour sur un autre écran, réutilisera la même mutation. */
export function useValidateTalentSkill(id: string) {
  const qc = useQueryClient()
  return useMutation<ConsultantSkill, Error, { skillId: string } & ValidateSkillInput>({
    mutationFn: ({ skillId, ...input }) => talentApi.validateSkill(id, skillId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: talentKeys.skills(id) }),
    onError: () => toast.error(i18n.t('consultants:skills.validationError')),
  })
}

export function useTalentExperiences(id: string | undefined) {
  return useQuery({
    queryKey: talentKeys.experiences(id ?? 'none'),
    queryFn: () => talentApi.experiences(id as string),
    enabled: Boolean(id),
    select: response => response.items,
  })
}

export function useTalentDocuments(id: string | undefined) {
  return useQuery({
    queryKey: talentKeys.documents(id ?? 'none'),
    queryFn: () => talentApi.documents(id as string),
    enabled: Boolean(id),
    select: response => response.items,
  })
}

/**
 * #4034.3 — l'URL signée de l'ORIGINAL, demandée seulement quand il existe.
 * Elle périme en cinq minutes : relue à chaque ouverture, jamais gardée.
 */
export function useTalentDocumentFileUrl(id: string, documentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: talentKeys.documentFile(id, documentId ?? 'none'),
    queryFn: () => talentApi.documentFileUrl(id, documentId as string),
    enabled: enabled && Boolean(documentId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

/** #4034.4/.5 — le texte extrait d'un document, pour l'aperçu. */
export function useTalentDocumentText(id: string, documentId: string | null) {
  return useQuery({
    queryKey: talentKeys.documentText(id, documentId ?? 'none'),
    queryFn: () => talentApi.documentText(id, documentId as string),
    enabled: Boolean(documentId),
  })
}

export function useAddTalentDocument(id: string) {
  const qc = useQueryClient()
  return useMutation<{ document: TalentDocument; skillsAdded: number; truncated: boolean }, Error, AddDocumentInput>({
    mutationFn: input => talentApi.addDocument(id, input),
    onSuccess: result => {
      qc.invalidateQueries({ queryKey: talentKeys.documents(id) })
      qc.invalidateQueries({ queryKey: talentKeys.skills(id) })
      // Le nombre de compétences ajoutées est DIT : un import silencieux laisse
      // croire qu'il n'a rien fait, et un CV scanné en image ne donne rien.
      if (result.document.extractedChars === 0) toast.warning(i18n.t('consultants:documents.noText'))
      else if (result.skillsAdded > 0)
        toast.success(i18n.t('consultants:documents.addedWithSkills', { count: result.skillsAdded }))
      else toast.success(i18n.t('consultants:documents.added'))
    },
    onError: () => toast.error(i18n.t('consultants:documents.error')),
  })
}

export function useRemoveTalentDocument(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { documentId: string }>({
    mutationFn: ({ documentId }) => talentApi.removeDocument(id, documentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: talentKeys.documents(id) }),
    onError: () => toast.error(i18n.t('consultants:documents.deleteError')),
  })
}

/** #2185.51 — la liste des brouillons préparés, la plus récente d'abord. */
export function useTalentPreparedMessages(id: string | undefined) {
  return useQuery({
    queryKey: talentKeys.preparedMessages(id ?? 'none'),
    queryFn: () => talentApi.preparedMessages(id as string),
    enabled: Boolean(id),
    select: response => response.items,
  })
}

export function usePrepareTalentMessage(id: string) {
  const qc = useQueryClient()
  return useMutation<TalentPreparedMessage, Error, PrepareTalentMessageInput>({
    mutationFn: input => talentApi.prepareMessage(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: talentKeys.preparedMessages(id) })
      toast.success(i18n.t('consultants:detail.preparedMessages.saved'))
    },
    onError: () => toast.error(i18n.t('consultants:detail.preparedMessages.error')),
  })
}

/** #4347 — la rédaction de Laura : une mutation (un appel modèle par geste), jamais un cache. */
export function useDraftTalentMessage(id: string) {
  return useMutation<TalentMessageDraft, Error, DraftTalentMessageInput>({
    mutationFn: input => talentApi.draftMessage(id, input),
  })
}

export function useTalentRetention() {
  return useQuery({ queryKey: talentKeys.retention(), queryFn: talentApi.retention })
}

export function useSetTalentRetention() {
  const qc = useQueryClient()
  return useMutation<TalentRetention, Error, TalentRetention>({
    mutationFn: input => talentApi.setRetention(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: talentKeys.retention() })
      toast.success(i18n.t('consultants:retention.saved'))
    },
    onError: () => toast.error(i18n.t('consultants:retention.error')),
  })
}

/**
 * Le dépôt d'une photo (piège n°3 du PDF-22 §01, 31/08/2026).
 *
 * Invalide la fiche ET le vivier : la photo s'affiche sur les DEUX
 * (`TalentDetailPage`, la ligne du vivier via `photos.attach()`), et une
 * mutation qui n'invaliderait que l'une des deux laisserait l'autre montrer
 * une photo périmée jusqu'au prochain rechargement.
 */
export function useSetTalentPhoto(id: string) {
  const qc = useQueryClient()
  return useMutation<{ photoUrl: string | null }, Error, string | null>({
    mutationFn: photoUrl => talentApi.setPhoto(id, photoUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultant', id] })
      qc.invalidateQueries({ queryKey: ['talents'] })
    },
  })
}

/**
 * #2327 — les doublons possibles d'une fiche existante.
 *
 * ⚠️ Elle PROPOSE, elle ne fusionne jamais (`c37_fusion_doublons`) : la lecture
 * rend des paires avec leurs signaux, et chaque décision vient d'un clic.
 */
export function useTalentIdentity(id: string) {
  return useQuery({
    queryKey: talentKeys.identity(id),
    queryFn: () => talentApi.identity(id),
    retry: false,
  })
}

/** #2327.19 — la comparaison n'est chargée que lorsqu'on l'ouvre. */
export function useTalentIdentityPreview(id: string, otherId: string | null) {
  return useQuery({
    queryKey: talentKeys.identityPreview(id, otherId ?? ''),
    queryFn: () => talentApi.identityPreview(id, otherId ?? ''),
    enabled: otherId !== null,
    retry: false,
  })
}

/**
 * #2327.20 / #2327.25 — décider, ou annuler une décision. Les deux invalident
 * la fiche entière : « copier ses documents » change l'onglet Documents.
 */
export function useDecideTalentIdentity(id: string) {
  const qc = useQueryClient()
  return useMutation<TalentDuplicateDecision, Error, IdentityDecisionInput>({
    mutationFn: input => talentApi.decideIdentity(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents', id] })
      toast.success(i18n.t('consultants:identity.done'))
    },
    onError: error => toast.error(error.message || i18n.t('consultants:identity.failed')),
  })
}

export function useUndoTalentIdentity(id: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: decisionId => talentApi.undoIdentity(id, decisionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['talents', id] })
      toast.success(i18n.t('consultants:identity.undone'))
    },
    onError: error => toast.error(error.message || i18n.t('consultants:identity.failed')),
  })
}
