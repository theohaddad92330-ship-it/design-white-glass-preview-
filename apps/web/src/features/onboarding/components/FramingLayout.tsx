import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, cn, Text } from '@bellum/ui'
import { FramingTopBar } from '@/features/onboarding/components/FramingTopBar'

/**
 * Théo O (V23) — LA GRAMMAIRE COMMUNE des sept écrans d'onboarding : la barre
 * haute, une colonne de 1140 px, un en-tête « surtitre accent · titre ·
 * phrase », les étapes en onglets, et la barre d'actions collée en bas. Chaque
 * écran compose ces pièces ; aucun ne redessine la sienne.
 */
export function FramingPage({
  children,
  footer,
  onLater,
  laterBusy,
}: {
  children: ReactNode
  footer?: ReactNode
  onLater?: () => void
  laterBusy?: boolean
}) {
  return (
    // #4968.1 — `h-full` seul ne borne rien quand un ancêtre n'a pas de hauteur résolue : la zone ne défile alors jamais
    // et le bouton du bas (« Renseigner mon contexte ») sort du viewport au zoom 150-200 %. Le plafond en `dvh`
    // (moins la bannière d'emprunt d'identité, comme `#app-shell`) force le défilement dans tous les cas.
    <div className="flex h-full max-h-[calc(100dvh-var(--impersonation-banner-height,0px))] min-h-0 flex-col bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)]">
      <div id="framing-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <FramingTopBar onLater={onLater} laterBusy={laterBusy} />
        <div className="mx-auto w-full max-w-[71.25rem] px-4 pb-16 pt-6 md:px-6 lg:pt-10">{children}</div>
        {footer}
      </div>
    </div>
  )
}

/** `.ob23-heading` — surtitre en capitales accent, titre display, phrase de 70 caractères, une action à droite. */
export function FramingHeading({
  eyebrow,
  title,
  lead,
  action,
  className,
}: {
  eyebrow: ReactNode
  title: ReactNode
  lead?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <header
      data-testid="framing-heading"
      className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-3', className)}
    >
      <div className="min-w-0 space-y-3">
        <Text
          element="p"
          size="xs"
          weight="semibold"
          className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
        >
          {eyebrow}
        </Text>
        <Text element="h1" size="3xl" weight="semibold" className="tracking-tight md:text-4xl">
          {title}
        </Text>
        {lead && (
          <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)] md:text-base">
            {lead}
          </Text>
        )}
      </div>
      {action && <div className="shrink-0 md:pt-6">{action}</div>}
    </header>
  )
}

type FramingTab = { id: string; title: string; progress: string }

/**
 * `.ob23-steps` — les étapes en onglets numérotés sur toute la largeur :
 * numéro, titre, avancement ; l'onglet actif se souligne en accent. Au
 * mobile la rangée défile (jamais un retour à la ligne de huit onglets).
 */
export function FramingStepTabs({
  label,
  tabs,
  activeIndex,
  onSelect,
}: {
  label: string
  tabs: readonly FramingTab[]
  activeIndex: number | null
  onSelect: (index: number) => void
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ol
        className="grid min-w-max auto-cols-[minmax(7.5rem,1fr)] grid-flow-col border-b border-[var(--bellum-border)] md:min-w-0"
        data-testid="framing-step-tabs"
      >
        {tabs.map((tab, index) => {
          const active = index === activeIndex
          return (
            <li key={tab.id} className="min-w-0">
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(index)}
                className={cn(
                  '-mb-px flex min-h-11 w-full flex-col items-start gap-1 border-b-2 px-2 pb-3 pt-1 text-left text-sm duration-immediate ease-bellum-out',
                  active
                    ? 'border-[var(--bellum-primary)] text-[var(--bellum-text-primary)]'
                    : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
                )}
              >
                <span
                  className={cn(
                    'font-mono text-xs',
                    active ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={cn('truncate', active && 'font-medium')}>{tab.title}</span>
                <span className="text-xs text-[var(--bellum-text-muted)]">{tab.progress}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * La barre d'actions collée en bas de la colonne : « Retour » et une action
 * secondaire à gauche ; l'état d'enregistrement et l'action principale à droite.
 */
export function FramingFooterBar({
  onBack,
  secondary,
  saved,
  primary,
}: {
  onBack?: () => void
  secondary?: ReactNode
  saved?: ReactNode
  primary?: ReactNode
}) {
  const { t } = useTranslation('onboarding')
  return (
    <footer
      data-testid="framing-footer"
      className="sticky bottom-0 z-10 border-t border-[var(--bellum-border)] bg-[var(--bellum-bg)]"
    >
      <div className="mx-auto flex w-full max-w-[71.25rem] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-1">
          {onBack && (
            <Button type="button" variant="plain" onClick={onBack}>
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
              {t('guided.actions.back')}
            </Button>
          )}
          {secondary}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {saved && (
            <Text element="span" size="xs" role="status" className="text-[var(--bellum-text-muted)]">
              {saved}
            </Text>
          )}
          {primary}
        </div>
      </div>
    </footer>
  )
}
