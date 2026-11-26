import type { OutreachEligibilityResponse } from '@bellum/contracts'
import { Box, Checkbox, Text } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { excludedRows, isHardBlocked } from '../enrollment-exclusions'

/**
 * Lot L-B (#4165) — LES EXCLUSIONS À L'INSCRIPTION, NOMMÉES CONTACT PAR CONTACT.
 *
 * Le serveur les vérifie (`POST /outreach/sequences/eligibility`, puis encore à
 * la création) ; cet écran les NOMME : « Marie Dubois — contactée il y a moins
 * de 30 jours », jamais « 2 exclus ». L'utilisateur peut les lever d'un geste
 * explicite — sauf l'opposition RGPD, qui ne se lève jamais : ce contact est
 * retiré de l'inscription et l'écran le dit.
 */

export function EnrollmentExclusions({
  eligibility,
  overridden,
  onOverrideChange,
  t,
}: {
  eligibility: OutreachEligibilityResponse | undefined
  overridden: boolean
  onOverrideChange: (next: boolean) => void
  t: TFunction<'outreach'>
}) {
  const rows = excludedRows(eligibility)
  if (rows.length === 0) return null
  const anyForceable = rows.some(row => !isHardBlocked(row))

  return (
    <Box
      className="flex flex-col gap-2 rounded-md border border-[var(--bellum-warning)] p-2"
      data-testid="enrollment-exclusions"
    >
      <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
        {t('multichannel.exclusions.title', { count: rows.length })}
      </Text>
      <ul className="flex flex-col gap-1">
        {rows.map(row => (
          <li key={row.contact_id}>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              <span className="font-medium">{row.contact_name ?? t('multichannel.exclusions.unnamed')}</span>
              {' — '}
              {row.exclusions.map(exclusion => t(`multichannel.exclusions.reason.${exclusion.code}`)).join(' · ')}
              {isHardBlocked(row) ? ` — ${t('multichannel.exclusions.notForceable')}` : ''}
            </Text>
          </li>
        ))}
      </ul>
      {anyForceable ? (
        <label className="flex items-start gap-2 pointer-coarse:min-h-11">
          <Checkbox
            checked={overridden}
            onCheckedChange={checked => onOverrideChange(checked === true)}
            aria-label={t('multichannel.exclusions.override')}
          />
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('multichannel.exclusions.override')}
          </Text>
        </label>
      ) : null}
      {eligibility?.contacts.some(row => !row.client_status_known) ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('multichannel.exclusions.clientUnknown')}
        </Text>
      ) : null}
    </Box>
  )
}
