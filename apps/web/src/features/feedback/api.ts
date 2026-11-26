import { apiFetch } from '@/lib/api'
import type { AppContext } from './appContext'
import type { FeedbackAttachment } from './attachments'
import type { Breadcrumb } from './breadcrumbs'
import type { ElementContext } from './elementContext'
import type { NetworkFailure } from './networkBuffer'

export type FeedbackCategory = 'bug' | 'metier' | 'autre'

type CreateFeedbackInput = {
  category: FeedbackCategory
  message: string
  accountId?: string | null
  userEmail?: string | null
  pageUrl?: string | null
  userAgent?: string | null
  consoleLogs?: string | null
  errorLogs?: string | null
  elementContext?: ElementContext | null
  screenshot?: string | null
  // #1792 — pièces choisies par la personne, en plus de la capture ci-dessus.
  attachments?: FeedbackAttachment[]
  networkFailures?: NetworkFailure[]
  breadcrumbs?: Breadcrumb[]
  appContext?: AppContext | null
}

/**
 * Ce que l'API rend après un signalement. `github_issue_number` vaut `null`
 * quand aucune issue n'a pu être ouverte (intégration éteinte, jeton périmé) —
 * l'écran DOIT le dire plutôt que d'annoncer une issue qui n'existe pas.
 */
type CreatedFeedback = {
  id: string
  created_at: string
  github_issue_number: number | null
  github_issue_url: string | null
}

export const feedbackApi = {
  create(input: CreateFeedbackInput): Promise<CreatedFeedback> {
    return apiFetch<CreatedFeedback, CreateFeedbackInput>({
      path: '/feedback',
      method: 'POST',
      body: input,
    })
  },
}
