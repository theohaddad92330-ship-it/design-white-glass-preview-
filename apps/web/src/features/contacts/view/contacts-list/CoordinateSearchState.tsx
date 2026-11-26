import { Button } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { coordinateDisplay, looksLikePhoneNumber } from '@bellum/contracts'
import { formatContactDate } from '@/features/contacts/lib/contactProvenance'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

export type CoordinateChannel = 'email' | 'phone'

type Props = {
  contact: GlobalContact
  channel: CoordinateChannel
  /** Le champ a déjà été cherché (une tentative d'enrichissement est datée) mais rien n'a été livré. */
  attemptedAt?: string | null
  onSearch: (channel: CoordinateChannel) => void
  disabled?: boolean
}

/**
 * Théo B c1-repertoire.N5 — « COORDONNÉES : DISPONIBILITÉ + ENRICHIR » (Louis 22/10).
 * Ce que la cellule dit d'un champ qu'on n'a PAS : la source annonce qu'il existe (« disponible »),
 * il n'a jamais été cherché (« Chercher »), ou la recherche est restée vide (« Introuvable · date »).
 * Le clic sur les deux premiers lance l'enrichissement CIBLÉ de ce champ. Ni coût, ni source nommés.
 */
export function CoordinateSearchState({ contact, channel, attemptedAt, onSearch, disabled }: Props) {
  const { t } = useTranslation('contacts')
  // #3821 — un texte dans la colonne téléphone n'est pas un numéro : il ne compte pas comme « connu ».
  const readable =
    channel === 'phone' && !looksLikePhoneNumber(contact.phone ?? '') ? { ...contact, phone: null } : contact
  const display = coordinateDisplay(readable, channel)
  const notFoundAt = display.kind === 'not_found' ? (display.at ?? attemptedAt ?? null) : null
  if (display.kind === 'not_found' || (display.kind === 'never_searched' && attemptedAt)) {
    const date = formatContactDate(notFoundAt ?? attemptedAt)
    return (
      <span data-testid={`contact-row-${channel}-not-found`} className="block leading-tight">
        {date ? t('coordinates.notFoundOn', { date }) : t('coordinates.notFound')}
      </span>
    )
  }
  if (display.kind === 'pending') {
    return <span className="block leading-tight">{t('coordinates.pending')}</span>
  }
  if (display.kind !== 'available' && display.kind !== 'never_searched') return null
  const label = t(display.kind === 'available' ? `coordinates.${channel}Available` : `coordinates.search_${channel}`)
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled}
      aria-label={label}
      className="relative z-10 h-auto min-h-0 px-1 py-0 text-xs pointer-coarse:min-h-11"
      onClick={e => {
        e.stopPropagation()
        onSearch(channel)
      }}
    >
      {label}
    </Button>
  )
}
