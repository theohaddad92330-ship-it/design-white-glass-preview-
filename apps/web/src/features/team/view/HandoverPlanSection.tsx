import { useState } from 'react'
import { Box, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { HandoverAllocation, MemberPortfolio, PortfolioHandoverKind } from '@bellum/contracts'
import { useHandoverPlan } from '@/features/team/hooks/useHandoverPlan'

const NONE = '__none__'

/** Le choix du destinataire, par nature : `kind → userId`. */
export type HandoverChoice = Partial<Record<PortfolioHandoverKind, string>>

/** Les lots à envoyer, dans l'ordre des natures du contrat. */
export function allocationsOf(data: MemberPortfolio, choice: HandoverChoice): HandoverAllocation[] {
  return data.holdings.flatMap(holding => {
    const toUserId = choice[holding.kind]
    return toUserId && holding.count !== 0 ? [{ kind: holding.kind, toUserId }] : []
  })
}

/**
 * #4158.29 — le sélecteur de destinataire d'UNE nature, rangé dans la ligne même du tableau « ce qui
 * change de main » (une nature n'apparaît qu'une fois à l'écran, GA-26). Une nature à zéro n'en a pas.
 */
export function HandoverRecipientSelect({
  kind,
  count,
  data,
  value,
  onChange,
}: {
  kind: PortfolioHandoverKind
  count: number | null
  data: MemberPortfolio
  value: string | undefined
  onChange: (userId: string | undefined) => void
}) {
  const { t } = useTranslation('team')
  if (count === 0 || data.eligibleSuccessors.length === 0) return null
  return (
    <Select value={value ?? NONE} onValueChange={next => onChange(next === NONE ? undefined : next)}>
      <SelectTrigger
        aria-label={t('handover.plan.recipientAria', { kind: t(`handover.kinds.${kind}`) })}
        className="h-11 w-40 border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('handover.plan.none')}</SelectItem>
        {data.eligibleSuccessors.map(candidate => (
          <SelectItem key={candidate.userId} value={candidate.userId}>
            {candidate.fullName ?? candidate.email ?? t('member.fallbackName')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * #4158.29 — le RÉCAPITULATIF avant validation : nombre par type ET par destinataire, lu AVANT que quoi
 * que ce soit ne bouge. La validation est un second geste, dans le récapitulatif. Rien n'est supprimé.
 * Un comptage qui n'a pas abouti reste « non abouti », jamais « 0 » (GA-18 / GA-19).
 */
export function HandoverPlanRecap({
  fromUserId,
  data,
  allocations,
  onValidated,
}: {
  fromUserId: string
  data: MemberPortfolio
  allocations: HandoverAllocation[]
  onValidated: () => void
}) {
  const { t } = useTranslation('team')
  const { recap, confirm } = useHandoverPlan(fromUserId)
  const nameOf = (userId: string) => {
    const member = data.eligibleSuccessors.find(candidate => candidate.userId === userId)
    return member?.fullName ?? member?.email ?? t('member.fallbackName')
  }
  // Un récapitulatif n'est valable que pour les lots qui l'ont produit : changer un destinataire l'écarte.
  const key = JSON.stringify(allocations)
  const [recapKey, setRecapKey] = useState<string | null>(null)
  const fresh = recapKey === key
  const lines = fresh ? (recap.data?.lines ?? []) : []
  const recipients = [...new Set(lines.map(line => line.toUserId))]
  const busy = recap.isPending || confirm.isPending

  return (
    <Box className="space-y-2" data-testid="handover-plan">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('handover.plan.help')}
      </Text>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={allocations.length === 0 || busy}
        isLoading={recap.isPending}
        onClick={() => {
          setRecapKey(key)
          recap.mutate(allocations)
        }}
      >
        {t('handover.plan.recap')}
      </Button>

      {fresh && recap.data && (
        <Box className="space-y-1 rounded-md border border-[var(--bellum-border)] p-3" data-testid="handover-recap">
          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('handover.plan.recapTitle')}
          </Text>
          {recipients.map(recipient => (
            <Box key={recipient} className="space-y-0.5">
              <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                {nameOf(recipient)}
              </Text>
              <ul>
                {lines
                  .filter(line => line.toUserId === recipient)
                  .map(line => (
                    <li key={line.kind}>
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                        {line.count === null
                          ? t('handover.plan.recapUnknown', { kind: t(`handover.kinds.${line.kind}`) })
                          : t('handover.plan.recapLine', { count: line.count, kind: t(`handover.kinds.${line.kind}`) })}
                      </Text>
                    </li>
                  ))}
              </ul>
            </Box>
          ))}
          <Button
            type="button"
            variant="default"
            size="sm"
            isLoading={confirm.isPending}
            disabled={busy}
            onClick={() =>
              confirm.mutate(allocations, {
                onSuccess: () => {
                  recap.reset()
                  onValidated()
                },
              })
            }
          >
            {t('handover.plan.validate')}
          </Button>
        </Box>
      )}
    </Box>
  )
}
