import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LauraFace } from '@bellum/ui'
import { BrandMark } from '@/features/brand/BrandMark'

type Props = {
  /** Texte d'appoint à droite de la marque dans la barre haute (masqué sur mobile). */
  subtitle?: string
  /** Commandes à droite de la barre haute (`.ob23-top-actions`). */
  topActions?: ReactNode
  /** Surtitre de l'en-tête de page (`.ob23-kicker`), en capitales par le style. */
  kicker?: string
  /** Pastille d'état teintée posée sur la ligne du surtitre (« En cours », « Lien invalide »…). */
  status?: ReactNode
  /** Le h1 de l'écran (`.ob23-heading h1`). Absent : l'écran porte son propre titre dans la carte. */
  title?: ReactNode
  /** La phrase sous le titre (`.ob23-heading p`). */
  lead?: ReactNode
  /** Bandeau d'information sous l'en-tête (`.ob23-info`). */
  notice?: ReactNode
  /** Colonne « Ce que tu retrouves » à droite de la carte (bureau) ou dessous (mobile). */
  aside?: ReactNode
  /** Largeur de la carte quand elle n'a pas de colonne : formulaire étroit ou page de lecture. */
  size?: 'form' | 'wide'
  children: ReactNode
}

/**
 * La coque des écrans d'accès, lue dans la maquette `onboarding-accueil` :
 *   barre haute 64 px (marque · sous-titre … commandes), sans fond ni filet ;
 *   un canevas `.ob23` de 1 140 px ;
 *   l'en-tête de page `.ob23-heading` (surtitre d'accent, h1, phrase) HORS de la carte ;
 *   le bandeau `.ob23-info` ;
 *   la carte `.ob23-welcome` (1,2 fr | 1 fr), sa colonne `.ob23-itinerary` sur le creux ;
 *   la ligne de Laura `.ob23-bottomline` (portrait, nom, phrase, filet bas).
 * Elle ne porte AUCUNE logique : la connexion, les jetons et les redirections
 * restent dans les pages qui l'habillent.
 */
export function AccessShell({
  subtitle,
  topActions,
  kicker,
  status,
  title,
  lead,
  notice,
  aside,
  size = 'form',
  children,
}: Props) {
  const { t } = useTranslation('auth')
  const cardWidth = aside ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]' : size === 'wide' ? '' : 'max-w-2xl'
  return (
    <div className="h-full overflow-y-auto bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)]">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 bg-[var(--bellum-bg)] px-4 md:px-8">
        <BrandMark />
        <span className="hidden text-xs text-[var(--bellum-text-muted)] lg:inline">
          {subtitle ?? t('shell.subtitle')}
        </span>
        {topActions ? <div className="ml-auto flex items-center gap-1">{topActions}</div> : null}
      </header>
      <main className="px-4 pb-10 pt-4 md:px-8 md:pt-6">
        <div className="mx-auto w-full max-w-6xl">
          {title ? (
            <div data-testid="access-heading" className="mb-6 mt-2 md:mb-7">
              {kicker || status ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  {kicker ? (
                    <span className="block text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
                      {kicker}
                    </span>
                  ) : null}
                  {status}
                </div>
              ) : null}
              <h1 tabIndex={-1} className="mt-3 text-3xl font-semibold tracking-tight focus:outline-none md:text-4xl">
                {title}
              </h1>
              {lead ? (
                <p className="mt-3 max-w-[78ch] text-sm leading-relaxed text-[var(--bellum-text-secondary)]">{lead}</p>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <div
              role="note"
              className="my-5 flex items-start gap-2.5 rounded-r-control border-l-2 border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)] px-4 py-3.5 text-xs text-[var(--bellum-text-secondary)]"
            >
              {notice}
            </div>
          ) : null}
          <div
            data-testid="access-card"
            className={`grid overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card ${cardWidth}`}
          >
            <section className="min-w-0 p-6 md:p-9">{children}</section>
            {aside}
          </div>
          <section
            data-testid="access-laura"
            className="mt-6 flex items-center gap-3 border-b border-[var(--bellum-border)] py-5"
          >
            <LauraFace size={40} decorative />
            <div>
              <strong className="block text-sm font-medium">{t('shell.lauraName')}</strong>
              <small className="mt-1 block text-xs leading-normal text-[var(--bellum-text-muted)]">
                {t('shell.lauraLine')}
              </small>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
