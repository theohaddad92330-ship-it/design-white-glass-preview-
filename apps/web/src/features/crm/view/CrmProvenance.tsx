import { crmProvenanceCounts, type Contact } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { Database, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountCrmProvenance } from '../hooks/useAccountCrmProvenance'

/**
 * #4459.2 — « Déjà dans ton CRM » / « Apporté par Bellum » sur UN contact (onglet Personnes, organigramme).
 * Le LIBELLÉ porte le sens ; l'icône l'accompagne. Aucune provenance → rien (jamais une mention devinée).
 */
export function ContactCrmOriginBadge({ contact }: { contact: Pick<Contact, 'id'> }) {
  const { t } = useTranslation('crm')
  const provenance = useAccountCrmProvenance()
  const origin = provenance?.contacts.find(entry => entry.contactId === contact.id)?.origin
  if (!origin) return null
  const Icon = origin === 'crm' ? Database : Sparkles
  return (
    <Badge
      variant={origin === 'crm' ? 'outline' : 'info'}
      data-crm-origin={origin}
      title={t(origin === 'crm' ? 'provenance.inCrmHint' : 'provenance.broughtHint')}
      className="shrink-0 gap-1"
    >
      <Icon className="size-3" aria-hidden />
      {t(origin === 'crm' ? 'provenance.inCrm' : 'provenance.brought')}
    </Badge>
  )
}

/**
 * #4459.2 — en tête de synthèse : « N dans ton CRM · M trouvés par l'analyse ». Une part absente n'est pas
 * écrite (jamais « 0 », GA-18/19) ; les deux absentes, pas de ligne du tout.
 */
export function CrmProvenanceSummary() {
  const { t } = useTranslation('crm')
  const provenance = useAccountCrmProvenance()
  if (!provenance) return null
  const { inCrm, brought } = crmProvenanceCounts(provenance.contacts)
  const parts = [
    inCrm !== null ? t('provenance.summaryInCrm', { count: inCrm }) : null,
    brought !== null ? t('provenance.summaryBrought', { count: brought }) : null,
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return null
  return (
    <Text
      element="p"
      size="sm"
      data-testid="crm-provenance-summary"
      aria-label={t('provenance.summaryAria')}
      className="text-[var(--bellum-text-secondary)]"
    >
      {parts.join(' · ')}
    </Text>
  )
}
