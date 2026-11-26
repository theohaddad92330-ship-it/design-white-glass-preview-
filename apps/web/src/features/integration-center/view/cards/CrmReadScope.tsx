import type { CrmProvider } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useCrmFirstImport, useCrmReadStatus, useKeepCrmValue } from '@/features/crm-import/api'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { CrmReadScopeNote } from './CrmReadScopeNote'

/**
 * La note de périmètre d'un CRM, avec l'état RÉEL de sa synchro (`GET /crm/import/status`).
 * Séparée de la note elle-même, qui reste présentationnelle et testable sans requête.
 */
export function CrmReadScope({
  connector,
  connected,
  authExpired = false,
}: {
  connector: CrmProvider
  connected: boolean
  /** #recette-21-10-K2 — `state === 'action_required'` de la carte. */
  authExpired?: boolean
}) {
  // #4189.8 — en salle de démonstration, l'API rend UNE ligne fictive marquée `demo` : elle seule
  // ouvre la note (un CRM jamais branché ne s'affiche pas comme branché hors de cette ligne).
  const demo = useIsDemo()
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.crmReadScope' })
  const { data, isError } = useCrmReadStatus(connected || demo)
  const status = data?.find(row => row.provider === connector)
  const { data: firstImports } = useCrmFirstImport()
  const keep = useKeepCrmValue()
  return (
    <>
      {/* #4590 — un échec de lecture se DIT : une zone muette se lirait « rien à signaler ». */}
      {isError ? (
        <Text size="xs" role="alert" color="text-[var(--bellum-text-secondary)]">
          {t('unavailable')}
        </Text>
      ) : null}
      <CrmReadScopeNote
        connector={connector}
        connected={connected || status?.demo === true}
        authExpired={authExpired}
        status={status}
        firstImport={firstImports?.find(row => row.provider === connector)}
        onKeepCrm={item => item.id && keep.mutate({ eventId: item.id, field: item.field })}
      />
    </>
  )
}
