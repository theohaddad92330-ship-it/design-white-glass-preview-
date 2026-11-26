import type {
  CommercialAuditFeedbackResponse,
  CreateCommercialAuditFeedbackRequest,
  CreateExpertiseGroundingRequest,
  ExpertiseGroundingsResponse,
  UpdateExpertiseGroundingInput,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2075.12 / #2075.13 — commenter une conclusion, refuser une
 * recommandation. Le clic EST la décision (geste utilisateur = auto-approuvé)
 * pour un refus ; un commentaire l'est aussi une fois le texte saisi validé —
 * même précédent que `profileContextApi.recordAuditMoveDecision`.
 */
export const commercialAuditFeedbackApi = {
  list(): Promise<CommercialAuditFeedbackResponse> {
    return apiFetch<CommercialAuditFeedbackResponse>({ path: '/commercial-audit/feedback' })
  },
  create(input: CreateCommercialAuditFeedbackRequest): Promise<CommercialAuditFeedbackResponse> {
    return apiFetch<CommercialAuditFeedbackResponse>({
      path: '/commercial-audit/feedback',
      method: 'POST',
      body: input,
    })
  },
}

export const commercialAuditFeedbackKeys = {
  list: ['commercial-audit', 'feedback'] as const,
}

/**
 * Épopée #2880 (lot V33) — le croisement expertise ↔ fondement/preuve et son
 * audit à 3 états. Chaque geste renvoie la réponse complète relue : l'écran
 * remplace son cache, jamais un second appel.
 */
export const expertiseGroundingsApi = {
  list(): Promise<ExpertiseGroundingsResponse> {
    return apiFetch<ExpertiseGroundingsResponse>({ path: '/expertise-groundings' })
  },
  create(input: CreateExpertiseGroundingRequest): Promise<ExpertiseGroundingsResponse> {
    return apiFetch<ExpertiseGroundingsResponse>({ path: '/expertise-groundings', method: 'POST', body: input })
  },
  update(id: string, input: UpdateExpertiseGroundingInput): Promise<ExpertiseGroundingsResponse> {
    return apiFetch<ExpertiseGroundingsResponse>({
      path: `/expertise-groundings/${encodeURIComponent(id)}`,
      method: 'PATCH',
      body: input,
    })
  },
  archive(id: string): Promise<ExpertiseGroundingsResponse> {
    return apiFetch<ExpertiseGroundingsResponse>({
      path: `/expertise-groundings/${encodeURIComponent(id)}/archive`,
      method: 'POST',
    })
  },
}

export const expertiseGroundingsKeys = {
  list: ['expertise-groundings'] as const,
}
