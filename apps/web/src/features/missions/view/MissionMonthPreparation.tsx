import {
  hasPermission,
  type InvoiceMonthPreparation,
  type PoMonthAlert,
  type SaveMonthPreparationInput,
} from '@bellum/contracts'
import { Badge, Box, Button, Checkbox, FilterChips, Input, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { formatMonth } from '@/lib/locale'
import { useTeam } from '@/features/team/hooks/useTeam'

/**
 * #2563 / #2566 / #2567 — « Préparer la facture de <mois> » sur la fiche d'une
 * mission longue : la facture du mois précédent sert de modèle, seuls les jours
 * (relevé, ou saisie NOMMÉE « sans CRA ») et le N° de bon de commande changent.
 * Le contrôle du bon de commande (période, absence, volume) se VOIT avant de
 * préparer et n'empêche jamais de le faire.
 *
 * « Préparée » ≠ « créée » ≠ « envoyée » : ce panneau prépare, puis laisse la
 * porte existante (`connectorSlot`, création du brouillon dans l'outil branché)
 * faire le reste. Il n'envoie jamais rien.
 */

/** Le mois courant et le précédent, en `YYYY-MM` (UTC) — le précédent est celui qu'on facture le plus souvent. */
function monthsOf(now: Date = new Date()): { previous: string; current: string } {
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return {
    previous: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`,
    current: now.toISOString().slice(0, 7),
  }
}

export function MissionMonthPreparation({
  missionId,
  connectorSlot,
}: {
  missionId: string
  /** La porte « créer le brouillon dans l'outil branché », fournie par la fiche. */
  connectorSlot?: (preparation: InvoiceMonthPreparation) => ReactNode
}) {
  const { t } = useTranslation('missions')
  const { team } = useTeam()
  const canWrite = team ? hasPermission(team.workspace.role, 'finance:write') : false
  const queryClient = useQueryClient()
  const months = monthsOf()
  const [month, setMonth] = useState(months.previous)
  const [daysDraft, setDaysDraft] = useState<string | null>(null)
  const [poDraft, setPoDraft] = useState<string | null>(null)
  const queryKey = ['missions', missionId, 'invoice-preparation', month] as const

  const {
    data: raw,
    isError,
    isLoading,
  } = useQuery({
    queryKey,
    retry: false,
    queryFn: () => apiFetch<InvoiceMonthPreparation>({ path: `/delivery/invoice-preparation/${missionId}/${month}` }),
  })

  // Une réponse sans contrôle de bon de commande n'est pas une préparation : on la
  // lit comme « indisponible » plutôt que de rendre un panneau à moitié vide.
  const data = raw && raw.poCheck ? raw : undefined

  const save = useMutation({
    mutationFn: (body: SaveMonthPreparationInput) =>
      apiFetch<InvoiceMonthPreparation>({
        path: `/delivery/invoice-preparation/${missionId}/${month}`,
        method: 'PUT',
        body,
      }),
    onSuccess: result => {
      queryClient.setQueryData(queryKey, result)
      // Le mois a changé d'état (bloqué → prêt) : l'écran de facturation le relit.
      void queryClient.invalidateQueries({ queryKey: ['missions', missionId] })
      setDaysDraft(null)
      setPoDraft(null)
    },
  })

  const auto = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch<{ enabled: boolean }>({
        path: `/delivery/invoice-preparation/${missionId}/auto`,
        method: 'PUT',
        body: { enabled },
      }),
    onSuccess: result => {
      queryClient.setQueryData<InvoiceMonthPreparation | undefined>(queryKey, previous =>
        previous ? { ...previous, autoPrepare: result.enabled } : previous,
      )
    },
  })

  const monthButtons = (
    <FilterChips
      size="sm"
      ariaLabel={t('monthPrep.monthPicker')}
      options={[months.previous, months.current].map(value => ({ value, label: formatMonth(value) ?? value }))}
      value={month}
      onChange={next => {
        if (!next) return
        setMonth(next)
        setDaysDraft(null)
        setPoDraft(null)
      }}
    />
  )

  // Pas de droit de lecture financière, ou rien à facturer ce mois : on le DIT, on ne cache pas le panneau en silence.
  if (isError || (!isLoading && !data)) {
    return (
      <Box className="space-y-2 border-t border-border pt-3">
        <Text element="p" size="sm" weight="medium">
          {t('monthPrep.title', { month: formatMonth(month) ?? month })}
        </Text>
        {monthButtons}
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('monthPrep.unavailable')}
        </Text>
      </Box>
    )
  }
  if (isLoading || !data) return null

  const craDays = data.daysSource === 'cra'
  const daysValue = daysDraft ?? (data.daysSource === 'manual' && data.days !== null ? String(data.days) : '')
  const poValue = poDraft ?? data.poNumber ?? ''
  const check = data.poCheck
  const dirty = daysDraft !== null || poDraft !== null

  const submit = () => {
    const body: SaveMonthPreparationInput = {}
    if (!craDays && daysDraft !== null) {
      body.days = daysDraft.trim() === '' ? null : Number(daysDraft.replace(',', '.'))
    }
    if (poDraft !== null) body.poNumber = poDraft.trim() === '' ? null : poDraft.trim()
    save.mutate(body)
  }

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text element="p" size="sm" weight="medium">
        {t('monthPrep.title', { month: formatMonth(data.periodMonth.slice(0, 7)) ?? month })}
      </Text>
      {monthButtons}

      {data.invoiced ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('monthPrep.alreadyInvoiced')}
        </Text>
      ) : (
        <>
          {/* Le modèle : ce qui est reconduit du mois précédent. */}
          <Text element="p" size="xs" color="text-muted-foreground">
            {data.previous
              ? t('monthPrep.reusedFrom', {
                  month: formatMonth(data.previous.periodMonth.slice(0, 7)) ?? '',
                  client: data.accountName ?? t('monthPrep.noClient'),
                })
              : t('monthPrep.noPrevious', { client: data.accountName ?? t('monthPrep.noClient') })}
            {data.dailyRateCents !== null
              ? ` · ${t('monthPrep.rate', { value: Math.round(data.dailyRateCents / 100) })}`
              : ''}
          </Text>

          <Box display="flex" className="flex-wrap items-end gap-3">
            <Box className="space-y-1">
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('monthPrep.daysLabel')}
              </Text>
              {craDays && data.days != null ? (
                <Text size="sm">{t('monthPrep.daysFromCra', { count: data.days })}</Text>
              ) : (
                <Input
                  type="number"
                  min={0}
                  max={31}
                  step="0.5"
                  value={daysValue}
                  onChange={event => setDaysDraft(event.target.value)}
                  placeholder={
                    data.previous?.days != null ? t('monthPrep.daysPlaceholder', { count: data.previous.days }) : ''
                  }
                  aria-label={t('monthPrep.daysLabel')}
                  className="w-40 max-w-full"
                  disabled={!canWrite}
                />
              )}
              {/* La source est NOMMÉE : des jours saisis ne se font jamais passer pour un relevé. */}
              {data.daysSource === 'manual' && daysDraft === null ? (
                <Badge variant="outline">{t('monthPrep.manualDays')}</Badge>
              ) : null}
            </Box>
            <Box className="space-y-1">
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('monthPrep.poLabel')}
              </Text>
              <Input
                type="text"
                value={poValue}
                onChange={event => setPoDraft(event.target.value)}
                aria-label={t('monthPrep.poLabel')}
                className="max-w-[200px]"
                disabled={!canWrite}
              />
            </Box>
          </Box>

          {data.days !== null && data.amountCents !== null ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('monthPrep.amount', { days: data.days, amount: formatCents(data.amountCents) })}
            </Text>
          ) : null}

          {/* LE CONTRÔLE DU BON DE COMMANDE — visible, jamais bloquant. */}
          {check.alerts.length > 0 ? (
            <Box className="space-y-1" role="status">
              {check.alerts.map((alert: PoMonthAlert) => (
                <Text key={alert} element="p" size="xs" className="text-[var(--warning-soft-text)]">
                  {t(`monthPrep.alerts.${alert}`, {
                    until: check.validUntil ?? '',
                    from: check.validFrom ?? '',
                    exceeded: check.remainingAfterDays === null ? 0 : Math.abs(check.remainingAfterDays),
                  })}
                </Text>
              ))}
            </Box>
          ) : null}
          {check.remainingDays !== null ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('monthPrep.remaining', { count: check.remainingDays })}
              {check.remainingAfterDays !== null
                ? ` · ${t('monthPrep.remainingAfter', { count: check.remainingAfterDays })}`
                : ''}
            </Text>
          ) : null}

          <Box display="flex" className="flex-wrap items-center gap-2">
            {canWrite ? (
              <Button
                size="sm"
                variant="outline"
                isLoading={save.isPending}
                onClick={submit}
                disabled={!dirty && data.prepared}
              >
                {t('monthPrep.cta', { month: formatMonth(data.periodMonth.slice(0, 7)) ?? month })}
              </Button>
            ) : (
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('monthPrep.noWriteRight')}
              </Text>
            )}
            {data.prepared ? <Badge variant="secondary">{t('monthPrep.preparedNotSent')}</Badge> : null}
          </Box>
          {save.isError ? (
            <Text element="p" role="alert" size="xs" className="text-[var(--danger-soft-text)]">
              {save.error instanceof Error && save.error.message ? save.error.message : t('monthPrep.saveError')}
            </Text>
          ) : null}

          {canWrite ? (
            <Box display="flex" className="items-center gap-2">
              <Checkbox
                id="mission-month-auto-prepare"
                checked={data.autoPrepare}
                disabled={auto.isPending}
                onCheckedChange={value => auto.mutate(value === true)}
              />
              <Text element="label" size="xs" htmlFor="mission-month-auto-prepare">
                {t('monthPrep.auto')}
              </Text>
            </Box>
          ) : null}
          {data.autoPrepare ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('monthPrep.autoHint')}
            </Text>
          ) : null}

          {/* La création du brouillon dans l'outil branché reste un geste distinct. */}
          {data.prepared && connectorSlot ? connectorSlot(data) : null}
        </>
      )}
    </Box>
  )
}
