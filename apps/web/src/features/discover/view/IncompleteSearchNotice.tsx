import { useTranslation } from 'react-i18next'
import { SearchCheck } from 'lucide-react'
import { isSearchIncomplete } from '@/features/discover/lib/discover-incomplete-search'
import type { DiscoverWidenAxis } from '@/features/discover/lib/discover-filters'

/**
 * #2614.2 — « dire "recherche incomplète" et proposer l'action qui la
 * complète » : `isSearchIncomplete()` (voir `discover-incomplete-search.ts`)
 * existait déjà, testée, mais n'avait AUCUN appelant écran — `git grep
 * "recherche incomplète"` ne rendait rien avant ce lot. Un ou deux comptes
 * trouvés n'est ni un échec (`DiscoverError`) ni un vide (`DiscoverEmpty`,
 * qui répond déjà à zéro) : c'est un résultat réel, trop mince pour bâtir un
 * dossier de conquête, et Laura le dit plutôt que de laisser un commercial
 * croire que la recherche est allée au bout.
 *
 * `matched` doit être `data.coverage.candidatesFound` (le total réellement
 * trouvé), jamais `visible.length` (les affinages client répondent à une
 * autre question). Ton neutre, comme `CoverageNotice` : ce n'est pas une
 * panne.
 *
 * #3814.3 — `axis` nomme la contrainte RÉELLEMENT posée (`suggestedWidenAxis`),
 * jamais une cible inventée : sans contrainte posée, le bouton retombe sur le
 * texte générique d'origine plutôt que de prétendre élargir quelque chose de
 * précis.
 */
/** #4420.4 — ce que chaque critère a écarté, quand c'est MESURÉ. Clé absente = non mesuré (jamais 0, jamais « probablement »). */
type IncompleteSearchDiscarded = { headcount?: number | null; sector?: number | null }

function isCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && value >= 0
}

export function IncompleteSearchNotice({
  matched,
  axis,
  discarded,
  onWiden,
}: {
  matched: number | null
  axis: DiscoverWidenAxis | null
  discarded?: IncompleteSearchDiscarded
  onWiden: () => void
}) {
  const { t } = useTranslation('discover')

  if (!isSearchIncomplete(matched)) return null
  // `isSearchIncomplete` a déjà exclu `null` et `0` : `matched` est un entier positif ici.
  const count = matched as number

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <SearchCheck className="h-[13px] w-[13px]" aria-hidden />
        {t('incompleteSearch.title', { count })}
      </p>
      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {axis === null ? t('incompleteSearch.description') : t(`incompleteSearch.description_${axis}`)}{' '}
        {axis === 'headcount'
          ? isCount(discarded?.headcount)
            ? t('incompleteSearch.discardedBySize', { count: discarded.headcount })
            : t('incompleteSearch.descriptionHeadcountUnmeasured')
          : null}
        {isCount(discarded?.sector) && discarded.sector > 0
          ? ` ${t('incompleteSearch.discardedBySector', { count: discarded.sector })}`
          : null}
      </p>
      <button
        type="button"
        onClick={onWiden}
        className="mt-2 rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
      >
        {axis === null ? t('incompleteSearch.action') : t(`incompleteSearch.action_${axis}`)}
      </button>
    </div>
  )
}
