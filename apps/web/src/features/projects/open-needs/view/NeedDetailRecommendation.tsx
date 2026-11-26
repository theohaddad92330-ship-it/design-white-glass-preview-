import type { OpenNeedRow } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useNeedVerdict } from '../hooks/useNeedVerdict'

/**
 * La carte « Laura te recommande » (dossier du 26/08, image 02).
 *
 * #3486 — le « taux de réussite estimé » est RETIRÉ (Louis, 01/10/2026) : à
 * côté d'« aucun profil au-dessus du seuil » il affichait « 100 % », et aucun
 * pourcentage de chance n'est montré par le produit (`c26_probabilite`).
 */
export function NeedDetailRecommendation({ need, onOpenMatching }: { need: OpenNeedRow; onOpenMatching: () => void }) {
  const { t } = useTranslation('projects')
  // #3486 — « profils à présenter » = les profils du VERDICT (même requête, même
  // cache que le bandeau) : la carte ne peut plus recommander ce que le verdict
  // dit ne pas exister.
  const verdict = useNeedVerdict(need.id)

  return (
    <Card className="flex flex-col gap-3 bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent)] p-4">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-accent)]">
          {t('needSheet.recommendation.title')}
        </Text>
      </div>

      {verdict.isLoading || verdict.isError ? (
        <UnknownValue reason={verdict.isError ? t('needSheet.recommendation.readError') : undefined} />
      ) : verdict.profiles.length > 0 ? (
        <Text size="base" weight="semibold">
          {t('needSheet.recommendation.candidatesToPresent', { count: verdict.profiles.length })}
        </Text>
      ) : null}

      <Button size="sm" variant="secondary" className="pointer-coarse:min-h-11" onClick={onOpenMatching}>
        {t('needSheet.recommendation.viewAction')}
      </Button>
    </Card>
  )
}
