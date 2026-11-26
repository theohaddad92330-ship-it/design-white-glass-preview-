import type { Contact, EnrichmentCoordinate } from '@bellum/contracts'
import { contactEnrichActionIsPrimary, coordinateDisplay } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { Loader2, Mail, Phone, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmailWithBreaks } from '@/components/contacts/EmailWithBreaks'
import { formatDate } from '@/lib/locale'

/**
 * Théo A comptes-fiche — « COORDONNÉES : DISPONIBILITÉ + ENRICHIR » (Louis 22/10).
 *
 * LA cellule « Coordonnées » de toute liste de contacts (fiche compte ›
 * interlocuteurs, répertoire, chemin d'accès, Découvrir › personnes), par champ :
 *  - connu → EN CLAIR (jamais masqué) ;
 *  - absent mais la source annonce qu'il existe → « E-mail disponible » ;
 *  - absent, jamais cherché → « Chercher l'e-mail » ;
 *  - cherché sans résultat → « Introuvable · <date> ».
 * Le clic sur un état actionnable lance l'enrichissement CIBLÉ de ce champ
 * (`only`), sans remonter à la ligne qui ouvre la fiche. Aucun coût, aucune
 * source ne s'affiche (#4468, doctrine fournisseurs).
 */
type CoordinateChannel = 'email' | 'phone'

type CellProps = {
  contact: Contact
  /** Enrichissement ciblé d'UN champ ; l'appelant porte le hook et le compte. */
  onEnrich: (only: EnrichmentCoordinate) => void
  /** Un enrichissement de ce contact est en cours : les gestes se grisent. */
  busy?: boolean
}

const ACTION_CLASS = 'min-h-11 justify-start gap-1.5 px-1 text-xs'

export function ContactCoordinatesCell({ contact, onEnrich, busy = false }: CellProps) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 text-[var(--bellum-text-muted)]">
      <CoordinateLine contact={contact} channel="email" onEnrich={onEnrich} busy={busy} />
      <CoordinateLine contact={contact} channel="phone" onEnrich={onEnrich} busy={busy} />
    </div>
  )
}

function CoordinateLine({ contact, channel, onEnrich, busy }: CellProps & { channel: CoordinateChannel }) {
  const { t } = useTranslation('contacts')
  const display = coordinateDisplay(contact, channel)
  const Icon = channel === 'email' ? Mail : Phone

  if (display.kind === 'known') {
    return channel === 'email' ? (
      <a
        href={`mailto:${display.value}`}
        title={display.value}
        onClick={event => event.stopPropagation()}
        className="min-w-0 text-sm text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
      >
        <EmailWithBreaks email={display.value} />
      </a>
    ) : (
      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
        <a
          href={`tel:${display.value.replace(/[^+\d]/g, '')}`}
          onClick={event => event.stopPropagation()}
          className="min-w-0 text-sm text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
        >
          {display.value}
        </a>
        {/* Lot 760 — nature du numéro (même libellés que la fiche) ; inconnue ⇒ aucune étiquette, jamais « pro » déduit. */}
        {contact.phone_nature && contact.phone_nature !== 'unknown' ? (
          <span data-testid="phone-nature" className="text-xs text-[var(--bellum-text-muted)]">
            {t(`keyInfo.phoneNatures.${contact.phone_nature}`)}
          </span>
        ) : null}
      </span>
    )
  }

  if (display.kind === 'not_found') {
    const date = display.at ? formatDate(display.at, { day: '2-digit', month: '2-digit' }) : null
    return (
      <span className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {date
          ? t('coordinates.notFoundOn', { date, field: t(`coordinates.field.${channel}`) })
          : t('coordinates.notFound', { field: t(`coordinates.field.${channel}`) })}
      </span>
    )
  }

  if (display.kind === 'pending') {
    return (
      <span className="inline-flex min-h-11 items-center gap-1.5 px-1 text-xs" role="status">
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        {t('coordinates.pending', { field: t(`coordinates.field.${channel}`) })}
      </span>
    )
  }

  const label =
    display.kind === 'available'
      ? t(`coordinates.available.${channel}`)
      : display.kind === 'error'
        ? t(`coordinates.retry.${channel}`)
        : t(`coordinates.search.${channel}`)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      className={ACTION_CLASS}
      onClick={event => {
        event.stopPropagation()
        onEnrich(channel)
      }}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Button>
  )
}

/**
 * Ni e-mail ni téléphone : le bouton de ligne « Contacter » devient « Enrichir »
 * (enrichissement ciblé du contact — les deux champs). Avec une coordonnée, ne
 * rend rien : le geste reste « Contacter ».
 */
export function ContactEnrichAction({
  contact,
  onEnrich,
  busy = false,
}: {
  contact: Contact
  onEnrich: (only: EnrichmentCoordinate | undefined) => void
  busy?: boolean
}) {
  const { t } = useTranslation('contacts')
  if (!contactEnrichActionIsPrimary(contact)) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      className="min-h-11 gap-1.5"
      onClick={event => {
        event.stopPropagation()
        onEnrich(undefined)
      }}
    >
      <Sparkles className="size-3.5" aria-hidden />
      {t('coordinates.enrich')}
    </Button>
  )
}
