import { Box, Button, Text } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Mail, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { microsoftApi } from '@/features/microsoft/api'
import { MICROSOFT_CONNECTIONS_KEY, useMicrosoftConnections } from '@/features/microsoft/hooks/useMicrosoftConnections'
import { MICROSOFT_STATUS_KEY } from '@/features/microsoft/hooks/useMicrosoftStatus'
import { formatDate } from '@/lib/locale'

type MicrosoftMailboxesProps = {
  /** Lance le consentement Microsoft pour brancher UNE boîte de plus . */
  onAdd: () => void
  adding?: boolean
}

/**
 * #4546.4 — les boîtes Outlook connectées, une ligne chacune, « en ajouter une », et le débranchement d'UNE boîte.
 *
 * ⚠️ « Débrancher » n'existe qu'à partir de DEUX boîtes : avec une seule, c'est le « Déconnecter » de la carte — le même
 * geste ne s'affiche pas deux fois (GA-26). Il envoie toujours l'identifiant de LA boîte : jamais le débranchement
 * global, qui retirerait les autres. Une lecture ratée se dit ; elle n'écrit jamais « aucune boîte ».
 */
export function MicrosoftMailboxes({ onAdd, adding = false }: MicrosoftMailboxesProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.microsoftMailboxes' })
  const queryClient = useQueryClient()
  const { data: connections, isError } = useMicrosoftConnections()
  const [busyId, setBusyId] = useState<string | null>(null)

  const disconnectOne = async (id: string, label: string) => {
    setBusyId(id)
    try {
      await microsoftApi.disconnect(id)
      toast.success(t('disconnectedToast', { label }))
      void queryClient.invalidateQueries({ queryKey: MICROSOFT_CONNECTIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: MICROSOFT_STATUS_KEY })
    } catch {
      toast.error(t('disconnectError'))
    } finally {
      setBusyId(null)
    }
  }

  const several = Boolean(connections && connections.length > 1)

  return (
    <Box className="space-y-2" data-testid="microsoft-mailboxes">
      <Text element="h4" size="xs" weight="semibold" color="text-[var(--bellum-text-secondary)]">
        {t('title')}
      </Text>
      {isError ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('loadError')}
        </Text>
      ) : (
        <ul className="space-y-1.5">
          {(connections ?? []).map(connection => {
            const label = connection.accountLabel ?? t('labelUnknown')
            const since = formatDate(connection.connectedAt, { dateStyle: 'medium' })
            return (
              <li
                key={connection.id}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-1.5"
              >
                <Box display="flex" className="min-w-0 items-center gap-2">
                  <Mail aria-hidden className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" />
                  <Box className="min-w-0">
                    <Text size="sm" className="truncate">
                      {label}
                    </Text>
                    {since ? (
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('connectedOn', { date: since })}
                      </Text>
                    ) : null}
                  </Box>
                </Box>
                {several ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('disconnectNamed', { label })}
                    isLoading={busyId === connection.id}
                    onClick={() => void disconnectOne(connection.id, label)}
                  >
                    {t('disconnect')}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <Button variant="outline" size="sm" isLoading={adding} onClick={onAdd}>
        <Plus aria-hidden className="size-3.5" />
        {t('add')}
      </Button>
    </Box>
  )
}
