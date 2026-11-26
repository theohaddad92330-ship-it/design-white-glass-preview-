import type { Contact } from '@bellum/contracts'
import { Button, EntityAvatar, Text } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'

type BestContactCardProps = {
  accountId: string
  contacts: Contact[]
  companyName: string
  onViewContacts: () => void
}

/**
 * #2730 — retour Loïc Inacio (Bedrock, 22/09/2026) : « qui dois-je contacter
 * ici ? » ne trouvait pas de réponse pendant le call, alors que le chemin
 * d'accès recommandé EXISTE (`PriorityPathSection`, onglet Contacts,
 * `GET /contacts/account/:id/ranking`). Cette carte, montée dans la Synthèse
 * sous « Avec qui commencer ? », en est l'entrée SANS onglet à connaître —
 * mais elle piochait `contacts[0]` (l'ordre d'arrivée, pas un classement) et
 * ne disait ni le rang ni la raison. Elle lit maintenant le MÊME classement
 * que l'onglet Contacts, et son geste nomme explicitement le « chemin d'accès
 * recommandé » pour que le commercial le RECONNAISSE en arrivant là-bas.
 */
export function BestContactCard({ accountId, contacts, companyName, onViewContacts }: BestContactCardProps) {
  const { t } = useTranslation('accountDetail')
  const { t: tOrg } = useTranslation('accountOrg')
  const ranking = useContactRanking(accountId, {})

  const rankedList = Array.isArray(ranking.data?.ranked) ? ranking.data.ranked : null
  const top = rankedList && rankedList.length > 0 ? rankedList[0] : null

  const contactsById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts])
  // Classement indisponible (API en panne ou trop ancienne) : on retombe sur
  // le premier contact du dossier, SANS ordre ni raison inventés — même
  // discipline que `PriorityPathSection.rankingUnavailable`.
  const contact = (top ? contactsById.get(top.contact_id) : null) ?? contacts[0] ?? null

  const whyReason =
    top && top.explanation.who.measured ? tOrg(`priorityPath.explanation.codes.${top.explanation.who.code}`) : null

  return (
    <section className="flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center gap-2 text-[var(--bellum-text-muted)]">
        <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('bestContact.title')}
        </Text>
      </div>

      {top && ranking.data ? (
        <Text size="xs" element="p" className="mb-4 text-[var(--bellum-text-muted)]">
          {t('bestContact.rank', { position: top.position, total: ranking.data.total })}
        </Text>
      ) : (
        <div className="mb-6" />
      )}

      {contact ? (
        <div className="flex min-w-0 items-start gap-4">
          <ContactAvatar name={contact.full_name} photoUrl={contact.photo_url} size="lg" />
          <div className="min-w-0 pt-1">
            <div className="flex items-center gap-2">
              <Text element="p" size="base" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
                {contact.full_name}
              </Text>

              <RoleBadge role={contact.decision_role || '-'} />
            </div>
            {contact.title ? (
              <Text element="p" size="sm" className="mt-1 line-clamp-2 text-[var(--bellum-text-secondary)]">
                {contact.title}
              </Text>
            ) : null}
            {whyReason ? (
              <Text element="p" size="xs" className="mt-1 line-clamp-2 text-[var(--bellum-text-secondary)]">
                {t('bestContact.why', { reason: whyReason })}
              </Text>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="max-w-sm space-y-2">
          <Text element="p" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('bestContact.emptyTitle')}
          </Text>
          <Text element="p" size="sm" className="line-clamp-3 text-[var(--bellum-text-secondary)]">
            {t('bestContact.emptyDescription', { companyName })}
          </Text>
        </div>
      )}
      <div className="mt-auto flex w-full items-center justify-start">
        <Button
          type="button"
          onClick={onViewContacts}
          icon={ArrowRight}
          iconPosition="right"
          variant="ghost"
          size="sm"
          className="mt-auto w-fit px-0"
        >
          {t('bestContact.cta')}
        </Button>
      </div>
    </section>
  )
}
