import { creditCostOf } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Briefcase, X } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Actions graduées d'un candidat — partagées carte ↔ ligne.           */
/*                                                                     */
/*  Ajouter à mon portefeuille (gratuit, ATTRIBUE le compte) · Écarter   */
/*  (gratuit) · Analyser (le SEUL acte                                  */
/*  payant, et il le dit). Extraites pour que la vue liste compacte et  */
/*  la carte proposent EXACTEMENT les mêmes gestes, au même coût, sans  */
/*  deux implémentations à tenir en phase. `compact` réduit les libellés */
/*  portefeuille/Écarter à leurs icônes pour tenir sur une ligne.        */
/*                                                                     */
/*  `orientation="column"` empile l'acte payant en TÊTE, sur sa propre  */
/*  ligne (carte pleine largeur, colonne d'actions à droite) — c'est la */
/*  décision que la carte prépare, et le libellé ne se coupe jamais :   */
/*  un « Construire le dossier / complet » sur deux lignes avec sa      */
/*  pastille de coût posée par-dessus est précisément ce que l'écran    */
/*  faisait avant. Suivre/Écarter viennent SOUS lui, côte à côte plutôt */
/*  qu'empilés (#2489.6) : deux boutons compacts n'ont pas besoin d'un  */
/*  rang chacun.                                                        */
/* ------------------------------------------------------------------ */

interface CandidateActionsProps {
  isFollowed: boolean
  onToggleFollow: () => void
  onDismiss: () => void
  onAnalyze: () => void
  compact?: boolean
  orientation?: 'row' | 'column'
}

export function CandidateActions({
  isFollowed,
  onToggleFollow,
  onDismiss,
  onAnalyze,
  compact = false,
  orientation = 'row',
}: CandidateActionsProps) {
  const { t } = useTranslation('discover')
  const column = orientation === 'column'

  /* L'acte payant. Fond PLEIN et non teinté : une pastille violette à 15 %
     d'opacité disparaît sur une surface claire, alors que c'est le bouton que
     tout l'écran sert à faire cliquer. */
  const analyze = (
    <button
      type="button"
      onClick={onAnalyze}
      title={t('actions.analyzeHint')}
      // #3819 (recette prod 07/10) — `ml-auto whitespace-nowrap` faisait déborder
      // le bouton de 50 px hors de sa carte (10/10 cartes à 1512 px) : largeur
      // BORNÉE à son conteneur, libellé qui revient à la ligne, cible ≥ 44 px.
      className={`flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-opacity hover:opacity-90 ${
        column ? 'w-full justify-center text-center' : 'ml-auto'
      }`}
      style={{ background: 'var(--violet-500)', color: 'var(--bellum-on-primary)' }}
    >
      {t('actions.analyze')}
      <ArrowRight className="h-[13px] w-[13px] shrink-0" />
    </button>
  )

  // #2489.6 — 623 px mesurés en production le 17/09, APRÈS #2489.1/.3/.5 :
  // « Suivre ce compte » et « Écarter » restaient le dernier rang encore
  // empilé un par ligne en colonne. Deux boutons compacts tiennent côte à
  // côte sur les 300 px de la colonne d'actions — `flex-1` partage l'espace,
  // aucune action retirée, un rang de moins.
  const secondary = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToggleFollow}
        title={t('actions.followHint')}
        aria-pressed={isFollowed}
        aria-label={isFollowed ? t('actions.unfollow') : t('actions.follow')}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-surface-hover)] ${
          column ? 'flex-1 justify-center' : ''
        }`}
        style={{ color: isFollowed ? 'var(--warning-soft-text)' : 'var(--text-secondary)' }}
      >
        <Briefcase className="h-[13px] w-[13px] shrink-0" />
        {!compact && (isFollowed ? t('actions.unfollow') : t('actions.follow'))}
      </button>

      <button
        type="button"
        onClick={onDismiss}
        title={t('actions.dismissHint')}
        aria-label={t('actions.dismiss')}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-surface-hover)] ${
          column ? 'flex-1 justify-center' : ''
        }`}
        style={{ color: 'var(--text-muted)' }}
      >
        <X className="h-[13px] w-[13px] shrink-0" />
        {!compact && t('actions.dismiss')}
      </button>
    </div>
  )

  if (column) {
    return (
      <div className="flex w-full flex-col gap-2">
        {analyze}
        {secondary}
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
      {secondary}
      {analyze}
    </div>
  )
}
