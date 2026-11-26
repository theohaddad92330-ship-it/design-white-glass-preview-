import type { ManagerPlaybook, ManagerPlaybooks } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// i18n keys: playbooks.kind.playbook | playbooks.kind.method_playbook
const KNOWN_KINDS: readonly string[] = ['playbook', 'method_playbook']

/**
 * « Playbooks partagés » — maquette p.11, bloc 11.
 *
 * Ramène sur le cockpit ce que l'onglet Playbooks de Connaissances contient déjà
 * (`library_items`), avec un lien vers l'écran complet. La maquette montre aussi
 * un « taux de réussite » par playbook : il n'existe AUCUN compteur d'usage en
 * base, donc on ne l'affiche pas — un taux inventé violerait « jamais de donnée
 * fictive ». On liste ce qui existe : titre, catégorie, nature.
 */
export function PlaybooksCard({ playbooks }: { playbooks: ManagerPlaybooks }) {
  const { t } = useTranslation('manager')

  return (
    <section className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('playbooks.title')}
        </Text>
        {/* Le cockpit n'édite pas les playbooks : il pointe vers l'écran qui le
            fait (Connaissances). */}
        <Link to="/settings/knowledge" className="text-xs text-[var(--bellum-text-accent)] underline">
          {t('playbooks.openKnowledge')}
        </Link>
      </div>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('playbooks.subtitle')}
      </Text>

      <ul className="mt-3 space-y-2">
        {playbooks.items.map(item => (
          <PlaybookRow key={item.id} item={item} />
        ))}
      </ul>

      {/* La troncature se dit, comme partout ailleurs sur ce cockpit. */}
      {playbooks.total > playbooks.items.length ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('playbooks.truncated', { count: playbooks.items.length, total: playbooks.total })}
        </Text>
      ) : null}
    </section>
  )
}

function PlaybookRow({ item }: { item: ManagerPlaybook }) {
  const { t } = useTranslation('manager')
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
      <Text size="sm" weight="medium" className="min-w-0 text-[var(--bellum-text-primary)]">
        {item.title}
      </Text>
      <Text size="xs" className="whitespace-nowrap text-[var(--bellum-text-muted)]">
        {/* Nature du playbook (traduite si connue) ; la catégorie brute suit
            quand elle existe — jamais reformulée côté serveur. */}
        {KNOWN_KINDS.includes(item.kind) ? t(`playbooks.kind.${item.kind}`) : item.kind}
        {item.category ? ` · ${item.category}` : ''}
      </Text>
    </li>
  )
}
