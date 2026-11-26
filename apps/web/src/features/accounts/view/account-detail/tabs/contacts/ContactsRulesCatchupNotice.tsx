import { accountDomainsFrom, hasPendingHomonyms, isContactRulesCatchupNeeded } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { accountKeys } from '@/features/accounts/api'
import { contactsApi, contactKeys } from '@/features/contacts/api'

/**
 * LUDOVIC-C LC.1 (b) — « Remettre les contacts à jour avec les règles actuelles ».
 *
 * Mesuré en prod le 19/10 (STILL, 1467 contacts) : le filtre d'homonymes ne valait que pour
 * les NOUVELLES collectes, et « Agrandir la recherche » laissait stillfront.com au dossier. Ce
 * bandeau apparaît quand la collecte du segment contacts est ANTÉRIEURE à la capacité
 * (`isContactRulesCatchupNeeded`, le même critère que le script opérateur, GA-26) et DIT ce
 * qui se passe : avant (« collecte antérieure aux règles »), pendant, après (combien
 * d'homonymes archivés). Le geste archive, ne supprime rien, ne recollecte rien, ne débite
 * rien, et ne touche jamais un contact corrigé par un humain. Jamais en démo : aucune collecte
 * réelle n'y a eu lieu (même règle que `ContactsStaleCollectionNotice`).
 */
export function ContactsRulesCatchupNotice({
  accountId,
  collectedAt,
  rulesAppliedAt,
  contacts = [],
  accountWebsite,
}: {
  accountId: string
  collectedAt: string | null | undefined
  rulesAppliedAt: string | null | undefined
  /** LUDOVIC-E LC.1b — les contacts du dossier : un homonyme certain encore là commande le geste, quelle que soit la date. */
  contacts?: ReadonlyArray<{
    id: string
    email?: string | null
    source?: string | null
    identity_confirmed_at?: string | null
    excluded_at?: string | null
  }>
  accountWebsite?: string | null
}) {
  const { t } = useTranslation('accountOrg')
  const isDemo = useIsDemo()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => contactsApi.applyCurrentRules(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.byAccount(accountId) })
      void queryClient.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      // #4324.1 — la couverture (« Qui nous manque ») et la carte Personnes se calculent sur les contacts : relues aussi.
      void queryClient.invalidateQueries({ queryKey: accountKeys.coverageGaps(accountId) })
      void queryClient.invalidateQueries({ queryKey: accountKeys.strategy5P(accountId) })
    },
  })
  if (isDemo) return null
  if (mutation.data) {
    return (
      <p
        role="status"
        className="rounded-xl border border-[var(--bellum-border)] px-4 py-3 text-sm text-[var(--bellum-text-secondary)]"
      >
        {t('contactsTab.rulesCatchup.done', { count: mutation.data.archived })}
      </p>
    )
  }
  // LUDOVIC-E LC.1b — « Agrandir la recherche » date la collecte APRÈS la capacité sans retirer ce qui
  // était déjà là : la date dit « antérieur » (ou « inconnu » = antérieur), la présence d'un homonyme
  // certain dit « encore concerné ». L'un OU l'autre.
  const pendingHomonyms = hasPendingHomonyms(
    contacts.map(c => ({ ...c, email: c.email ?? null, source: c.source ?? null })),
    accountDomainsFrom(accountWebsite),
  )
  if (!pendingHomonyms && !isContactRulesCatchupNeeded(collectedAt, rulesAppliedAt)) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--warning-soft-bg)] px-4 py-3">
      <ShieldCheck className="size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium text-[var(--warning-soft-text)]">
        {mutation.isError ? t('contactsTab.rulesCatchup.error') : t('contactsTab.rulesCatchup.title')}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={ShieldCheck}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        className="min-h-11 shrink-0"
      >
        {mutation.isPending ? t('contactsTab.rulesCatchup.actionPending') : t('contactsTab.rulesCatchup.action')}
      </Button>
    </div>
  )
}
