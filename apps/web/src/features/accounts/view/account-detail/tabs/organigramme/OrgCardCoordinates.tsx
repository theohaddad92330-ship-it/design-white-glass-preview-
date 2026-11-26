import type { Contact, EnrichmentCoordinate } from '@bellum/contracts'
import { coordinateDisplay } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Mail, Phone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { formatDate } from '@/lib/locale'

type Channel = 'email' | 'phone'

const ICON_BUTTON =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]'

/**
 * Carte personne de l'organigramme (Louis 22/10) — LES COORDONNÉES EN UN COUP
 * D'ŒIL : une icône par champ. Connu → un clic montre la valeur EN CLAIR (jamais
 * masquée) ; annoncé disponible → « E-mail disponible » ; jamais cherché →
 * « Chercher l'e-mail » ; cherché sans résultat → « Introuvable · <date> ». Le clic
 * d'enrichissement passe par la confirmation de coût (GA-49) puis cherche CE champ.
 */
export function OrgCardCoordinates({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts', { keyPrefix: 'coordinates' })
  const [shown, setShown] = useState<Channel | null>(null)
  const [pending, setPending] = useState<EnrichmentCoordinate | null>(null)

  return (
    <div role="none" className="mt-1.5 flex flex-wrap items-center gap-1" onClick={event => event.stopPropagation()}>
      {(['email', 'phone'] as const).map(channel => {
        const display = coordinateDisplay(contact, channel)
        const Icon = channel === 'email' ? Mail : Phone
        const field = t(`field.${channel}`)
        if (display.kind === 'known') {
          return (
            <button
              key={channel}
              type="button"
              aria-label={t(`show.${channel}`)}
              aria-pressed={shown === channel}
              title={display.value}
              onClick={() => setShown(shown === channel ? null : channel)}
              className={`${ICON_BUTTON} text-[var(--success-soft-text)]`}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
          )
        }
        if (display.kind === 'not_found') {
          const date = display.at ? formatDate(display.at, { day: '2-digit', month: '2-digit' }) : null
          const label = date ? t('notFoundOn', { date, field }) : t('notFound', { field })
          return (
            <span
              key={channel}
              role="img"
              aria-label={`${channel === 'email' ? t('field.emailCap') : t('field.phoneCap')} ${label.toLowerCase()}`}
              title={label}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--bellum-text-muted)] opacity-50"
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
          )
        }
        if (display.kind === 'pending') {
          return (
            <span
              key={channel}
              role="status"
              title={t('pending', { field })}
              className="inline-flex min-h-11 min-w-11 items-center justify-center opacity-50"
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
          )
        }
        const label =
          display.kind === 'available'
            ? t(`available.${channel}`)
            : display.kind === 'error'
              ? t(`retry.${channel}`)
              : t(`search.${channel}`)
        return (
          <button
            key={channel}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => setPending(channel)}
            className={`${ICON_BUTTON} text-[var(--bellum-text-accent)]`}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        )
      })}
      {shown ? (
        <Text size="xs" className="min-w-0 break-all text-[var(--bellum-text-secondary)]">
          {shown === 'email' ? contact.email : contact.phone}
        </Text>
      ) : null}
      {pending ? <OrgEnrichGate contact={contact} only={pending} onClose={() => setPending(null)} /> : null}
    </div>
  )
}

/**
 * La porte d'annonce du coût + le débit, montées SEULEMENT au clic : une carte qui ne
 * lance jamais d'enrichissement ne porte aucun hook de mutation (GA-49 : l'annonce
 * précède le débit, dans le même module).
 */
function OrgEnrichGate({
  contact,
  only,
  onClose,
}: {
  contact: Contact
  only: EnrichmentCoordinate
  onClose: () => void
}) {
  const enrich = useEnrichContact()
  return (
    <EnrichConfirmDialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      count={1}
      onConfirm={() => {
        enrich.mutate({ contact, accountCompanyName: contact.entity ?? '', only })
        onClose()
      }}
    />
  )
}
