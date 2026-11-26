import type { AccountSignalLine } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { compactSector } from '@bellum/utils'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { BrowsableDialog } from '@/components/overlay/BrowsableDialog'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useAccountPerimeter } from '@/features/accounts/hooks/useAccountPerimeter'
import { usePersistAccountPlan } from '@/features/accounts/hooks/usePersistAccountPlan'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { useOfferContractLabel } from '@/lib/offer-contract-label'
import { watchlistItemToSignalLine } from '@/features/signals-library/model/account-history'
import type { WatchlistItem } from '@/features/watchlist/model/watchlist'
import { WatchlistSignalDetail } from '@/features/watchlist/view/WatchlistSignalDetail'
import { signalLineToPlanAction } from '../veille/watchActions'
import { LineNatureBadge } from './LineNatureBadge'
import { PersonBlock } from './PersonBlock'
import type { CompactPerson } from './SignalCompactRow'
import { SignalLineBody, lineDateLabel } from './SignalLineBody'
import { lineNatureOf, proposalForLine } from './signal-table'

/** Un signal que la modale peut parcourir : l'élément, et ce que SON écran sait en plus (lignes regroupées, personnes). */
export type SignalBrowserEntry = {
  item: WatchlistItem
  /** Les formulations regroupées, tête comprise ; absent ou 1 = ligne seule. */
  members?: readonly AccountSignalLine[]
  /** Les personnes déjà proposées par l'écran ; absent = la modale les propose elle-même (même règle, `proposalForLine`). */
  people?: readonly CompactPerson[]
  /** Sous le détail : ce qui n'appartient qu'à l'écran (ex. « Projet possible »). */
  extra?: ReactNode
}

/**
 * #5191 — LA modale d'un signal, UNE seule (GA-26) : `BrowsableDialog` + `WatchlistSignalDetail` + ce que le détail ne dit
 * pas (période, lieu, site de publication, TJM, personnes à contacter). Tous les écrans qui montrent un signal l'ouvrent
 * ici, avec « 1 sur N » sur LA liste qu'ils affichent — les flèches ne parcourent que ce qui est à l'écran.
 */
export function SignalBrowserDialog({
  entries,
  openId,
  onOpenChange,
  description,
  trailing,
  labels,
}: {
  entries: readonly SignalBrowserEntry[]
  /** `item.id` de l'entrée ouverte ; `undefined` = fermée. */
  openId: string | undefined
  onOpenChange: (id: string | undefined) => void
  description?: string
  trailing?: (item: WatchlistItem) => ReactNode
  labels?: { previous?: string; next?: string }
}) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const index = entries.findIndex(entry => entry.item.id === openId)
  const entry = index >= 0 ? entries[index] : undefined
  if (!entry) return null
  const { item } = entry
  return (
    <BrowsableDialog
      open
      onOpenChange={open => {
        if (!open) onOpenChange(undefined)
      }}
      index={index}
      total={entries.length}
      onIndexChange={next => onOpenChange(entries[next]?.item.id)}
      contentKey={item.id}
      title={item.companyName}
      subtitle={compactSector(item.sector) || undefined}
      description={description ?? t('signalTable.detail.description')}
      labels={labels}
      trailing={trailing?.(item)}
      leading={<CompanyAvatar name={item.companyName} size="md" logoUrl={item.logoUrl} website={item.website} />}
    >
      <WatchlistSignalDetail
        item={item}
        onOpenAccount={accountId => void navigate({ to: '/accounts/$id', params: { id: accountId } })}
      />
      <SignalDetailExtras entry={entry} />
    </BrowsableDialog>
  )
}

