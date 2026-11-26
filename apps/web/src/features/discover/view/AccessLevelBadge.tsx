import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { discoverAccessLevel } from '../lib/discover-access-level'
import type { DiscoverCandidate } from '../lib/discover-types'

/**
 * #2646.1 (décision Louis 20/09/2026) — L'ACCÈS NOMMÉ, DÈS DÉCOUVRIR.
 *
 * Louis : « c'est là que ça sert le plus, savoir avant d'analyser si le
 * compte est atteignable en direct. » `discoverAccessLevel` ne peut établir
 * QUE deux états depuis un candidat sans fiche compte — `rang3_plus` (un
 * signal d'attribution de marché NOMME un titulaire) ou `inconnu` (rien ne le
 * dit) — jamais `direct` ni `rang2`, qui exigeraient une preuve qu'aucun
 * candidat non analysé ne peut porter.
 *
 * Même règle d'affichage que `QualificationBadge` : `inconnu` n'affiche RIEN
 * — c'est l'état de la quasi-totalité des lignes, et une pastille neutre
 * partout serait du bruit. Seul `rang3_plus` — l'AVERTISSEMENT — mérite
 * d'être signalé avant l'analyse.
 *
 * ⚠️ Réservé aux candidats SANS `accountId` (l'appelant le filtre) : un
 * compte déjà possédé porte la version PRÉCISE du même badge sur son onglet
 * Accès (`AccountAccessService.landscape`), qui lit de vraies données de
 * portefeuille plutôt qu'un signal public.
 */
export function AccessLevelBadge({ candidate }: { candidate: Pick<DiscoverCandidate, 'signals'> }) {
  const { t } = useTranslation('access')
  const level = discoverAccessLevel(candidate)
  if (level !== 'rang3_plus') return null

  return (
    <div
      className="mb-2 flex items-start gap-1.5 rounded-md px-2 py-1.5"
      style={{ background: 'var(--danger-soft-bg)', border: '1px solid var(--danger-soft-border)' }}
    >
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" style={{ color: 'var(--danger-soft-text)' }} />
      <span className="text-xs leading-snug" style={{ color: 'var(--danger-soft-text)' }}>
        <span className="font-medium">{t('level.state.rang3_plus')}</span>
        {' — '}
        {t('level.help.rang3_plus')}
      </span>
    </div>
  )
}
