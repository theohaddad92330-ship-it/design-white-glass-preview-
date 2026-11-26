import type { Contact } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { ContactIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useApolloLabel } from '@/lib/apolloVocabulary'
import { deriveContactProfile } from '@/features/contacts/lib/contact-derived-profile'
import { SectionCard } from './SectionCard'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <Box className="space-y-1">
      <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="p" size="sm" leading="relaxed" color="text-foreground/90">
        {value}
      </Text>
    </Box>
  )
}

export function ContactRoleScope({
  contact,
  accountSector,
  bare = false,
}: {
  contact: Contact
  accountSector?: string | null
  /** #4585 — sans carte ni titre : le bloc « Rôle & périmètre » qui l'accueille porte déjà son titre (GA-26). */
  bare?: boolean
}) {
  const { t } = useTranslation('contacts')
  // `seniority` carries Apollo's closed vocabulary (`c_suite`, `vp`…) → same
  // dictionary as the Apollo profile card, so one value never reads translated
  // there and raw here. Anything else stays exactly as stored.
  const apollo = useApolloLabel()
  // #4016 L2 / #4036.D14 — séniorité et secteur déduits du titre et des sources déjà branchées ;
  // ce qui manque est NOMMÉ « non disponible », rien n'est acheté ni deviné.
  const profile = deriveContactProfile(contact, accountSector)
  const missing = t('roleScope.unavailable')
  const seniority = !profile.seniority.available
    ? missing
    : profile.seniority.value.kind === 'stored'
      ? apollo('seniority', profile.seniority.value.raw)
      : t('roleScope.fromTitle', { level: t(`hierarchy.${profile.seniority.value.level}`) })
  const sector = profile.sector.available ? t('roleScope.fromAccount', { sector: profile.sector.value }) : missing
  const fields = (
    <Box className="space-y-4">
      <Field label={t('roleScope.seniority')} value={seniority} />
      <Field label={t('roleScope.sector')} value={sector} />
      <Field label={t('roleScope.scope')} value={contact.scope} />
      <Field label={t('roleScope.budget')} value={contact.budget_authority} />
    </Box>
  )
  if (bare) return fields
  return (
    <SectionCard icon={ContactIcon} iconClassName="text-[var(--bellum-text-accent)]" title={t('roleScope.title')}>
      {fields}
    </SectionCard>
  )
}
