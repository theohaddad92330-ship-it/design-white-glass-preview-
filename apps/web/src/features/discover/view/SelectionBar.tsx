import { useTranslation } from 'react-i18next'
import { Download, Sparkles, Target, UserPlus, X } from 'lucide-react'
import { AskLaura } from '@/components/primitives/AskLaura'

/* ------------------------------------------------------------------ */
/*  #2166.54 — la barre de sélection multiple des résultats comptes.    */
/*                                                                     */
/*  Trois gestes de LOT (#2166.55, .59, .60) — ajouter à une cible,     */
/*  exporter la sélection, la masquer — et un quatrième qui n'en écrit  */
/*  aucun : tout désélectionner. Aucune insertion automatique : chaque  */
/*  geste est un clic explicite sur un ensemble que le commercial a     */
/*  composé lui-même (doctrine « geste d'utilisateur = auto-approuvé »). */
/*                                                                     */
/*  #2166.48 — « Comparer » s'y ajoute comme un lien AskLaura, jamais un */
/*  appel direct : `compare_accounts` n'existe QUE comme outil du       */
/*  copilote (`apps/api/src/modules/ia/ia.client.ts`), il n'y a pas de  */
/*  route REST à appeler depuis l'écran. Même substitution que          */
/*  #2151.53/.54/.56/#2166.52. Comparer suppose au moins DEUX comptes    */
/*  déjà en portefeuille (`compare.py` lit `accounts` par `account_ids`) */
/*  — un candidat de marché sans fiche n'entre pas dans la liste.       */
/*                                                                     */
/*  #2166.57 — « Chercher les contacts » chaîne le geste SIMPLE déjà      */
/*  posé par ligne (#2151.55/#2166.49) sur la SÉLECTION entière : la    */
/*  vue bascule sur les personnes, filtrées en OR sur les noms des N     */
/*  candidats sélectionnés (`DiscoverContactFilters.companies`,         */
/*  `discover-contact-rows.ts`). Rien d'autre à choisir : contrairement */
/*  à Comparer, un candidat de marché sans fiche compte entre aussi     */
/*  dans la recherche (elle porte sur un NOM, pas un identifiant).      */
/* ------------------------------------------------------------------ */

interface SelectionBarProps {
  count: number
  onClear: () => void
  onAddToTarget: () => void
  /** #2081.14 — absent quand la règle d'espace réserve l'export aux administrateurs : le bouton est MASQUÉ. */
  onExportSelection?: () => void
  onDismissSelection: () => void
  /** #2166.58 — ouvre le dialogue d'attribution de la sélection. */
  onAssignSelection: () => void
  /** #2166.56 — ouvre le dialogue d'analyse de LOT (acte payant, coût annoncé
   *  avant tout débit — voir `AnalyzeSelectionDialog`). */
  onAnalyzeSelection: () => void
  /** #2166.48 — noms des candidats SÉLECTIONNÉS qui portent déjà une fiche
   *  compte (`accountId` connu). Sous deux, comparer ne veut rien dire. */
  compareEligibleNames: string[]
}

export function SelectionBar({
  count,
  onClear,
  onAddToTarget,
  onExportSelection,
  onDismissSelection,
  onAssignSelection,
  onAnalyzeSelection,
  compareEligibleNames,
}: SelectionBarProps) {
  const { t, i18n } = useTranslation('discover')

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-2.5"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {t('selection.count', { count })}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onAnalyzeSelection}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-surface-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Sparkles className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
          {t('selection.analyzeSelection')}
        </button>
        {/* #4308.1 — « Chercher les contacts » retiré de la sélection (décision Louis 19/10). */}
        <button
          type="button"
          onClick={onAddToTarget}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--violet-500)', color: 'var(--bellum-on-primary)' }}
        >
          <Target className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
          {t('selection.addToTarget')}
        </button>
        {onExportSelection ? (
          <button
            type="button"
            onClick={onExportSelection}
            className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-surface-hover)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Download className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
            {t('selection.exportSelection')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismissSelection}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-surface-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('selection.dismissSelection')}
        </button>
        <button
          type="button"
          onClick={onAssignSelection}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-[color:var(--bg-surface-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <UserPlus className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
          {t('selection.assignSelection')}
        </button>
        {compareEligibleNames.length >= 2 ? (
          <AskLaura
            label={t('selection.compareWithLaura')}
            question={t('selection.compareWithLauraQuestion', {
              names: new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
                compareEligibleNames,
              ),
            })}
          />
        ) : (
          // Défaut mesuré en prod (passage 12, 17/09) — avec 2 (ou plus) lignes
          // cochées, « Comparer » disparaissait EN SILENCE dès qu'un candidat de
          // marché sans fiche compte était dans la sélection. La condition
          // (#2166.48, comptes déjà en portefeuille) est juste — `compare.py`
          // ne lit que des `account_ids` réels — mais ce qu'elle écarte doit être
          // NOMMÉ, même règle que `unresolvedNaf` / `withoutSignal` ailleurs sur
          // cet écran : un silence se lit comme un bouton oublié, pas comme une
          // contrainte. Rien à un seul coché : comparer un seul ne veut rien dire.
          count >= 2 && (
            <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>
              {t('selection.compareUnavailable', { count: compareEligibleNames.length })}
            </span>
          )
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label={t('selection.clear')}
          title={t('selection.clear')}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors hover:bg-[color:var(--bg-surface-hover)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
