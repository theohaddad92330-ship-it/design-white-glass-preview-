import {
  type ActivateWorkContextResponse,
  activateWorkContextResponseSchema,
  type CreateWorkContext,
  type WorkContext,
  workContextSchema,
  type WorkContextProfileSuggestionResponse,
  workContextProfileSuggestionResponseSchema,
  type WorkContextsResponse,
  workContextsResponseSchema,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2455 — Contextes de travail enregistrés (LAU-FINAL-168). Parsé à la
 * frontière (même raison que `teamCommentsApi` / `managerApi`) : un contrat
 * qui dérive entre l'API et le web devient un échec de requête nommé, jamais
 * une page morte.
 */
export const workContextsApi = {
  /** Les contextes visibles pour l'appelant (siens + BU + partagés espace). */
  async list(): Promise<WorkContextsResponse> {
    return workContextsResponseSchema.parse(await apiFetch<unknown>({ path: '/work-contexts' }))
  },
  /** Créer une variante — jamais une modification du profil principal (#2455.1). */
  async create(body: CreateWorkContext): Promise<WorkContext> {
    return workContextSchema.parse(
      await apiFetch<unknown, CreateWorkContext>({ path: '/work-contexts', method: 'POST', body }),
    )
  },
  /** Bascule : ouvre une conversation neuve, le fil d'origine reste intact (#2455.5). */
  async activate(id: string): Promise<ActivateWorkContextResponse> {
    return activateWorkContextResponseSchema.parse(
      await apiFetch<unknown>({ path: `/work-contexts/${id}/activate`, method: 'POST' }),
    )
  },
  /** Conservé pour l'historique, non proposé par défaut (#2455.3). */
  async archive(id: string): Promise<WorkContext> {
    return workContextSchema.parse(await apiFetch<unknown>({ path: `/work-contexts/${id}/archive`, method: 'PATCH' }))
  },
  /**
   * #2455.6 — le DIFF pur à proposer (jamais une écriture) : `suggestion:
   * null` tant que l'usage n'est pas régulier ou que rien ne diverge.
   */
  async profileSuggestion(id: string): Promise<WorkContextProfileSuggestionResponse> {
    return workContextProfileSuggestionResponseSchema.parse(
      await apiFetch<unknown>({ path: `/work-contexts/${id}/profile-suggestion` }),
    )
  },
}

export const workContextKeys = {
  all: ['work-contexts'] as const,
  list: (userId?: string) => ['work-contexts', 'list', userId] as const,
}
