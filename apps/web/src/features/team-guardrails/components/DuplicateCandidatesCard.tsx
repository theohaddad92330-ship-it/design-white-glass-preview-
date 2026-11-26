import { Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useDuplicateCandidates, useProposeMerge } from '../hooks'
import { ContactAlertSlot } from '@/features/contacts/view/contact-detail/alerts/ContactAlertSlot'
import { recheckFrom } from '@/features/contacts/view/contact-detail/alerts/recheckFrom'
import { signatureOf } from '@/features/contacts/view/contact-detail/alerts/contactAlertMemory'

/**
 * #4158.24 — la carte « doublon probable » d'une fiche COMPTE ou CONTACT, quand
 * un collègue (ou l'espace) en a une qui lui ressemble : même domaine pour un
 * compte ; même e-mail, même profil du réseau professionnel, ou même nom et même
 * entreprise pour un contact.
 *
 * « Proposer la fusion » écrit une PAIRE à trancher dans Gouvernance — rien n'est
 * fusionné seul (doctrine). Rien du tout s'il n'y a pas de candidat.
 */
export function DuplicateCandidatesCard({ kind, id }: { kind: 'account' | 'contact'; id: string }) {
  const { t } = useTranslation('teamGuardrails')
  const { data, refetch } = useDuplicateCandidates(kind, id)
  const propose = useProposeMerge(kind, id)
  const items = data?.items ?? []
  if (items.length === 0) return null

  // #4596 — sur la fiche contact la carte vit dans le bandeau « Avant d'agir » (ignorer, revérifier) ; sur la
  // fiche compte (hors bandeau) l'enveloppe rend les enfants tels quels. Le geste, lui, ne change pas : on
  // PROPOSE la fusion (une paire à trancher dans Gouvernance), on ne fusionne jamais seul.
  return (
    <ContactAlertSlot
      id="duplicates"
      title={t('contacts:avantDagir.cards.duplicates')}
      signature={signatureOf(items.map(item => item.id).sort())}
      onRecheck={refetch ? () => recheckFrom(refetch) : undefined}
    >
      <section
        aria-label={t('duplicates.region')}
        className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
      >
        <Text element="h3" size="sm" weight="medium">
          {t('duplicates.title')}
        </Text>
        <ul className="mt-2 space-y-2">
          {items.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
              <Box className="min-w-0">
                <Text size="sm" weight="medium" className="truncate">
                  {item.label}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t(`duplicates.reason.${item.reason}`)}
                  {item.owner_name ? ` · ${t('duplicates.owner', { name: item.owner_name })}` : ''}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                title={t('duplicates.proposeTitle')}
                disabled={propose.isPending}
                onClick={() => propose.mutate(item.id)}
              >
                {t('duplicates.propose')}
              </Button>
            </li>
          ))}
        </ul>
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
          {t('duplicates.note')}
        </Text>
      </section>
    </ContactAlertSlot>
  )
}
