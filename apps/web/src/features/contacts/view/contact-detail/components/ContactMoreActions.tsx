import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { CalendarPlus, EyeOff, Link2, Linkedin, MoreHorizontal, StickyNote, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ContactEnrichState } from './ContactEnrichButton'

/** Chaque item : cible ≥ 44 px, libellé sur UNE ligne (tronqué, jamais coupé en deux). */
const ITEM = 'min-h-11 gap-2 whitespace-nowrap'

type ContactMoreActionsProps = {
  contactName: string
  /** Absent ⇒ pas d'item (la zone de notes n'est pas montée). */
  onOpenNotes?: () => void
  /** Absent ⇒ pas d'item : un contact à qualifier n'a pas de plan d'action (#1473). */
  onAddToPlan?: () => void
  planPending: boolean
  /** Absent ⇒ pas d'item : jamais un lien mort (#1100). */
  linkedinHref: string | null | undefined
  /** #4504.2 — « Copier le lien » de la fiche (quitte l'en-tête de page). Absent ⇒ pas d'item. */
  onCopyLink?: () => void
  onHide: () => void
  hidePending: boolean
  /** Absent ⇒ pas d'item (aucun canal manquant, ou « Enrichir » est déjà le bouton principal). */
  enrich?: ContactEnrichState
  /** Date de la dernière tentative restée vide : l'item devient « réessayer quand même ». */
  enrichCooldownLabel?: string
  onRetryEnrich?: () => void
  retryDisabled?: boolean
  retryLabel?: string
}

/**
 * #4331.2 (Louis 20/10/2026, QCM « 1 bouton principal + … ») — UN menu « Autres
 * actions » qui REGROUPE ce que la pile de boutons de l'en-tête portait : notes,
 * plan d'action, enrichir (ou le réessai sous cooldown), LinkedIn, masquer.
 * Aucune action ne disparaît ; une action sans objet (pas d'URL LinkedIn, pas de
 * compte) n'a pas d'item, comme elle n'avait pas de bouton.
 *
 * #4331.3 — le menu se retourne au bord de l'écran (Radix `collisionPadding`),
 * sa largeur est bornée à la fenêtre, et chaque libellé tient sur une ligne.
 */
export function ContactMoreActions({
  contactName,
  onOpenNotes,
  onAddToPlan,
  planPending,
  linkedinHref,
  onCopyLink,
  onHide,
  hidePending,
  enrich,
  enrichCooldownLabel,
  onRetryEnrich,
  retryDisabled,
  retryLabel,
}: ContactMoreActionsProps) {
  const { t } = useTranslation('contacts')
  const needsSeparator = Boolean(onOpenNotes || onAddToPlan || enrich || onRetryEnrich || linkedinHref || onCopyLink)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11 shrink-0 px-0"
          aria-label={t('header.moreActions')}
          title={t('header.moreActions')}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="w-64 max-w-[calc(100vw-1rem)]">
        {onOpenNotes ? (
          // #3640 / #3688 — mène à l'éditeur de notes de la zone de travail : une
          // seule saisie, jamais un second panneau de notes (GA-26).
          <DropdownMenuItem className={ITEM} onSelect={onOpenNotes}>
            <StickyNote className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            <span className="truncate">{t('header.notes')}</span>
          </DropdownMenuItem>
        ) : null}
        {onAddToPlan ? (
          <DropdownMenuItem className={ITEM} disabled={planPending} onSelect={onAddToPlan}>
            <CalendarPlus className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            <span className="truncate">{planPending ? t('header.addingLoading') : t('header.actionPlan')}</span>
          </DropdownMenuItem>
        ) : null}
        {enrich ? (
          // Même état, même prix, même porte de confirmation que le bouton plein
          // (`useContactEnrich`) : le clic OUVRE la confirmation, il ne débite pas.
          <DropdownMenuItem
            className={ITEM}
            disabled={enrich.disabled || enrich.enriching}
            title={enrich.hint}
            onSelect={enrich.enrich}
          >
            <Zap className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            <span className="truncate">
              {enrich.enriching ? t('enrich.loading') : enrich.buttonLabel(t('header.complete'))}
            </span>
          </DropdownMenuItem>
        ) : null}
        {onRetryEnrich ? (
          <>
            {enrichCooldownLabel ? (
              <DropdownMenuLabel className="text-xs font-normal text-[var(--bellum-text-secondary)]">
                {enrichCooldownLabel}
              </DropdownMenuLabel>
            ) : null}
            <DropdownMenuItem className={ITEM} disabled={retryDisabled} onSelect={onRetryEnrich}>
              <Zap className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
              <span className="truncate">{retryLabel}</span>
            </DropdownMenuItem>
          </>
        ) : null}
        {linkedinHref ? (
          <DropdownMenuItem className={ITEM} asChild>
            <a href={linkedinHref} target="_blank" rel="noopener noreferrer">
              <Linkedin className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
              <span className="truncate">{t('header.linkedin')}</span>
            </a>
          </DropdownMenuItem>
        ) : null}
        {onCopyLink ? (
          <DropdownMenuItem className={ITEM} onSelect={onCopyLink}>
            <Link2 className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
            <span className="truncate">{t('header.copyLink')}</span>
          </DropdownMenuItem>
        ) : null}
        {needsSeparator ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          className={ITEM}
          disabled={hidePending}
          aria-label={t('header.hideAria', { name: contactName })}
          onSelect={onHide}
        >
          <EyeOff className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
          <span className="truncate">{hidePending ? t('header.hidingLoading') : t('header.hide')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
