import { cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { FolderInput, ListChecks, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTargetLists } from '@/features/target-lists/api'
import { splitContactLists } from '@/features/target-lists/lib/contact-lists'

type ContactsTab = 'directory' | 'lists' | 'imports'

const TAB =
  'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bellum-primary-500)]'
const ACTIVE = 'border-[var(--bellum-primary-500)] text-[var(--bellum-text-primary)]'
const IDLE = 'border-transparent text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]'

/**
 * #4503.1 (contrat Louis 24/10) — Théo B c1-repertoire `.v13-tabs` : « Répertoire · Mes listes (N) · Imports &
 * sources », sous l'en-tête de Contacts, sur les TROIS routes existantes (`/contacts`, `/contacts/lists`,
 * `/contacts/imports`). Le compteur de « Mes listes » compte les listes actives (contacts et comptes, les deux
 * onglets de la page) ; tant que les listes n'ont pas répondu, aucun chiffre — jamais un « 0 » deviné.
 */
export function ContactsTabs({ current, className }: { current: ContactsTab; className?: string }) {
  const { t } = useTranslation('contacts')
  const lists = useTargetLists()
  const split = lists.data ? splitContactLists(lists.data) : null
  const listCount = split ? split.contacts.active.length + split.accounts.active.length : undefined
  const tabs = [
    { key: 'directory' as const, to: '/contacts' as const, icon: Users, label: t('tabs.directory') },
    { key: 'lists' as const, to: '/contacts/lists' as const, icon: ListChecks, label: t('tabs.lists') },
    { key: 'imports' as const, to: '/contacts/imports' as const, icon: FolderInput, label: t('tabs.imports') },
  ]
  return (
    <nav
      aria-label={t('tabs.aria')}
      data-testid="contacts-tabs"
      className={cn(
        'flex gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--bellum-border)]',
        className,
      )}
    >
      {tabs.map(tab => {
        const Icon = tab.icon
        const active = tab.key === current
        return (
          <Link
            key={tab.key}
            to={tab.to}
            // `/contacts` est le préfixe des deux autres routes : sans `exact`, le routeur le déclare courant partout.
            activeOptions={{ exact: true }}
            aria-current={active ? 'page' : undefined}
            className={cn(TAB, 'shrink-0', active ? ACTIVE : IDLE)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {tab.label}
            {tab.key === 'lists' && listCount !== undefined ? (
              <span
                data-testid="contacts-tabs-lists-count"
                className="rounded-full bg-[var(--bellum-surface-2)] px-1.5 text-xs tabular-nums text-[var(--bellum-text-secondary)]"
              >
                {listCount}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
