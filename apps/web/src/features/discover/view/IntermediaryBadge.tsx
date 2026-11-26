import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { DiscoverCandidate } from '../lib/discover-types'

/**
 * #2265.14 — « jamais un intermédiaire présenté comme client final sans
 * badge ». `isIntermediary` (typologie #2265.1/.3, `discover_signals.py`)
 * nomme un cabinet de recrutement ou une plateforme de mise en relation qui
 * publie POUR un tiers — un commercial qui l'ignore travaille un compte qui
 * n'a jamais le besoin qu'il croit avoir vu.
 *
 * #3757.2 — une ESN (Accenture, Sopra…) est nommée concurrente ou partenaire rang 2
 * potentiel par le MÊME avertissement, jamais présentée comme client final.
 *
 * #3757 (reste) — un SIREN que CET espace a déclaré partenaire (fait réel,
 * `partner_relations`) reçoit son PROPRE libellé, « Partenaire déclaré » : ce
 * n'est plus une hypothèse NAF. `isDeclaredPartner`/`isEsnPeer` ne se cumulent
 * jamais (même classement, `classify_actor_type`, apps/ia) — l'ordre ci-dessous
 * ne départage donc rien en pratique, il documente lequel PRIME si un jour ils
 * le pouvaient.
 *
 * Même règle d'affichage que `QualificationBadge`/`AccessLevelBadge` : l'état
 * ordinaire (pas intermédiaire, ou pas encore classé) n'affiche RIEN — seul
 * l'avertissement mérite d'être signalé.
 */
export function IntermediaryBadge({
  candidate,
}: {
  candidate: Pick<DiscoverCandidate, 'isIntermediary' | 'isEsnPeer' | 'isDeclaredPartner'>
}) {
  const { t } = useTranslation('discover')
  // Un intermédiaire prime : son jugement est plus spécifique qu'« ESN » (même ordre
  // des preuves que `classify_actor_type`). #3757.2 — l'ESN reçoit le même avertissement.
  // #3757 (reste) — un fait déclaré prime sur l'hypothèse ESN générique.
  const kind =
    candidate.isIntermediary === true
      ? 'intermediary'
      : candidate.isDeclaredPartner === true
        ? 'declaredPartner'
        : candidate.isEsnPeer === true
          ? 'esnPeer'
          : null
  if (kind === null) return null

  return (
    <div
      className="mb-2 flex items-start gap-1.5 rounded-md px-2 py-1.5"
      style={{ background: 'var(--warning-soft-bg)', border: '1px solid var(--warning-soft-border)' }}
    >
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" style={{ color: 'var(--warning-soft-text)' }} />
      <span className="text-xs leading-snug" style={{ color: 'var(--warning-soft-text)' }}>
        <span className="font-medium">{t(`${kind}.label`)}</span>
        {' — '}
        {t(`${kind}.help`)}
      </span>
    </div>
  )
}
