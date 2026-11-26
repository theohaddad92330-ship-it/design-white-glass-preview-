import type { NeedAutoMatch } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useNeedAutoMatch } from '@/features/matching/hooks'
import { formatDate } from '@/lib/locale'

/**
 * #2916 / #2399.2 (`c93_matching_auto_besoin_entrant`) — LE MATCHING LANCÉ
 * AUTOMATIQUEMENT, sur la fiche besoin.
 *
 * Quand la routine « Matcher un besoin entrant » est active, le besoin est
 * matché à son arrivée, sans geste : la fiche doit le DIRE — un journal écrit
 * en silence serait l'opacité que le catalogue des routines refuse
 * (« visible, modifiable, désactivable, attribuée »).
 *
 * ⚠️ On n'affiche pas ce qu'on n'a pas : un besoin que l'automatisation n'a
 * jamais pris (routine éteinte à son arrivée) ne montre RIEN — pas une ligne
 * « aucun matching automatique ». Un statut qui n'a pas produit de run
 * (`capped`, `no_criteria`, `unknown`, `failed`) se NOMME, parce qu'il dit
 * pourquoi le résultat attendu manque. Aucun compteur ne s'écrit « 0 ».
 */
export function NeedAutoMatchNote({ needId, onOpen }: { needId: string; onOpen: () => void }) {
  const { t } = useTranslation('matching')
  const { data } = useNeedAutoMatch(needId)
  if (!data) return null

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2" data-testid="need-auto-match">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {sentence(data, t)}
      </Text>
      {data.status === 'done' && data.runId ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs pointer-coarse:min-h-11"
          onClick={onOpen}
        >
          {t('auto.open')}
        </Button>
      ) : null}
    </div>
  )
}

type TMatching = (key: string, options?: Record<string, unknown>) => string

function sentence(data: NeedAutoMatch, t: TMatching): string {
  const date = formatDate(data.launchedAt, { dateStyle: 'short' })
  switch (data.status) {
    case 'done': {
      const counts = [
        data.recommendedCount == null ? null : t('auto.recommended', { count: data.recommendedCount }),
        data.borderlineCount == null || data.borderlineCount === 0
          ? null
          : t('auto.borderline', { count: data.borderlineCount }),
      ].filter((part): part is string => part !== null)
      const head = date ? t('auto.doneOn', { date }) : t('auto.done')
      return counts.length > 0
        ? t('auto.withCounts', { head, counts: counts.join(', ') })
        : t('auto.withoutCounts', { head })
    }
    case 'queued':
      return t('auto.queued')
    case 'unknown':
      return t('auto.unknown')
    case 'failed':
      return t('auto.failed')
    case 'capped':
      return t('auto.capped')
    case 'no_criteria':
      return t('auto.noCriteria')
  }
}
