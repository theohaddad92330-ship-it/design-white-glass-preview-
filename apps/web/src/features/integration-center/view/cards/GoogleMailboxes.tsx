import { Box, Button, Text } from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Mail, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { googleApi } from '@/features/google/api'
import { GOOGLE_CONNECTIONS_KEY, useGoogleConnections } from '@/features/google/hooks/useGoogleConnections'
import { GOOGLE_STATUS_KEY } from '@/features/google/hooks/useGoogleStatus'
import { formatDate } from '@/lib/locale'

type GoogleMailboxesProps = {
  /** Lance le consentement Google pour brancher UNE boîte de plus (le niveau est choisi par la carte). */
  onAdd: () => void
  adding?: boolean
}

/**
 * #4546.4 — les boîtes Google connectées, une ligne chacune, « en ajouter une », et le débranchement d'UNE boîte.
 *
 * ⚠️ « Débrancher » n'existe qu'à partir de DEUX boîtes : avec une seule, c'est le « Déconnecter » de la carte — le même
 * geste ne s'affiche pas deux fois (GA-26). Il envoie toujours l'identifiant de LA boîte : jamais le débranchement
 * global, qui retirerait les autres. Une lecture ratée se dit ; elle n'écrit jamais « aucune boîte ».
 */
export function GoogleMailboxes({ onAdd, adding = false }: GoogleMailboxesProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations.googleMailboxes' })
  const queryClient = useQueryClient()
  const { data: connections, isError } = useGoogleConnections()
  const [busyId, setBusyId] = useState<string | null>(null)

  const disconnectOne = async (id: string, label: string) => {
    setBusyId(id)
    try {
      await googleApi.disconnect(id)
      toast.success(t('disconnectedToast', { label }))
      void queryClient.invalidateQueries({ queryKey: GOOGLE_CONNECTIONS_KEY })
      void queryClient.invalidateQueries({ queryKey: GOOGLE_STATUS_KEY })
    } catch {
      toast.error(t('disconnectError'))
    } finally {
      setBusyId(null)
    }
  }

  const several = (connections?.length ?? 0) > 1

  return (
    <Box className="space-y-2" data-testid="google-mailboxes">
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
