import type { AccountChangeItem, AccountChanges } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { GitCompareArrows } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatActionDate } from '@/features/action-history/view/actionHistoryPresentation'
import { useAccountChanges } from '@/features/accounts/hooks/useAccountChanges'

/**
 * #4180 (EX-10) — CE QUI A CHANGÉ SUR CE COMPTE DEPUIS LA DERNIÈRE VÉRIFICATION.
 *
 * Nouveaux responsables, changements d'entité, besoins documentés, offres de recrutement, événements — chacun avec la
 * date du FAIT et l'entité quand le fait la nomme. Trois issues honnêtes, jamais une quatrième inventée :
 * des changements ; « rien de nouveau », qui NOMME ce qui reste connu (rien n'est effacé) ; ou, sans date de
 * vérification précédente, RIEN (aucune comparaison possible : ni « rien de nouveau » ni « 0 »). Une panne ne se
 * raconte jamais « rien de nouveau ». Une offre de recrutement reste une offre : elle le dit.
 */
export function AccountChangesCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts')
  const { data, isPending, isError } = useAccountChanges(accountId)

  if (isPending) return null
  if (isError) {
    return (
      <Card className="p-4">
        <CardHeader title={t('changes.title')} />
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('changes.unreadable')}
        </Text>
      </Card>
    )
  }
  // Sans vérification précédente, rien n'est comparable : la carte ne dit rien.
  if (data.status === 'no_reference' || data.lastCheckedAt === null) return null

  const date = formatActionDate(data.lastCheckedAt)
  return (
    <Card className="p-4">
      <CardHeader title={t('changes.title')} />
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('changes.subtitle', { account: data.account.name, date })}
      </Text>
      {data.status === 'nothing_new' ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-primary)]" data-testid="account-changes-nothing-new">
          {t('changes.nothingNew', { date })}
          {data.retained
            ? ` ${t('changes.retained', { facts: data.retained.facts, contacts: data.retained.contacts })}`
            : ''}
        </Text>
      ) : (
        <>
          {/* #2164.30 — « Ce qui est nouveau » : la section se NOMME, au lieu
              d'une liste qui ne disait pas ce qu'elle était. */}
          <section className="mt-3" data-testid="account-changes-new">
            <SectionTitle>{t('accountSections.new', { ns: 'accountDetail' })}</SectionTitle>
            <ul className="mt-1.5 space-y-1.5">
              {data.items.map((item: AccountChangeItem, index) => (
                <li key={`${item.kind}-${item.date}-${index}`}>
                  <Text size="xs" className="text-[var(--bellum-text-primary)]">
                    {formatActionDate(item.date)} · {t(`changes.kind.${item.kind}`)} · {item.label}
                    {item.entity ? ` (${item.entity})` : ''}
                    {item.confirmedNeed === false ? ` — ${t('changes.hiringIsNotANeed')}` : ''}
                  </Text>
                </li>
              ))}
            </ul>
          </section>
          <AlreadyKnownSection changes={data} />
        </>
      )}
    </Card>
  )
}

/** Les natures de changement qui viennent d'un FAIT du compte (et donc
 *  comptées dans `retained.facts`) ; `new_manager` est un contact. */
const FACT_CHANGE_KINDS: ReadonlySet<AccountChangeItem['kind']> = new Set([
  'documented_need',
  'hiring_offer',
  'business_event',
])

/**
 * #2164.29 — « Ce que nous savions déjà » : ce qui était au dossier AVANT la
 * vérification. `retained` compte tout le dossier, neuf compris : on retire les
 * lignes neuves pour ne pas les dire deux fois. Rien de connu avant ⇒ aucune
 * section (une absence ne fait aucune ligne, jamais « 0 fait »).
 */
function AlreadyKnownSection({ changes }: { changes: AccountChanges }) {
  const { t } = useTranslation('accounts')
  if (!changes.retained) return null
  const newFacts = changes.items.filter(item => FACT_CHANGE_KINDS.has(item.kind)).length
  const newContacts = changes.items.filter(item => item.kind === 'new_manager').length
  const facts = Math.max(0, changes.retained.facts - newFacts)
  const contacts = Math.max(0, changes.retained.contacts - newContacts)
  if (facts === 0 && contacts === 0) return null
  return (
    <section className="mt-3" data-testid="account-changes-already-known">
      <SectionTitle>{t('accountSections.alreadyKnown', { ns: 'accountDetail' })}</SectionTitle>
      <Text size="xs" className="mt-1.5 text-[var(--bellum-text-secondary)]">
        {t('accountSections.alreadyKnownCounts', { ns: 'accountDetail', facts, contacts })}
      </Text>
    </section>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
      {children}
    </Text>
  )
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <GitCompareArrows className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
    </div>
  )
}
