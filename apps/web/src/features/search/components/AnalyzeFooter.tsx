import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LauraFace,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
} from '@bellum/ui'
import { ArrowRight, ChevronRight, History, Info, type LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { AccentField, ACCENT_INPUT, CompanyLogo, StepTitle } from './AnalyzeChrome'

/**
 * Le pied de l'écran : Laura dit ce qu'on est en train de faire, un « i » dit ce qui est inclus (aucun
 * chiffre, aucun crédit — un solde épuisé se dit par `SoftBrake`, ailleurs), et l'unique bouton
 * principal. Rien n'est collecté ni débité à ce clic : la vérification vient ensuite.
 */
export function AnalyzeFooter({
  onPrepare,
  disabled,
  note,
}: {
  onPrepare: () => void
  disabled: boolean
  /** Une phrase sous la consigne de Laura : le frein doux quand le solde est épuisé. */
  note?: ReactNode
}) {
  const { t } = useTranslation('search')
  return (
    // `.an21-footer` : le pied DE la carte de travail — bordure haute, Laura à gauche, le bouton à droite.
    <footer
      data-analyze-section="footer"
      className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-[var(--bellum-border)] px-4 py-2.5 md:px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <LauraFace decorative size={30} className="shrink-0" />
        <div className="min-w-0 text-xs">
          <strong className="block font-semibold text-[var(--bellum-text-primary)]">
            {t('analyze.footer.helper')}
          </strong>
          {note}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('analyze.footer.includedAria')}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] md:size-8"
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 text-sm">
            <h3 className="font-semibold text-[var(--bellum-text-primary)]">{t('analyze.footer.includedTitle')}</h3>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[var(--bellum-text-secondary)]">
              <li>{t('analyze.footer.includedRegistry')}</li>
              <li>{t('analyze.footer.includedWorkspace')}</li>
              <li>{t('analyze.footer.includedMarket')}</li>
            </ul>
            <p className="mt-2 text-xs text-[var(--bellum-text-muted)]">{t('analyze.footer.includedNote')}</p>
          </PopoverContent>
        </Popover>
      </div>
      <Button
        {...guideAnchorProps('analyse.preparer')}
        type="button"
        variant="violet"
        onClick={onPrepare}
        disabled={disabled}
        className="min-h-11 w-full gap-2 md:w-auto"
      >
        {t('composer.prepareAnalysisCta')}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </footer>
  )
}

