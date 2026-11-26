import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { cn, EntityAvatar } from '@bellum/ui'
import { Building2, Check, Compass, History, Layers, Target, UserRound, type LucideIcon } from 'lucide-react'
import { ScreenGuideLink } from '@/components/shell/ScreenGuideLink'

/**
 * Refonte Théo R1 — les petites pièces partagées de l'écran « Analyser un compte » :
 * les onglets de ce qu'on analyse, le titre numéroté d'une étape, le logo
 * d'entreprise. Aucune donnée ici : tout vient de l'appelant.
 */

/** Le logo d'une entreprise : son image si on la connaît, sinon ses initiales teintées. Décoratif : le nom est toujours écrit à côté. */
export function CompanyLogo({
  name,
  src,
  className,
}: {
  name: string
  src?: string | null | undefined
  className?: string
}) {
  return (
    <EntityAvatar
      name={name}
      src={src ?? undefined}
      shape="square"
      size="sm"
      aria-hidden="true"
      className={className}
    />
  )
}

/** Le titre d'une étape : pastille numérotée (une coche quand l'étape est faite), intitulé, et un mot d'aide à droite. */
export function StepTitle({
  step,
  title,
  hint,
  id,
  complete = false,
  accent = false,
}: {
  step: number
  title: string
  hint?: string
  id?: string
  complete?: boolean
  /** L'étape en cours de la maquette (l'entreprise) : pastille teintée d'accent. */
  accent?: boolean
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2
        id={id}
        className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-[var(--bellum-text-primary)]"
      >
        <span
          aria-hidden="true"
          data-step={step}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
            accent || complete
              ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'
              : 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
          )}
        >
          {complete ? <Check className="size-3.5" aria-hidden="true" /> : step}
        </span>
        {title}
      </h2>
      {hint ? <span className="text-xs text-[var(--bellum-text-secondary)]">{hint}</span> : null}
    </div>
  )
}

/**
 * #4512 — le titre d'un champ de cadrage : un seul par notion, en casse normale (jamais un sous-titre en capitales
 * qui répète le titre au-dessus).
 */
export const FIELD_TITLE = 'text-xs font-semibold text-[var(--bellum-text-primary)]'

/** Un lien d'en-tête bordé, icône devant (« Chercher des comptes », « Mes analyses », « Revenir à mon cadrage »). */
export const HEADER_LINK =
  'inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-card px-3 text-xs font-medium text-[var(--bellum-text-secondary)] transition-colors duration-immediate hover:text-[var(--bellum-text-accent)] md:min-h-9'

/**
 * L'en-tête des deux vues d'« Analyser » (`.an21-header` de la maquette) : le titre et sa phrase à
 * gauche, les actions en haut à droite, « Comment travailler ici ? » sous elles. Il vit dans le corps
 * (la route pose `skipHeader`) : l'en-tête de la coque n'affiche pas de titre visible dès qu'un fil
 * est déclaré, et le titre de cette page est une QUESTION, distincte de son fil.
 */
export function AnalyzeHeader({
  title,
  subtitle,
  actions,
  guideBelowActions = true,
}: {
  title: string
  subtitle: string
  actions: ReactNode
  /** R1 : le guide sous les actions, à droite ; R2 : au-dessus du titre, à gauche. */
  guideBelowActions?: boolean
}) {
  return (
    <header
      data-analyze-section="header"
      className="mb-3 grid grid-cols-1 gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      {guideBelowActions ? null : (
        <div className="md:col-span-2">
          <ScreenGuideLink />
        </div>
      )}
      <div className="min-w-0 md:row-span-2">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)] md:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--bellum-text-secondary)]">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:justify-self-end">{actions}</div>
      {guideBelowActions ? (
        <div className="md:justify-self-end">
          <ScreenGuideLink />
        </div>
      ) : null}
    </header>
  )
}

/** Les deux actions d'en-tête d'« Analyser un compte » : Découvrir, et l'historique. */
export function AnalyzeHeaderActions() {
  const { t } = useTranslation('search')
  return (
    <>
      <Link to="/discover" className={HEADER_LINK}>
        <Compass className="size-4" aria-hidden="true" />
        {t('analyze.searchAccounts')}
      </Link>
      <Link to="/search" search={{ vue: 'historique' }} className={HEADER_LINK}>
        <History className="size-4" aria-hidden="true" />
        {t('analyze.myAnalyses')}
      </Link>
    </>
  )
}

