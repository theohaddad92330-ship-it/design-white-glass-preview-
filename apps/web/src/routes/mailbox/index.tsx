import { mailSearchIntentSchema } from '@bellum/contracts'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MAILBOX_VIEWS, type MailboxView } from '@/features/mailbox/lib/mailbox-views'
import { MailboxPage } from '@/features/mailbox/view/MailboxPage'

/** « Ta messagerie » — recherche par intention métier et dépôt de brouillons. */
export const Route = createFileRoute('/mailbox/')({
  /**
   * L'écran s'ouvre aussi depuis « Ma journée » : une relance y désigne un fil
   * précis ET l'intention qui le contient. Sans l'intention, on ouvrirait la
   * liste par défaut, où le fil visé n'est pas forcément — ce qui se lirait
   * « ce fil n'existe pas ».
   *
   * Une intention inconnue est IGNORÉE plutôt que refusée : un lien collé de
   * travers doit ouvrir la messagerie, pas une page d'erreur.
   */
  validateSearch: (search: Record<string, unknown>) => {
    const intent = mailSearchIntentSchema.safeParse(search.intent)
    const thread = typeof search.thread === 'string' && search.thread.length > 0 ? search.thread : undefined
    // #3718 — l'adresse du contact dont on traite la réponse (fiche contact).
    const counterpart =
      typeof search.counterpart === 'string' && search.counterpart.trim().length > 0
        ? search.counterpart.trim().slice(0, 320)
        : undefined
    // Théo B m2-brouillons.R1 — la vue ouverte (`vue`) ; une valeur inconnue ouvre « À traiter », jamais une erreur.
    const vue = MAILBOX_VIEWS.find(candidate => candidate === search.vue && candidate !== 'inbox')
    const sequence = typeof search.sequence === 'string' && search.sequence.length > 0 ? search.sequence : undefined
    return {
      ...(vue ? { vue } : {}),
      ...(vue === 'drafts' && sequence ? { sequence } : {}),
      ...(intent.success ? { intent: intent.data } : {}),
      ...(thread ? { thread } : {}),
      ...(counterpart ? { counterpart } : {}),
    }
  },
  component: MailboxRoute,
})

function MailboxRoute() {
  const { intent, thread, counterpart, vue, sequence } = Route.useSearch()
  const navigate = useNavigate()
  const onViewChange = (next: MailboxView) =>
    void navigate({ to: '/mailbox', search: next === 'inbox' ? {} : { vue: next } })
  return (
    <MailboxPage
      initialIntent={intent}
      initialCounterpart={counterpart}
      highlightThreadId={thread ?? null}
      view={vue ?? 'inbox'}
      sequenceId={sequence}
      onViewChange={onViewChange}
    />
  )
}
