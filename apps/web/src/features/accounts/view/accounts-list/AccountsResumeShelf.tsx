import { Link } from '@tanstack/react-router'
import { Text, cn } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { AccountPortfolioCard } from './AccountPortfolioCard'
import type { AccountRow } from './types'

const SHELF_SIZE = 3

/**
 * Les comptes à reprendre : ceux que le SERVEUR désigne (`to_resume`, le prédicat exact qui compte « À reprendre »
 * dans la bande — une définition, #4584), les favoris d'abord, dans l'ordre où la liste les sert. Une action écrite au
 * plan ne suffit plus : bande et étagère ne peuvent plus se contredire. Un compte non désigné ne fait pas de carte
 * (une absence ne fait aucune ligne) ; `[]` quand rien n'est à reprendre — l'étagère entière se tait alors.
 */
export function accountsToResume(rows: readonly AccountRow[]): AccountRow[] {
  const toResume = rows.filter(row => row.to_resume === true)
  return [
    ...toResume.filter(row => row.is_favorite === true),
    ...toResume.filter(row => row.is_favorite !== true),
  ].slice(0, SHELF_SIZE)
}

/**
 * Refonte Théo (comptes-liste) — « REPRENDRE LE FIL » : trois cartes de comptes qui méritent l'attention,
 * entre les chiffres et le tableau.
 *
 * Tout vient de la ligne de liste, rien n'est inventé : le sujet est le signal dominant du compte (son
 * libellé réel), la ligne du bas est la première action de son plan. Aucune phrase rédigée n'est
 * fabriquée ici — Laura garde la sienne dans la fiche. « Prioriser avec Laura » (ex-lien d'entête) et
 * « Voir les actions » vivent dans l'en-tête de l'étagère.
 */
export function AccountsResumeShelf({ rows }: { rows: readonly AccountRow[] }) {
  const { t } = useTranslation('accounts')
  const cards = accountsToResume(rows)
  if (cards.length === 0) return null
  return (
    <section
      aria-labelledby="accounts-resume-title"
      className={cn('pt-8', PAGE_GUTTER_X)}
      data-testid="accounts-resume"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="accounts-resume-title"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--bellum-text-primary)]"
          >
            {t('resume.title')}
            {/* Le point vivant de Théo : cette étagère se recalcule à chaque lecture du portefeuille. */}
            <span aria-hidden className="size-2 rounded-full bg-[var(--success-soft-text)]" />
          </h2>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('resume.subtitle')}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AskLaura label={t('page.askLauraLabel')} question={t('page.askLauraQuestion')} />
          <Link
            to="/actions"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('resume.seeActions')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
      {/* Mobile : un rail qui défile au doigt, carte à 88 % (Théo `.a4-shelf-grid` ≤ 768 px). */}
      <ul className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 [&>li]:shrink-0 [&>li]:basis-[88%] [&>li]:snap-start md:[&>li]:basis-auto">
        {cards.map((row, index) => (
          <AccountPortfolioCard key={row.id} row={row} focus={index === 0} />
        ))}
      </ul>
    </section>
  )
}
