import { useTranslation } from 'react-i18next'
import { AggregateNote } from './AggregateNote'
import { FIGURE_SOURCES, figureScopeIsComplete, type FigureScopeValue } from './figure-scope'

/**
 * #4298.2 — « 30 derniers jours · ton CRM » : la PÉRIODE et la SOURCE d'un
 * chiffre du Tableau de bord, dites sous lui.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN SEUL COMPOSANT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────
 * Les chiffres de `/dashboard` disaient leur fenêtre au mieux dans leur
 * libellé (« messages (7 j) »), au pire nulle part — et un chiffre sans
 * période se lit comme « depuis toujours » ou « aujourd'hui », au hasard du
 * lecteur. `CockpitSources` dit déjà la provenance d'un BLOC du recul ; cette
 * primitive dit celle d'UN chiffre, avec le même vocabulaire de sources.
 *
 * ⚠️ La SOURCE est une capacité que l'ESPACE a branchée ou qu'il nourrit
 * (« ton CRM », « ta messagerie », « ton portefeuille »), JAMAIS un
 * fournisseur de BellumAI — doctrine « on nomme ce que l'espace a branché ».
 * La liste est FERMÉE : une source hors liste fait lever le rendu, plutôt
 * que d'afficher une clé de traduction brute ou un nom d'éditeur.
 *
 * ⚠️ La PÉRIODE est obligatoire par le type, et `figureScopeIsComplete` la
 * vérifie à l'exécution : la garde `dashboard-figures-say-period-and-source`
 * refuse un chiffre du Tableau de bord rendu sans cette ligne.
 */
export function FigureScope({ scope, className }: { scope: FigureScopeValue; className?: string }) {
  const { t } = useTranslation('common')
  for (const source of scope.sources) {
    if (!FIGURE_SOURCES.has(source)) throw new Error(`FigureScope: source inconnue « ${source} »`)
  }
  if (!figureScopeIsComplete(scope)) throw new Error('FigureScope: période absente')

  const period =
    scope.period.kind === 'now'
      ? t('figureScope.period.now')
      : scope.period.kind === 'month'
        ? t('figureScope.period.month', { month: scope.period.month })
        : t(`figureScope.period.${scope.period.kind}`, { days: scope.period.days })
  const sources =
    scope.sources.length > 0
      ? scope.sources.map(source => t(`figureScope.sources.${source}`)).join(' · ')
      : t('figureScope.sourcesNone')

  return (
    <AggregateNote element="span" className={className}>
      {`${period} · ${sources}`}
    </AggregateNote>
  )
}
