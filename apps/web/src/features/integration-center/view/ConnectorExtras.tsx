import { OutOfOfficeSection } from '@/features/mailbox/view/OutOfOfficeSection'
import type { ConnectorId, ConnectorState } from '../lib/connectors'

/**
 * Les réglages propres à un outil, rangés dans SON tiroir. Aujourd'hui : la réponse d'absence d'Outlook
 * (Microsoft 365) et de Gmail (Google Workspace) — décision Louis 22/10, un utilisateur Gmail a le même endroit.
 * Seulement quand l'outil est branché : un réglage de messagerie sur une messagerie absente n'aurait aucun sujet.
 */
export function ConnectorExtras({
  connector,
  state,
}: {
  connector: ConnectorId | null
  state: ConnectorState | undefined
}) {
  if (state !== 'connected') return null
  if (connector === 'microsoft') return <OutOfOfficeSection provider="microsoft" />
  if (connector === 'google') return <OutOfOfficeSection provider="google" />
  return null
}
