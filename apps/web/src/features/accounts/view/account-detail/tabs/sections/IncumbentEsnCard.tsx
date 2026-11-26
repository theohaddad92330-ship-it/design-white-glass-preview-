import { intelligenceEstimateKind } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { useAccountIntelligenceContext } from '@/features/accounts/hooks/useAccountIntelligenceContext'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { AnalysisSectionCard } from './AnalysisSectionCard'
import { answerForIncumbent, type CompetitorAnswer } from './competitorOverlap'
import { corroboratingPaths } from './incumbentCorroboration'

/**
 * « ESN déjà en place » — lue au contexte canonique du dossier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE CARTE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `strengths` et `weaknesses` étaient produits par l'analyse, lus par l'export
 * PDF, et affichés sur AUCUN écran. C'est pourtant ce qui dit par où un
 * titulaire installé se déloge — la faiblesse d'un concurrent en place est la
 * porte d'entrée la plus concrète qu'un dossier puisse contenir.
 *
 * ⚠️ Cette carte n'est PAS un doublon de « Positionnement concurrentiel » en
 * colonne de droite, et la nuance vaut d'être tenue : celle-ci lit l'ESN en
 * place — le CONSTAT, qui est en place et ce qu'il vaut ; celle-là lit
 * `plan.competitive_strategy.vs_competitors[]` — notre ANGLE, ce qu'on répond
 * à chacun. Deux champs, deux questions, deux moments de la préparation.
 *
 * #2116.10 — l'ESN en place vient du contexte canonique, jamais recalculée
 * ici. `IncumbentEsnCard` est le SEUL rendu de ce fait dans l'onglet
 * (GA-26) : `AccountCanonicalContextCard` ne le recalcule ni ne le re-rend,
 * précisément parce que cette carte porte plus — forces, faiblesses,
 * périmètre du contrat, et la corroboration par la mémoire marché.
 */
export function IncumbentEsnCard({
  accountId,
  answers,
}: {
  accountId: string
  /** #4323.3 — l'angle de réponse écrit pour une société en place se lit SUR SA LIGNE, pas sous un second titre. */
  answers?: readonly CompetitorAnswer[] | null
}) {
  const { t } = useTranslation('accountDetail')
  // #2116.10 — l'ESN en place vient du contexte canonique, jamais recalculée ici.
  const incumbentEsn = useAccountIntelligenceContext(accountId).data?.incumbentEsn
  // #1607.3 — MÊME hook, MÊME route que le popover de ligne et la stack
  // observée (`GET /accounts/:id/market-context`) : jamais une requête
  // directe sur une table `market_*`.
  const esnObservedDetail = useAccountMarketContext(accountId, Boolean(accountId)).data?.esn_observed_detail

  // La façade n'a pas encore répondu (chargement, ou module non monté) : on se
  // TAIT, comme `AccountCanonicalContextCard` — une lecture indisponible
  // n'est pas un constat.
  if (!incumbentEsn) return null

  // #3711.17 (décision Louis 17/10, recette R41 : « non mesuré — aucune ESN nommée » hors score) — une absence ne fait
  // AUCUNE ligne : sans ESN en place établie, la carte n'existe pas (ni « non mesuré », ni sa raison).
  if (incumbentEsn.state === 'unknown') return null

  const esnEstimate = intelligenceEstimateKind(incumbentEsn.provenance.source, 'probable')
  return (
    <AnalysisSectionCard
      icon={Swords}
      title={t('competitors.title')}
      subtitle={t('competitors.subtitle')}
      source={incumbentEsn.provenance.source}
      analyzedAt={incumbentEsn.provenance.observedAt}
    >
      <ul className="border-t border-[var(--bellum-border)]">
        {incumbentEsn.value.map((incumbent, index) => {
          // #1607.3 — `null` couvre TROIS cas indiscernables à dessein : nom
          // absent du corpus, corpus sous le seuil, mémoire non couverte. Dans
          // les trois, le SEUL geste correct est le silence — jamais un « non ».
          const paths = corroboratingPaths(incumbent.name, esnObservedDetail)
          const answer = answerForIncumbent(incumbent.name, answers)
          return (
            <li
              key={`${incumbent.name}-${index}`}
              className="border-b border-[var(--bellum-border)] px-4 py-3 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Text size="sm" weight="medium">
                  {incumbent.name}
                </Text>
                {/* #4016.L4 — « ESN probablement en place (indices) » : jamais présentée comme un fait. */}
                {esnEstimate ? (
                  <EstimatedBadge kind={esnEstimate} basis={t(`estimateBasis.${incumbentEsn.provenance.source}`)} />
                ) : null}
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {incumbent.contractType ?? t('competitors.noContractType')}
                </Text>
              </div>
              {/* #2613 — une force ou une faiblesse non renseignée ne fait plus
                  de ligne « non renseignée » : le trait disparaît, et le `<dl>`
                  lui-même s'efface si aucun des deux n'est connu. */}
              {incumbent.strengths || incumbent.weaknesses ? (
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Trait label={t('competitors.strengthsLabel')} value={incumbent.strengths ?? undefined} />
                  <Trait label={t('competitors.weaknessesLabel')} value={incumbent.weaknesses ?? undefined} />
                </dl>
              ) : null}
              {answer ? (
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Trait label={t('positioning.talkingPoint')} value={answer.talking_point ?? undefined} />
                  <Trait label={t('positioning.differentiator')} value={answer.differentiator ?? undefined} />
                </dl>
              ) : null}
              {/* #1607.3 — un fait ANNEXE, jamais fusionné dans le constat de
                  l'analyse ci-dessus : le vocabulaire est « observé », jamais
                  « en place » / « travaille actuellement » / « est fournisseur »
                  (ce vocabulaire reste réservé au TITRE de la carte, qui porte
                  le constat de l'analyse elle-même). Rendu SEULEMENT quand il y
                  a quelque chose à dire — pas de ligne « non corroboré ». */}
              {paths !== null ? (
                <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
                  {/* #4016 L10 — sous le seuil, la fourchette « 1-2 », jamais le compte exact. */}
                  {paths.kind === 'range'
                    ? t('competitors.corroboratedByMarketMemoryRange', { range: paths.label })
                    : t('competitors.corroboratedByMarketMemory', { count: paths.count })}
                </Text>
              ) : null}
            </li>
          )
        })}
      </ul>
    </AnalysisSectionCard>
  )
}

// #2613 — pas de valeur, pas de ligne : le libellé ne reste jamais seul.
function Trait({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt>
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
      </dt>
      <dd>
        <Text size="xs" className="leading-relaxed text-[var(--bellum-text-muted)]">
          {value}
        </Text>
      </dd>
    </div>
  )
}
