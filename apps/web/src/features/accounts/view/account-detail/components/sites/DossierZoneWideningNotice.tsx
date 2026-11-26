import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Box, Text } from '@bellum/ui'
import type { DossierZoneWidening } from './dossierZoneWidening'

/** #4432.9 — le dossier zoné s'est élargi SEUL (région, puis France) : l'écran le dit, sans poser de question. */
export function DossierZoneWideningNotice({ widening }: { widening: DossierZoneWidening | null }) {
  const { t } = useTranslation('accountSites')
  if (!widening) return null
  const zone = widening.requested.join(', ')
  const message =
    widening.tier === 'region' && widening.area
      ? t('zoneWidening.region', { zone, area: widening.area })
      : t('zoneWidening.france', { zone })
  return (
    <Box
      role="status"
      display="flex"
      rounded="lg"
      className="items-center gap-3 border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <MapPin className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
      <Text size="sm">{message}</Text>
    </Box>
  )
}

/** #4432.10 — le dossier dit de quels critères il est né (recherche Découvrir ou carte de Laura). */
export function DossierBornFromNotice({ lines }: { lines: string[] | null }) {
  const { t } = useTranslation('accountSites')
  if (!lines) return null
  return (
    <Box
      role="note"
      display="flex"
      rounded="lg"
      className="items-center gap-3 border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <MapPin className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
      <Text size="sm">{t('bornFrom', { criteria: lines.join(' · ') })}</Text>
    </Box>
  )
}
