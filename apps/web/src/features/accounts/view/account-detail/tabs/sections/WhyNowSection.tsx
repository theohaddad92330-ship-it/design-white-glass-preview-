import type { AccountAnalysis, ItChallenge, PainPoint, RecentSignal } from '@bellum/contracts'
import { Box, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

import { SIGNAL_TEXT_SIMILARITY_THRESHOLD, signalTextSimilarity } from '@/lib/signal-dedupe'

import { BuyingSignals } from './BuyingSignals'
import { ItImplicationsCard } from './ItImplicationsCard'
import { ItChallenges } from './ItChallenges'
import { PainPoints } from './PainPoints'

type WhyNowSectionProps = {
  pains: PainPoint[]
  challenges: ItChallenge[]
  implications?: string | null
  signals: RecentSignal[]
  signalCoverage?: AccountAnalysis['signal_coverage']
}

/** Un énoncé comparé au blanc, à la casse et aux accents près. */
const statementKey = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** #4142.9 / V4-CORRECTIFS-C 4294.3 — un enjeu déjà listé comme pain n'est pas répété dans la colonne voisine : même
 *  énoncé à la ponctuation et à la casse près, ou reformulation quasi identique (mêmes mots, Dice ≥ 0,8, GA-26). */
function challengesNotInPains(pains: PainPoint[], challenges: ItChallenge[]): ItChallenge[] {
  const painTexts = pains.map(pain => pain.pain).filter((pain): pain is string => Boolean(statementKey(pain)))
  return challenges.filter(
    challenge =>
      !painTexts.some(
        pain =>
          statementKey(pain) === statementKey(challenge.title) ||
          signalTextSimilarity(pain, challenge.title ?? '') >= SIGNAL_TEXT_SIMILARITY_THRESHOLD,
      ),
  )
}

export function WhyNowSection({ pains, challenges, implications, signals, signalCoverage }: WhyNowSectionProps) {
  const { t } = useTranslation('accountDetail')
  // #3673 (réfuté en prod le 07/10, Société Générale) — la colonne « Enjeux à adresser » ne
  // disparaît plus quand les autres colonnes portent du contenu : taire un axe entier d'une
  // analyse qui en a rempli deux se lisait « rien à voir ici », alors que c'est précisément le
  // cas où l'absence doit se NOMMER (doctrine : sous une analyse, ce qui n'a pas pu être évalué
  // se nomme — distinct d'une LISTE, où une absence ne fait aucune ligne). `ItChallenges` porte
  // son propre état vide honnête (« non évalué », jamais « 0 enjeu » : on ne peut pas affirmer
  // qu'il n'y en a aucun, seulement qu'aucune source n'en a rendu).
  //
  // #3673 (recette prod 08/10, 8c42a4032c) — « Expertises concernées » n'avait PAS reçu la même
  // garde : `{implications ? <ItImplicationsCard …/> : null}` faisait disparaître la carte
  // ENTIÈRE sans `implications`, exactement le symptôme observé sur Société Générale. Montée
  // désormais toujours, son absence se nomme comme les autres colonnes.
  return (
    <Box className="space-y-4 py-2">
      <Text element="h2" size="base" weight="semibold" className="mb-3">
        {t('whyNow.title')}
      </Text>
      <Card className="grid gap-0 overflow-hidden p-0 [--card-spacing:0px] md:grid-cols-3 md:divide-x md:divide-[var(--bellum-border)]">
        <PainPoints pains={pains} />
        <ItChallenges challenges={challengesNotInPains(pains, challenges)} />
        <BuyingSignals signals={signals} coverage={signalCoverage} />
      </Card>
      <ItImplicationsCard value={implications ?? null} />
    </Box>
  )
}
