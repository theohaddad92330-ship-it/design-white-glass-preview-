import { DISCOVER_NEED_RECENT_MONTHS } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import type { DiscoverCandidate } from '../lib/discover-types'

/**
 * #4430 / #4437 (Louis 21/10/2026) — d'où vient un compte proposé, en une ligne :
 *
 * - `widenedFrom` : ajouté par le palier VOISIN d'un signal maigre (« Voisin de ta demande : appel
 *   d'offres du domaine ») — l'exact reste en tête, le voisin dit pourquoi il est là ;
 * - `skillFreshFill` : ajouté à une recherche par compétence maigre par une collecte d'offres fraîche ;
 * - `jobsAsOf` : ses offres sont lues dans le cache commun — la date de leur collecte ;
 * - `observedNeed` (#4791.2, Louis 31/10) : le besoin DATÉ observé chez ce compte, « Besoin Java, mars 2025 ».
 *
 * Jamais le nom d'une source (doctrine). Rien de tout ça → rien de rendu (GA-18/19).
 */

const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
const MONTH_FORMAT: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }
/** #5203 — « récent » = moins de 6 mois : le MÊME seuil que le filtre de période (`DISCOVER_NEED_RECENT_MONTHS`). */
const RECENT_MONTHS = DISCOVER_NEED_RECENT_MONTHS

/** Mois entiers écoulés depuis une date AAAA-MM(-JJ) ; `null` si illisible (jamais deviné). */
function monthsSince(date: string): number | null {
  const at = Date.parse(date.length === 7 ? `${date}-01` : date.slice(0, 10))
  if (!Number.isFinite(at)) return null
  return Math.floor((Date.now() - at) / (30.44 * 86_400_000))
}
const KNOWN_VIA = ['hiring', 'tender', 'capital'] as const

type Provenance = Pick<
  DiscoverCandidate,
  'widenedFrom' | 'skillFreshFill' | 'jobsAsOf' | 'observedNeed' | 'fromCommonBase'
>

export function CandidateProvenance({ candidate }: { candidate: Provenance }) {
  const { t } = useTranslation('discoverSkill')
  const parts: string[] = []
  const via = candidate.widenedFrom?.via
  if (via) {
    const known = (KNOWN_VIA as readonly string[]).includes(via) ? via : 'other'
    parts.push(t('provenance.widened', { via: t(`provenance.via.${known}`) }))
  }
  if (candidate.skillFreshFill) parts.push(t('provenance.freshFill'))
  // #4793.1 (recette 01/11) — un compte venu de la base commune se reconnaît : « Repéré dans la base commune ».
  if (candidate.fromCommonBase) parts.push(t('provenance.commonBase'))
  if (candidate.jobsAsOf) {
    const day = formatDate(candidate.jobsAsOf, DAY_FORMAT) ?? candidate.jobsAsOf
    parts.push(t('provenance.jobsAsOf', { date: day }))
  }
  if (candidate.observedNeed) {
    const { label, date, nature } = candidate.observedNeed
    if (nature) {
      // #5203 — la NATURE et la date : « Mission Java, en 2022 » / « Recrutement Java, il y a 3 mois ».
      const months = monthsSince(date)
      const when =
        months !== null && months < RECENT_MONTHS
          ? t('provenance.monthsAgo', { count: Math.max(months, 1) })
          : t('provenance.inYear', { year: date.slice(0, 4) })
      parts.push(t('provenance.observedNeedNature', { nature: t(`provenance.nature.${nature}`), label, when }))
    } else {
      const month = formatDate(date, MONTH_FORMAT) ?? date
      parts.push(t('provenance.observedNeed', { label, date: month }))
    }
  }
  if (parts.length === 0) return null
  return (
    <p data-testid="candidate-provenance" className="text-xs" style={{ color: 'var(--text-muted)' }}>
      {parts.join(' · ')}
    </p>
  )
}
