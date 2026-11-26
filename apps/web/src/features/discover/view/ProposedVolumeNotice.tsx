import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import type { ProposedAccountVolume } from '@/features/discover/lib/discover-capacity'
import { DISCOVER_LIST_STEP } from '@/features/discover/lib/discover-list-window'

/**
 * #2291.9 — DÉCISION Louis 19/09/2026 : « la capacité commerciale adapte le
 * volume de comptes proposé », affichée AVEC sa règle — un volume sans la
 * grille qui l'a produit serait un nombre qu'on ne peut pas vérifier, comme
 * un score nu (doctrine, CandidateScore).
 *
 * Deux lectures, jamais confondues :
 *  - `band` connu : la grille (`discover-capacity.ts`) a trouvé un palier —
 *    « 25 comptes proposés — ton équipe commerciale compte 4 à 8 personnes ».
 *  - `band === null` : taille non déclarée (ou une réponse que la grille ne
 *    reconnaît pas) — le volume est le défaut ACTUEL, inchangé, et la phrase
 *    le dit plutôt que de laisser deviner pourquoi ce nombre-là.
 */
export function ProposedVolumeNotice({ volume }: { volume: ProposedAccountVolume }) {
  const { t } = useTranslation('discover')

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-1.5 rounded-lg p-3 text-xs leading-snug"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
        color: 'var(--text-secondary)',
      }}
    >
      <Users className="mt-px h-[13px] w-[13px] shrink-0" aria-hidden />
      <span>
        {volume.band
          ? t('capacity.notice', { count: volume.count, band: t(`capacity.band.${volume.band}`) })
          : t('capacity.noticeUndeclared', { count: volume.count })}{' '}
        {/* #4016 L7 — Découvrir SANS PALIER (décision Louis 11/10/2026) : le
            volume n'est qu'un premier lot. Aucun débit : la recherche Découvrir
            ne consomme aucun crédit, et la phrase le dit plutôt que de laisser
            croire qu'un « plus » se paie. */}
        {t('capacity.firstBatch', { step: DISCOVER_LIST_STEP })}
      </span>
    </div>
  )
}