/** Les volets « Un contact » et « Un besoin » : ils renvoient vers l'écran qui vérifie, sans le dupliquer. */
export function HandOffPane({
  title,
  description,
  placeholder,
  value,
  onValueChange,
  multiline = false,
  cta,
  onSubmit,
  icon,
}: {
  /** Le symbole du champ (une personne, un besoin). */
  icon: LucideIcon
  title: string
  description: string
  placeholder: string
  value: string
  onValueChange: (next: string) => void
  multiline?: boolean
  cta: string
  /** Ouvre l'écran qui vérifie, avec la saisie en amorce. */
  onSubmit: () => void
}) {
  // `.mode-pane` de la maquette : une carte, l'étape 1 et sa question, une phrase, le champ teinté d'accent, puis le pied.
  return (
    <section
      data-analyze-section="handoff"
      aria-label={title}
      className="flex flex-col gap-3 rounded-2xl border border-[var(--bellum-border)] bg-card px-4 py-5 md:px-7 md:py-6"
    >
      <StepTitle step={1} title={title} accent />
      <Text element="p" size="sm" className="-mt-1 text-[var(--bellum-text-secondary)]">
        {description}
      </Text>
      <AccentField icon={icon}>
        {multiline ? (
          <textarea
            rows={3}
            value={value}
            onChange={event => onValueChange(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className={`${ACCENT_INPUT} resize-y py-3`}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={event => onValueChange(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className={`${ACCENT_INPUT} h-14`}
          />
        )}
      </AccentField>
      <div className="flex flex-wrap items-center justify-end gap-3 pt-1.5">
        <Button
          type="button"
          variant="violet"
          disabled={value.trim().length === 0}
          onClick={onSubmit}
          className="min-h-11 w-full gap-2 md:w-auto"
        >
          {cta}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}

/** « Récemment » — les derniers dossiers de l'espace, pour reprendre un cadrage en un clic. */
export function RecentStrip({
  items,
  onOpenItem,
}: {
  items: readonly { id: string; name: string; logo: string | null | undefined; detail: string }[]
  onOpenItem: (id: string) => void
}) {
  const { t } = useTranslation('search')
  const [helpOpen, setHelpOpen] = useState(false)
  const quiet =
    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs text-[var(--bellum-text-secondary)] transition-colors duration-immediate hover:text-[var(--bellum-text-accent)]'
  // `.an21-bottom` : « Récemment » et ses dossiers à gauche, « Tout voir » et « Ce que tu retrouveras » à droite.
  return (
    <div data-analyze-section="recent" className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-1">
      {items.length > 0 ? (
        // La région porte le nom qu'elle AFFICHE (« Récemment ») : un lecteur d'écran entend ce que l'œil lit.
        <section aria-label={t('analyze.recent.label')} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)]">
            <History className="size-3.5" aria-hidden="true" />
            {t('analyze.recent.label')}
          </span>
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenItem(item.id)}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-card px-2.5 text-left text-xs transition-colors duration-immediate hover:border-[var(--bellum-accent-line)] hover:bg-[var(--bellum-accent-bg)] md:min-h-10"
            >
              <CompanyLogo name={item.name} src={item.logo} className="size-6 text-xs" />
              <strong className="max-w-48 truncate font-medium text-[var(--bellum-text-primary)]">{item.name}</strong>
              {item.detail ? (
                <span className="hidden truncate text-[var(--bellum-text-secondary)] lg:inline">{item.detail}</span>
              ) : null}
              <ChevronRight className="size-3 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            </button>
          ))}
        </section>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        {items.length > 0 ? (
          <Link to="/search" search={{ vue: 'historique' }} className={quiet}>
            <ChevronRight className="size-3.5" aria-hidden="true" />
            {t('analyze.recent.seeAll')}
          </Link>
        ) : null}
        <button type="button" onClick={() => setHelpOpen(true)} className={quiet}>
          <Info className="size-3.5" aria-hidden="true" />
          {t('analyze.help.open')}
        </button>
      </div>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg" closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('analyze.help.title')}</DialogTitle>
            {/* La description ne répète pas le titre (deux fois le même texte pour un lecteur d'écran). */}
            <DialogDescription className="sr-only">{t('analyze.footer.includedNote')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            {(['one', 'two', 'three'] as const).map(step => (
              <div key={step}>
                <h3 className="font-semibold text-[var(--bellum-text-primary)]">{t(`analyze.help.${step}Title`)}</h3>
                <p className="text-[var(--bellum-text-secondary)]">{t(`analyze.help.${step}Body`)}</p>
              </div>
            ))}
            {/* Théo B r1-recherche.A2/N5 (PR11, rebranché) — ce qui est déjà inclus, sans crédit ni chiffre (#4468). */}
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold text-[var(--bellum-text-primary)]">{t('launch.cost.includedTitle')}</h3>
              <ul className="list-disc space-y-0.5 pl-4 text-[var(--bellum-text-secondary)]">
                <li>{t('launch.cost.includedRegistry')}</li>
                <li>{t('launch.cost.includedExistingData')}</li>
                <li>{t('launch.cost.includedMarketMemory')}</li>
              </ul>
              <p className="text-xs text-[var(--bellum-text-muted)]">{t('launch.cost.refundPolicy')}</p>
            </section>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setHelpOpen(false)}>
              {t('analyze.help.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
