import { computeSequenceStepStats, type OutreachSequence } from '@bellum/contracts'
import { Box, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { useMemo } from 'react'
import { formatCount } from '@/lib/locale'
import { STEP_KIND_ICON } from '../step-channels'

/**
 * Lot L-B (#4165) — LES STATS PAR ÉTAPE : préparé · envoyé (ou fait) · répondu ·
 * RDV. Pas d'ouvertures en indicateur, aucune probabilité.
 *
 * Une valeur NON MESURÉE s'écrit « — », jamais 0 (GA-18/19) : tant qu'aucune
 * étape n'est faite à une position, « répondu » et « RDV » n'ont pas de sens.
 * Un zéro MESURÉ, lui, reste un zéro. Le calcul vit dans le contrat
 * (`computeSequenceStepStats`), partagé avec la démo et ses gardes.
 */

/** « — » pour une valeur non mesurée ; le nombre sinon. */
function cell(value: number | null): string {
  return value === null ? '—' : formatCount(value)
}

export function SequenceStepStats({
  sequences,
  t,
}: {
  sequences: readonly OutreachSequence[]
  t: TFunction<'outreach'>
}) {
  const rows = useMemo(
    () =>
      computeSequenceStepStats(
        sequences.map(sequence => ({
          steps: sequence.steps,
          contact_replied: sequence.contact_replied,
          cancel_reason: sequence.cancel_reason,
        })),
      ),
    [sequences],
  )
  if (rows.length === 0) return null

  return (
    <Box className="flex flex-col gap-2" data-testid="step-stats">
      <Text size="sm" weight="medium">
        {t('multichannel.stats.title', { count: sequences.length })}
      </Text>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('multichannel.stats.step')}</TableHead>
            <TableHead className="text-right">{t('multichannel.stats.prepared')}</TableHead>
            <TableHead className="text-right">{t('multichannel.stats.done')}</TableHead>
            <TableHead className="text-right">{t('multichannel.stats.replied')}</TableHead>
            <TableHead className="text-right">{t('multichannel.stats.meeting')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const Icon = STEP_KIND_ICON[row.kind]
            return (
              <TableRow key={row.position}>
                <TableCell>
                  <Box className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <Text size="sm">
                      {t('multichannel.stats.stepName', { n: row.position + 1, kind: t(`stepKind.${row.kind}`) })}
                    </Text>
                  </Box>
                </TableCell>
                <TableCell className="text-right tabular-nums">{cell(row.prepared)}</TableCell>
                <TableCell className="text-right tabular-nums">{cell(row.done)}</TableCell>
                <TableCell className="text-right tabular-nums">{cell(row.replied)}</TableCell>
                <TableCell className="text-right tabular-nums">{cell(row.meeting)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('multichannel.stats.footnote')}
      </Text>
    </Box>
  )
}
