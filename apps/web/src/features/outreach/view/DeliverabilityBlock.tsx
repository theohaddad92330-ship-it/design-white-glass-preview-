import { Box, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MeasuredValue, UnknownValue } from '@/components/primitives/UnknownValue'
import { useContactDeliverability } from '@/features/contacts/hooks/useContactDeliverability'

/**
 * #2384.5 — LA délivrabilité, DISTINCTE du taux d'envoi (« combien est
 * parti ») : « combien de ce qui est parti a réellement atteint la boîte ».
 *
 * `sent`/`bounced`/raisons sont MESURÉS — posés par le SEUL webhook
 * fournisseur (#2733, `ContactsService.applyEmailBounce`) sur
 * `email_bounced_at`/`email_bounce_reason`, jamais devinés.
 *
 * `domainReputation`/`complaints` n'ont AUCUN connecteur aujourd'hui : ils
 * restent NOMMÉS et rendus par `UnknownValue`, jamais un `0` qui prétendrait
 * avoir mesuré une absence de plainte (GA-18/GA-19, doctrine « non mesuré
 * n'est jamais 0 »).
 */
export function DeliverabilityBlock() {
  const { t } = useTranslation('outreach')
  const { data } = useContactDeliverability()
  // Optional chaining obligatoire (CLAUDE.md) : une réponse partielle ou
  // absente pendant le chargement ne doit jamais faire planter l'écran.
  const sent = data?.sent ?? 0
  const bounced = data?.bounced ?? 0
  const bounceRate = data?.bounceRate ?? null
  const bounceReasons = data?.bounceReasons ?? []

  return (
    <Box className="rounded-lg border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="medium">
        {t('deliverability.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5 block">
        {t('deliverability.subtitle')}
      </Text>

      {sent === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]" className="mt-3 block">
          {t('deliverability.empty')}
        </Text>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('deliverability.sent')} value={sent} />
            <Stat label={t('deliverability.bounced')} value={bounced} />
            <Stat
              label={t('deliverability.bounceRate')}
              value={<MeasuredValue value={bounceRate} format={v => `${(Number(v) * 100).toFixed(1)}%`} />}
            />
            <Stat
              label={t('deliverability.domainReputation')}
              value={<UnknownValue reason={t('deliverability.notMeasuredDomainReputation')} />}
            />
          </div>

          {bounceReasons.length > 0 && (
            <div className="mt-3">
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
                {t('deliverability.reasons')}
              </Text>
              <ul className="mt-1 space-y-0.5">
                {bounceReasons.map(row => (
                  <li key={row.reason}>
                    <Text size="sm">
                      {row.reason} — {row.count}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-3">
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
          {t('deliverability.complaints')}
        </Text>
        <UnknownValue reason={t('deliverability.notMeasuredComplaints')} />
      </div>
    </Box>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {value}
      </Text>
    </div>
  )
}
