import type {
  CreateMessageStyleImport,
  MessageLearningSummary,
  CreateMessageStyleTemplate,
  MessageStyleImportResult,
  MessageStylePreviewCompareRequest,
  MessageStylePreviewResult,
  MessageStyleRuleProposal,
  MessageStyleRuleProposalDecision,
  MessageStyleTemplate,
  MessageStyleTemplateStatus,
  MessageStyleUsageStats,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2369.2/.3/.4/.5 (épopée #2768, LOT SOIR 26/09) — client HTTP de l'import
 * pour apprentissage (`/message-style/imports`). Le corps importé n'est
 * JAMAIS renvoyé (doctrine, `MessageStyleImportResult`) : cette fonction ne
 * porte que ce que la réponse contient déjà.
 *
 * #2369.14 (épopée #2768) — LE NO-GO EXIGE UN ÉCRAN.
 *
 * « Laura affirme avoir appris le style sans montrer les règles extraites ni
 * permettre de les corriger » (#2369.14) ne peut être respecté que par un
 * écran réel — les endpoints (`GET/POST /message-style/templates`,
 * `GET /message-style/rule-proposals`, `POST …/decide`) existent déjà
 * (#2369.9/.10/.7/.8), sans AUCUN client qui les appelle. Ce module l'est.
 */
export const messageStyleApi = {
  importMessage(input: CreateMessageStyleImport): Promise<MessageStyleImportResult> {
    return apiFetch<MessageStyleImportResult, CreateMessageStyleImport>({
      path: '/message-style/imports',
      method: 'POST',
      body: input,
    })
  },
  /** #2204.59-.65 — créer un style SANS import ; il naît `draft`. */
  createTemplate(input: CreateMessageStyleTemplate): Promise<MessageStyleTemplate> {
    return apiFetch<MessageStyleTemplate, CreateMessageStyleTemplate>({
      path: '/message-style/templates',
      method: 'POST',
      body: input,
    })
  },
  listTemplates(): Promise<MessageStyleTemplate[]> {
    return apiFetch<MessageStyleTemplate[]>({ path: '/message-style/templates' })
  },
  listRuleProposals(): Promise<MessageStyleRuleProposal[]> {
    return apiFetch<MessageStyleRuleProposal[]>({ path: '/message-style/rule-proposals' })
  },
  decideRuleProposal(id: string, decision: MessageStyleRuleProposalDecision): Promise<MessageStyleRuleProposal> {
    return apiFetch<MessageStyleRuleProposal, { decision: MessageStyleRuleProposalDecision }>({
      path: `/message-style/rule-proposals/${encodeURIComponent(id)}/decide`,
      method: 'POST',
      body: { decision },
    })
  },
  /** #2204.77 — la route offre une transition, jamais un statut écrit tel quel (#2369.10). */
  transitionTemplate(id: string, to: MessageStyleTemplateStatus): Promise<MessageStyleTemplate> {
    return apiFetch<MessageStyleTemplate, { to: MessageStyleTemplateStatus }>({
      path: `/message-style/templates/${encodeURIComponent(id)}/transition`,
      method: 'POST',
      body: { to },
    })
  },
  /** #2369.11 — le même exemple sous les quatre couches, réutilise l'appel de génération existant. */
  previewCompare(input: MessageStylePreviewCompareRequest): Promise<MessageStylePreviewResult[]> {
    return apiFetch<MessageStylePreviewResult[], MessageStylePreviewCompareRequest>({
      path: '/message-style/templates/preview-compare',
      method: 'POST',
      body: input,
    })
  },
  /** #2877 — ce que les messages de l'espace ont appris à Laura : des comptes, jamais un taux. */
  learningSummary(): Promise<MessageLearningSummary> {
    return apiFetch<MessageLearningSummary>({ path: '/message-learning/summary' })
  },
  /** #2369.12 — les quatre taux d'usage PAR STYLE, jamais par personne. */
  usageByStyle(): Promise<MessageStyleUsageStats[]> {
    return apiFetch<MessageStyleUsageStats[]>({ path: '/message-style/templates/usage' })
  },
}
