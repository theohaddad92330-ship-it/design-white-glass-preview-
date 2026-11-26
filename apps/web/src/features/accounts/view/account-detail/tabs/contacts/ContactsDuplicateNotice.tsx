import type { Contact } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * LOIC-FIX2 O.5 — la fiche PROPOSE de rapprocher deux fiches du compte qui semblent être la même personne
 * (« Cottet Alain » / « Alain COTTET »), avec la RAISON du rapprochement. Doctrine : on propose, on ne fusionne
 * JAMAIS — aucun geste de fusion ici, seulement l'ouverture des deux fiches pour que l'humain tranche.
 * Lecture pure du calcul à la lecture (`GET /contacts/account/:id/duplicate-proposals`, #4114) ; aucune paire, aucune
 * ligne (on n'affiche pas ce qu'on n'a pas). Servi aussi en démo : il se calcule, il n'est pas collecté.
 */
export function ContactsDuplicateNotice({
  accountId,
  contacts,
  onContactClick,
}: {
  accountId: string
  contacts: Contact[]
  onContactClick?: (contact: Contact) => void
}) {
  const { t } = useTranslation('accountOrg')
  const queryClient = useQueryClient()
  const proposalsKey = [...contactKeys.byAccount(accountId), 'duplicate-proposals']
  // #4114.4 — la décision de l'humain sur une paire PROPOSÉE : enregistrée, jamais une fusion.
  const decide = useMutation({
    mutationFn: (input: { leftId: string; rightId: string; decision: 'same' | 'not_same' }) =>
      contactsApi.decideDuplicate(accountId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: proposalsKey }),
  })
  const { data } = useQuery({
    queryKey: proposalsKey,
    queryFn: () => contactsApi.duplicateProposals(accountId),
    enabled: !!accountId,
  })
  const pairs = data?.pairs ?? []
  const groups = data?.shared_email_groups ?? []
  // Le compteur dit des SITUATIONS (une adresse partagée = une), jamais des combinaisons.
  const situations = pairs.length + groups.length
  if (situations === 0) return null
  const byId = new Map(contacts.map(contact => [contact.id, contact]))
  return (
    <div className="space-y-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--warning-soft-bg)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Users className="size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium text-[var(--warning-soft-text)]">
          {t('contactsTab.duplicates.title', { count: situations })}
        </p>
      </div>
      <ul className="space-y-2">
        {pairs.map(pair => (
          <li key={`${pair.left.id}-${pair.right.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 text-sm text-[var(--bellum-text-secondary)]">
              {t('contactsTab.duplicates.pair', {
                left: pair.left.fullName ?? '',
                right: pair.right.fullName ?? '',
                reasons: pair.reasons.join(', '),
              })}
            </p>
            {[pair.left, pair.right].map(side => {
              const contact = byId.get(side.id)
              return contact ? (
                <Button
                  key={side.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  aria-label={t('row.openProfileAria', { name: side.fullName ?? '' })}
                  onClick={() => onContactClick?.(contact)}
                >
                  {side.fullName}
                </Button>
              ) : null
            })}
            {/* #4114.4 — deux gestes, aucun ne fusionne : la confirmation est une décision enregistrée. */}
            {pair.decision === 'same' ? (
              <p className="shrink-0 text-sm font-medium text-[var(--bellum-text-secondary)]">
                {t('contactsTab.duplicates.confirmed')}
              </p>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 shrink-0"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ leftId: pair.left.id, rightId: pair.right.id, decision: 'same' })}
              >
                <Check className="size-4" aria-hidden />
                {t('contactsTab.duplicates.same')}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ leftId: pair.left.id, rightId: pair.right.id, decision: 'not_same' })}
            >
              <X className="size-4" aria-hidden />
              {t('contactsTab.duplicates.notSame')}
            </Button>
          </li>
        ))}
        {groups.map(group => (
          <li key={group.email} className="space-y-1">
            <p className="min-w-0 text-sm text-[var(--bellum-text-secondary)]">
              {t('contactsTab.duplicates.sharedEmail', { count: group.contacts.length, email: group.email })}{' '}
              {t(`contactsTab.duplicates.sharedEmailReason.${group.reason}`)}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.contacts.map(side => {
                const contact = byId.get(side.id)
                return contact ? (
                  <Button
                    key={side.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 shrink-0"
                    aria-label={t('row.openProfileAria', { name: side.fullName ?? '' })}
                    onClick={() => onContactClick?.(contact)}
                  >
                    {side.fullName}
                  </Button>
                ) : null
              })}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--bellum-text-muted)]">{t('contactsTab.duplicates.noMerge')}</p>
    </div>
  )
}
