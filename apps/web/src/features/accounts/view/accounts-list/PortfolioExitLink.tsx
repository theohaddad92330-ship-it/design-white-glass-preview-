import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * La sortie d'une vue RESTREINTE de `/accounts` (GA-107).
 *
 * #4127 — le bandeau « État du portefeuille » est supprimé (Louis 13/10 ;
 * revient délibérément sur #4087.1, bandeau compacté). Le lien « Voir tout le
 * portefeuille » qu'il portait vit désormais ici, près des filtres.
 *
 * Rendu SEULEMENT sous restriction : ramener là où l'on est déjà apprend à ne
 * plus cliquer.
 */
export function PortfolioExitLink({ narrowed }: { narrowed: boolean }) {
  const { t } = useTranslation('accounts')
  if (!narrowed) return null
  return (
    <Link
      to="/accounts"
      /* `search: {}` : « ce lien abandonne TOUT ce qui restreint » est ce que le
         lien promet. Ce qui est gardé est le RÉSULTAT — GA-107 lit le `href`. */
      search={{}}
      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
    >
      {t('counters.backToPortfolio')}
      <ArrowRight className="size-3 shrink-0" aria-hidden />
    </Link>
  )
}
