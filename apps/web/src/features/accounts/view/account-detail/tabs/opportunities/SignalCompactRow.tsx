import type { AccountSignalLine, Contact } from '@bellum/contracts'
import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { signalLineToWatchlistItem, type SignalLineAccount } from '@/features/signals-library/model/account-history'
import { useOfferContractLabel } from '@/lib/offer-contract-label'
import { Highlighted } from '@/features/signals-library/view/Highlighted'
import type { ParsedSearch } from '@/features/signals-library/model/signal-search'
import type { LineNature } from '@/features/accounts/model/lineNature'
import { LineNatureBadge } from './LineNatureBadge'
import { SignalBrowserDialog } from './SignalBrowserDialog'
import { TYPE_DOT, TYPE_TEXT, lineDateLabel, lineSourceLabel } from './SignalLineBody'
import type { ContactReason, ProposableContact } from './signal-contacts'

/** Une personne proposée sur la ligne et ce qu'il faut pour agir sur elle (rendu `PersonBlock`, GA-26). */
export type CompactPerson = {
  person: ProposableContact
  reason: ContactReason | null
  full: Contact | null
  emailVerified?: boolean
  onPrepare?: () => void
  onAddToPlan: () => void
}

/**
 * Lot 773 (a) — LA LIGNE COMPACTE d'un besoin ou d'un fait, UN seul composant (GA-26) pour Signaux › Historique et
 * l'onglet « Signaux et besoins » d'un compte. Repliée : pastille de type · titre sur UNE ligne (ellipsis, texte
 * complet en `title`) · « <source générique> · <date> » · 1-2 contacts en puces. #5191 — Clic / Entrée : la MODALE de détail
 * (`BrowsableDialog` + `WatchlistSignalDetail`, le MÊME détail que la modale des signaux récents de Signaux), plus de dépliage. Une reformulation regroupée (`members` ≥ 2) dit « ×N sources ». Cible ≥ 44 px.
 */
export function SignalCompactRow({
  line,
  account,
  members,
  people,
  highlight = null,
  testId = 'signal-row',
  nature,
  children,
  onOpen,
}: {
  line: AccountSignalLine
  /** Le compte de la ligne : de quoi composer le détail (nom, logo, lieu). */
  account: SignalLineAccount
  /** Les formulations regroupées, tête comprise ; absent ou 1 = ligne seule. */
  members?: readonly AccountSignalLine[]
  people: readonly CompactPerson[]
  highlight?: ParsedSearch | null
  testId?: string
  /** #5004.1 — la nature en badge ; absente (Historique de l'espace) = pas de badge. */
  nature?: LineNature | null
  /** Sous le détail : ce qui n'appartient qu'à l'écran (ex. « Projet possible »). */
  children?: ReactNode
  /** #5191 — la liste qui porte la modale « 1 sur N » ; absent = la ligne ouvre sa propre modale (une seule entrée). */
  onOpen?: () => void
}) {
  const { t } = useTranslation('projects')
  const [own, setOwn] = useState(false)
  const contractLabel = useOfferContractLabel()
  const grouped = members && members.length > 1 ? members : null
  return (
    <li
      data-testid={testId}
      data-period={line.period}
      className="border-b border-[var(--bellum-border)] last:border-b-0"
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => (onOpen ? onOpen() : setOwn(true))}
        className="flex min-h-11 w-full items-center gap-2 py-1.5 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 md:flex-nowrap">
          <span
            className={`order-2 flex shrink-0 items-center gap-2 text-xs font-semibold md:order-1 md:w-32 ${TYPE_TEXT}`}
          >
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${TYPE_DOT}`} />
            {t(`signalTable.types.${line.type}`)}
          </span>
          <Text
            size="sm"
            weight="semibold"
            title={line.title}
            data-testid="signal-title"
            className={`order-1 min-w-0 basis-full md:order-2 md:basis-0 md:flex-1 truncate`}
          >
            <Highlighted text={line.title} search={highlight} />
          </Text>
          <Text
            size="xs"
            color="text-[var(--bellum-text-muted)]"
            data-testid="signal-meta"
            className="order-3 shrink-0"
          >
            {lineSourceLabel(t, line)} · {lineDateLabel(line)}
          </Text>
          {/* #5000.1 — une offre dit son contrat (libellé unique `offer-contract-label`), « non précisé » si inconnu. */}
          {line.type === 'recrutement' ? (
            <span
              data-testid="signal-contract"
              className="order-3 shrink-0 rounded-full border border-[var(--bellum-border)] px-2 text-xs text-[var(--bellum-text-secondary)]"
            >
              {contractLabel(line.contract_type)}
            </span>
          ) : null}
          {nature !== undefined ? (
            <span className="order-4 shrink-0">
              <LineNatureBadge nature={nature} />
            </span>
          ) : null}
          {grouped ? (
            <span
              data-testid="signal-group-count"
              className="order-4 shrink-0 rounded-full border border-[var(--bellum-border)] px-2 text-xs text-[var(--bellum-text-secondary)]"
            >
              {t('signalTable.sources', { count: grouped.length })}
            </span>
          ) : null}
        </span>
        {people.length > 0 ? (
          <span data-testid="signal-chips" className="hidden shrink-0 items-center gap-1 sm:flex">
            {people.slice(0, 2).map(entry => (
              <span
                key={entry.person.id}
                className="max-w-[9rem] truncate rounded-full bg-[var(--accent-soft-bg)] px-2 text-xs text-[var(--accent-soft-text)]"
              >
                {entry.person.full_name}
              </span>
            ))}
          </span>
        ) : null}
        <ChevronRight className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      </button>
      {own ? (
        <SignalBrowserDialog
          entries={[
            { item: signalLineToWatchlistItem(line, account), members: grouped ?? undefined, people, extra: children },
          ]}
          openId={`${account.id}:${line.id}`}
          onOpenChange={() => setOwn(false)}
        />
      ) : null}
    </li>
  )
}