/** Un bouton-lien discret (« Changer », « Voir le détail », « Mes analyses »). */
export function QuietButton({
  children,
  onClick,
  className,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--bellum-text-accent)] transition-colors hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11',
        className,
      )}
    >
      {children}
    </button>
  )
}

export type AnalyzeMode = 'company' | 'contact' | 'need'

/**
 * Ce qu'on analyse : une entreprise, un contact, un besoin. « Plusieurs entreprises » (le lot,
 * Théo A comptes-import.A1) garde sa place ici — c'est un lien vers l'analyse en lot de Découvrir,
 * pas un onglet : il n'a pas de contenu sur cet écran.
 */
export function AnalyzeModeTabs({
  mode,
  onModeChange,
  onMany,
}: {
  mode: AnalyzeMode
  onModeChange: (next: AnalyzeMode) => void
  onMany: () => void
}) {
  const { t } = useTranslation('search')
  const tabs: readonly { key: AnalyzeMode; label: string; icon: LucideIcon }[] = [
    { key: 'company', label: t('analyze.modes.company'), icon: Building2 },
    { key: 'contact', label: t('analyze.modes.contact'), icon: UserRound },
    { key: 'need', label: t('analyze.modes.need'), icon: Target },
  ]
  // #4542 — `shrink-0` : `overflow-x-auto` ramène la hauteur minimale auto à 0, la carte de progression
  // (`flex-1`, sœur dans `Search.tsx`) écrasait la rangée sans lui. #4598 renverse ce choix à la racine :
  // `Search.tsx` ne rend plus la rangée pendant une analyse, le conflit de place n'a plus lieu d'être.
  // `.modes` de la maquette : un rail bordé, chaque onglet icône + mot, l'actif teinté d'accent.
  const base =
    'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control px-3.5 text-sm font-semibold transition-colors duration-immediate text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] md:min-h-10'
  return (
    <div
      role="tablist"
      aria-label={t('analyze.modes.label')}
      data-analyze-section="modes"
      className="mb-3.5 mt-1.5 flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-[var(--bellum-border)] bg-card p-1 md:w-fit md:self-start"
    >
      {tabs.map(tab => {
        const active = tab.key === mode
        const Icon = tab.icon
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onModeChange(tab.key)}
            className={cn(
              base,
              'flex-1 justify-center md:flex-none',
              active &&
                'bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] hover:text-[var(--bellum-text-accent)]',
            )}
          >
            <Icon className="hidden size-4 md:block" aria-hidden="true" />
            {tab.label}
          </button>
        )
      })}
      <button type="button" onClick={onMany} className={cn(base, 'flex-1 justify-center md:flex-none')}>
        <Layers className="hidden size-4 md:block" aria-hidden="true" />
        {t('analyze.modes.many')}
      </button>
    </div>
  )
}

/** Le champ principal d'une étape (`.an21-searchbar`) : teinté d'accent, symbole carré en aplat, saisie en gros. */
export function AccentField({
  icon: Icon,
  children,
  trailing,
}: {
  icon: LucideIcon
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div
      data-analyze-field="accent"
      className="flex min-h-14 items-center gap-2.5 rounded-xl border-[1.5px] border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] pl-3 pr-2.5 transition-colors duration-immediate focus-within:border-[var(--bellum-text-accent)] focus-within:ring-[3px] focus-within:ring-[var(--bellum-accent-bg)] md:gap-3 md:pr-3.5"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-primary)] text-[var(--bellum-on-primary)]"
      >
        <Icon className="size-4" />
      </span>
      {children}
      {trailing}
    </div>
  )
}

/** La saisie d'un `AccentField` : sans bordure, sur le fond teinté. */
export const ACCENT_INPUT =
  'min-w-0 flex-1 bg-transparent text-base font-medium tracking-tight text-[var(--bellum-text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--bellum-text-secondary)] md:text-lg'
