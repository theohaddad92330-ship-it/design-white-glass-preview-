import { useTranslation } from 'react-i18next'
import { Layers, Scissors, Timer } from 'lucide-react'
import type { DiscoverListCut, DiscoverSearchEffort } from '../lib/discover-search-effort'

/**
 * #4305.2 — l'EFFORT de la recherche, écrit au-dessus de la liste : combien de sources interrogées, ce qui l'a
 * arrêtée. Le budget d'appels existait (compteur journalisé, #4305) sans appelant à l'écran ; ici il se dit en
 * langage de commercial. Jamais un crédit (implicites, décision du 22/10 — le frein est doux et sans chiffre côté
 * client), jamais un fournisseur (doctrine). Sans effort lu, `null`.
 *
 * #4677.4 — `signalsCut` : le temps imparti aux signaux des cartes a coupé la recherche de N entreprises. Nommé
 * en mots simples (« temps imparti »), sans chiffre de coût ; absent = aucune ligne.
 */
export function SearchEffortNotice({
  effort,
  signalsCut,
  listCut,
}: {
  effort: DiscoverSearchEffort | undefined
  signalsCut?: number | undefined
  /** #4706.1 — la liste a été coupée à la limite : « N affichés sur au moins M trouvés ». */
  listCut?: DiscoverListCut | undefined
}) {
  const { t } = useTranslation('discover')
  if (!effort && !signalsCut && !listCut) return null
  const queried = effort ? t('searchEffort.queried', { count: effort.sourcesQueried }) : null
  return (
    <>
      {effort && queried && (
        <p
          data-testid="search-effort"
          role="status"
          className="mb-4 flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Layers aria-hidden="true" className="h-[13px] w-[13px] shrink-0" />
          {effort.stoppedBy ? t(`searchEffort.stopped.${effort.stoppedBy}`, { queried }) : queried}
        </p>
      )}
      {listCut ? (
        <p
          data-testid="list-cut"
          role="status"
          className="mb-4 flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Scissors aria-hidden="true" className="h-[13px] w-[13px] shrink-0" />
          {t(listCut.isLowerBound ? 'listCut.atLeast' : 'listCut.ofTotal', {
            count: listCut.shown,
            total: listCut.found,
          })}
        </p>
      ) : null}
      {signalsCut ? (
        <p
          data-testid="signals-budget"
          role="status"
          className="mb-4 flex items-center gap-1.5 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Timer aria-hidden="true" className="h-[13px] w-[13px] shrink-0" />
          {t('searchEffort.signalsCut', { count: signalsCut })}
        </p>
      ) : null}
    </>
  )
}
