import { SectionCard, Text } from '@bellum/ui'
import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Completeness } from '@/components/primitives/Completeness'
import { useMarketMemoryPortfolio } from '../api'

/**
 * #1635.4 — LE FIT STRUCTUREL DU PORTEFEUILLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST LIVRÉ, ET LE MOT QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demande « 22 comptes présentent une FORTE affinité avec tes
 * expertises déclarées », et pose elle-même la condition : « seulement si les
 * données sont fiables ».
 *
 * Le nombre est livré ; la gradation ne l'est pas. « Forte » exigerait de
 * normaliser le recoupement par cohorte — un grand groupe cite mécaniquement
 * plus de technologies qu'une PME, donc recoupe plus souvent, et sans cohorte
 * le mot mesurerait la TAILLE de l'entreprise. C'est exactement la question
 * ouverte qui tient `MARKET_MEMORY_SCORING_ENABLED` à `false` pour le score
 * d'externalisation, et elle ne se répond pas deux fois différemment.
 *
 * À la place, le CRITÈRE est affiché : le lecteur voit sur quelles expertises
 * le recoupement a été fait, et juge lui-même. C'est ce que l'issue demande
 * quand elle écrit « pas de score global supplémentaire ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS EXPERTISE DÉCLARÉE, LA SECTION NE COMPTE PAS À ZÉRO
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle dit ce qui manque et où le renseigner. « 0 sur 38 » se lirait « ton
 * portefeuille ne te correspond pas » alors que ça veut dire « tu n'as rien
 * déclaré » — la faute de « non mesuré » rendu « 0 », appliquée à une phrase.
 */
export function MarketStructuralFitCard() {
  const { t } = useTranslation('marketMemory')
  const { data, isLoading, isError } = useMarketMemoryPortfolio()

  // Une panne de la mémoire ne se raconte pas comme une absence de fit : le
  // bloc entier disparaît, exactement comme le compteur voisin.
  // ⚠️ `!== 'ok'` et non `=== 'unavailable'` — voir la raison écrite en
  // entier dans `MarketMemoryCoverageCard`. Une forme inattendue (API plus
  // ancienne que le web pendant un déploiement) doit se taire, pas jeter.
  if (isLoading || isError || !data || data.status !== 'ok') return null

  const fit = data.structuralFit
  const accounts = data.coverage.accounts

  return (
    <SectionCard icon={Layers} title={t('fit.title')}>
      {fit === null ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('fit.undeclared')}
        </Text>
      ) : (
        <div className="space-y-2">
          <Text size="sm">{t('fit.headline', { count: fit.matching })}</Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('fit.criterion', { expertises: fit.expertises.join(' · ') })}
          </Text>
          {/* ⚠️ Le DÉNOMINATEUR est le portefeuille, et l'exclusion se NOMME.
              La première version passait `counted={matching} total={covered}` :
              elle lisait « calculé sur 22 comptes sur 38 », c'est-à-dire qu'on
              n'aurait pas su évaluer 16 d'entre eux. Faux — les 38 ont tous été
              évalués, 22 recoupent. Ce que le lecteur doit savoir est ailleurs :
              cette section ne parle QUE des comptes couverts, et les autres
              sortent du calcul faute de pile observée. C'est exactement ce que
              `excluded` existe pour dire. */}
          <Completeness
            counted={fit.covered}
            total={accounts}
            of={t('coverage.population')}
            excluded={accounts > fit.covered ? [t('fit.excluded', { count: accounts - fit.covered })] : undefined}
          />
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('fit.noGrade')}
          </Text>
        </div>
      )}
    </SectionCard>
  )
}
