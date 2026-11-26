import type { LegalContractUploadLink } from '@bellum/contracts'
import { Box, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { queryKeys } from '@/lib/api/query-keys'
import { formatDate } from '@/lib/locale'

const MUTED = 'text-[var(--bellum-text-muted)]'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — « Demander une pièce ».
 *
 * Décision appliquée (recommandation, tranchée sans Louis) : un LIEN SIGNÉ à
 * usage limité, une mission + un contrat, expiration 7 jours, révocable,
 * dépôt seulement. Le COMMERCIAL génère ce lien et le COPIE lui-même — le
 * copilote ne l'envoie jamais (doctrine : il prépare, le commercial envoie).
 * Ce panneau ne contient donc AUCUN geste d'envoi, seulement « copier ».
 */
export function ContractUploadLinkPanel({
  accountId,
  contractId,
  missions,
}: {
  accountId: string
  contractId: string
  missions: { id: string; label: string }[]
}) {
  const { t } = useTranslation('accountMissions')
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [missionId, setMissionId] = useState('')

  const queryKey = queryKeys.accounts.contractUploadLinks(accountId, contractId)
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<{ links: LegalContractUploadLink[] }>({
        path: `/delivery/accounts/${accountId}/contracts/${contractId}/upload-links`,
      }),
  })

  const generate = useMutation<{ link: LegalContractUploadLink; url: string }, Error, { missionId: string }>({
    mutationFn: body =>
      apiFetch<{ link: LegalContractUploadLink; url: string }, typeof body>({
        path: `/delivery/accounts/${accountId}/contracts/${contractId}/upload-links`,
        method: 'POST',
        body,
      }),
    onSuccess: async result => {
      await qc.invalidateQueries({ queryKey })
      setMissionId('')
      setOpen(false)
      const copied = await copyToClipboard(result.url)
      toast.success(t('contracts.uploadLinks.created'), {
        description: copied ? t('contracts.uploadLinks.copied') : result.url,
      })
    },
    onError: error => toast.error(t('contracts.uploadLinks.generateFailed'), { description: error.message }),
  })

  const revoke = useMutation<unknown, Error, string>({
    mutationFn: linkId =>
      apiFetch<unknown>({
        path: `/delivery/accounts/${accountId}/contracts/${contractId}/upload-links/${linkId}/revoke`,
        method: 'PATCH',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey })
      toast.success(t('contracts.uploadLinks.list.revokeDone'))
    },
    onError: error => toast.error(t('contracts.uploadLinks.list.revokeFailed'), { description: error.message }),
  })

  return (
    <Box display="flex" className="flex-col gap-2 pt-1">
      {!open ? (
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={missions.length === 0}>
            {t('contracts.uploadLinks.open')}
          </Button>
        </Box>
      ) : (
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Select value={missionId} onValueChange={setMissionId}>
            <SelectTrigger aria-label={t('contracts.uploadLinks.mission')} className="h-11 w-auto min-w-56">
              <SelectValue placeholder={t('contracts.uploadLinks.mission')} />
            </SelectTrigger>
            <SelectContent>
              {missions.map(mission => (
                <SelectItem key={mission.id} value={mission.id}>
                  {mission.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={missionId.length === 0 || generate.isPending}
            onClick={() => generate.mutate({ missionId })}
          >
            {t('contracts.uploadLinks.generate')}
          </Button>
        </Box>
      )}

      {!isLoading && data && Array.isArray(data.links) && data.links.length > 0 ? (
        <Box display="flex" className="flex-col gap-1">
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('contracts.uploadLinks.list.title')}
          </Text>
          {data.links.map(link => (
            <Box key={link.id} display="flex" className="flex-wrap items-center gap-2">
              <Text size="xs" color={MUTED}>
                {t('contracts.uploadLinks.list.forMission', { mission: link.missionLabel ?? link.missionId })}
                {' · '}
                {link.revokedAt
                  ? t('contracts.uploadLinks.list.revokedOn', { date: formatDate(link.revokedAt) })
                  : t('contracts.uploadLinks.list.expires', { date: formatDate(link.expiresAt) })}
                {' · '}
                {t('contracts.uploadLinks.list.deposits', { count: link.deposits.length })}
              </Text>
              {!link.revokedAt ? (
                <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(link.id)}>
                  {t('contracts.uploadLinks.list.revoke')}
                </Button>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}
      {missionId.length === 0 && open ? (
        <Text size="xs" color={MUTED}>
          {t('contracts.uploadLinks.missionRequired')}
        </Text>
      ) : null}
    </Box>
  )
}