/** Ce que `WatchlistSignalDetail` ne dit pas : nature, période, lieu, site de publication, TJM, regroupées, personnes. */
function SignalDetailExtras({ entry }: { entry: SignalBrowserEntry }) {
  const { t } = useTranslation('projects')
  const contractLabel = useOfferContractLabel()
  const { item, members, people, extra } = entry
  const line = useMemo(() => watchlistItemToSignalLine(item), [item])
  const grouped = members && members.length > 1 ? members : null
  const place = line.people_hints.location
  const lineBacked = item.signalLine !== undefined
  return (
    <div data-testid="signal-detail-extras" className="flex flex-col gap-3 border-t border-[var(--bellum-border)] p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {lineBacked ? <LineNatureBadge nature={lineNatureOf(line, Boolean(line.lead_id))} /> : null}
        <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="signal-detail-meta">
          {[
            t(`signalTable.period.${line.period}`),
            // #5000.1 — le contrat de l'offre, même libellé que la ligne ; « non précisé » si l'annonce ne le déclare pas.
            line.type === 'recrutement' ? contractLabel(line.contract_type) : null,
            place ? t('signalTable.detail.location', { place }) : null,
            line.origin ? t('signalTable.detail.publishedOn', { site: line.origin }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </div>
      {grouped ? (
        <ul data-testid="signal-formulations" className="flex flex-col gap-1">
          {grouped.map(member => (
            <li key={member.id} className="text-xs text-[var(--bellum-text-secondary)]">
              {member.title} · {lineDateLabel(member)}
            </li>
          ))}
        </ul>
      ) : null}
      {/* Le détail, les compétences et le lien sont déjà dits par `WatchlistSignalDetail` : seul le reste ici. */}
      {lineBacked ? (
        <SignalLineBody
          line={{ ...line, detail: null, technologies: undefined, url: null }}
          showPrescriber
          detailOnly
          mergedOpen
        />
      ) : null}
      {extra}
      {/* Toujours le bloc : les personnes de l'écran, sinon la règle du compte (`proposalForLine`), sinon l'absence dite. */}
      {people && people.length > 0 ? (
        <PeopleList line={line} people={people} />
      ) : (
        <ItemPeople item={item} line={line} />
      )}
    </div>
  )
}

/** Les personnes à contacter (1-2) : nom, poste, lien vers la fiche. Personne ⇒ le bloc le dit (lot 787), sans liste générique. */
function PeopleList({
  line,
  people,
  accountId,
  loading = false,
}: {
  line: AccountSignalLine
  people: readonly CompactPerson[]
  accountId?: string
  loading?: boolean
}) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  if (people.length === 0 && loading) return null
  return (
    <section
      data-testid="signal-people"
      aria-label={t('signalTable.detail.people')}
      className="flex min-w-0 flex-col gap-2"
    >
      <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('signalTable.detail.people')}
      </Text>
      {people.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="signal-people-none">
            {t('signalTable.detail.nobody')}
          </Text>
          {accountId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() =>
                void navigate({ to: '/accounts/$id', params: { id: accountId }, search: { tab: 'contacts' } })
              }
            >
              {t('signalTable.findContact')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col divide-y divide-dashed divide-[var(--bellum-border)] [&>*]:py-1.5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {people.map(entry => (
          <PersonBlock
            key={entry.person.id}
            person={entry.person}
            reason={entry.reason}
            full={entry.full}
            line={line}
            emailVerified={entry.emailVerified}
            onPrepare={entry.onPrepare}
            onAddToPlan={entry.onAddToPlan}
          />
        ))}
      </div>
    </section>
  )
}

/** Un signal dont l'écran ne propose pas de personnes : même règle que l'onglet du compte, sur les contacts du compte. */
function ItemPeople({ item, line }: { item: WatchlistItem; line: AccountSignalLine }) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const contactsQuery = useContactsByAccount(item.accountId)
  const perimeter = useAccountPerimeter(item.accountId)
  const plan = usePersistAccountPlan(item.accountId)
  const contacts = contactsQuery.data
  const proposal = useMemo(
    () => (contacts ? proposalForLine({ line, contacts, perimeter, accountName: item.companyName }) : null),
    [line, contacts, perimeter, item.companyName],
  )
  const people: CompactPerson[] = (proposal?.people ?? []).map(person => ({
    person,
    reason: proposal?.reasons.get(person.id) ?? null,
    full: contacts?.find(contact => contact.id === person.id) ?? null,
    onAddToPlan: () =>
      void plan
        .addAction(signalLineToPlanAction(line, person.full_name ?? null))
        .then(() => navigate({ to: '/accounts/$id', params: { id: item.accountId }, search: { tab: 'plan' } }))
        .catch(() => toast.error(t('signalTable.detail.planFailed'))),
  }))
  return <PeopleList line={line} people={people} accountId={item.accountId} loading={contacts === undefined} />
}
