import { discoverFamily, type DiscoverFamily } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/**
 * La famille d'un candidat, en clair (tome 1 §8.4).
 *
 * Quatre familles, et la quatrième est AFFICHÉE (D59). Masquer les comptes hors
 * de portée ferait chercher ailleurs ce qu'on a déjà écarté — un commercial doit
 * savoir qu'un compte existe, pourquoi il n'est pas pour lui aujourd'hui, et ce
 * qui changerait la réponse.
 */
export function familyOf(candidate: DiscoverCandidate): DiscoverFamily {
  return discoverFamily({ addressability: candidate.addressability ?? null, signalCount: candidate.signals.length })
}

export function FamilyBadge({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const family = familyOf(candidate)
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-xs"
      style={{
        background: 'var(--bg-elevated)',
        color: family === 'out_of_reach' ? 'var(--text-muted)' : 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      title={t(`family.help.${family}`)}
    >
      {t(`family.label.${family}`)}
    </span>
  )
}
