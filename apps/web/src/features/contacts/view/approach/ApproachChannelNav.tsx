import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { ApproachChannel } from './approach-model'

const CHANNELS: readonly ApproachChannel[] = ['email', 'linkedin', 'call']

/** Théo C6/C7 — `.segmented` : changer de canal, c'est changer de page. Trois liens, jamais un bouton mort. */
export function ApproachChannelNav({ contactId, active }: { contactId: string; active: ApproachChannel }) {
  const { t } = useTranslation('engagement')
  return (
    <nav
      aria-label={t('approachPage.channel.title')}
      className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-1"
    >
      {CHANNELS.map(channel => (
        <Link
          key={channel}
          to="/contacts/$id/approach/$channel"
          params={{ id: contactId, channel }}
          aria-current={active === channel ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm transition-colors duration-immediate ease-bellum-out ${
            active === channel
              ? 'bg-card font-semibold text-[var(--bellum-text-primary)] shadow-card'
              : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'
          }`}
        >
          {t(`approachPage.channel.${channel}`)}
        </Link>
      ))}
    </nav>
  )
}
