import type { CommercialBrief } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { useTranslation } from 'react-i18next'
import { useAccountIntelligenceContext } from '@/features/accounts/hooks/useAccountIntelligenceContext'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { BriefFold } from '@/features/brief-blocks/BriefFold'
import { ShowMoreButton, useRevealed } from '@/features/brief-blocks/ShowMore'
import { formatDate } from '@/lib/locale'
import { mergePresentEsn, probableSameEsn } from './presentEsn'

/** Les premières sociétés montrées avant « Voir N de plus » (un compte peut en porter des dizaines). */
const PRESENT_ESN_INITIAL = 8

/**
 * K.2 / #4323 (Louis 19/10/2026) — LA SEULE LISTE DES ESN PRÉSENTES SUR LE COMPTE.
 *
 * Elle remplace trois lectures du même fait (« ESN en place » du brief, « Qui est déjà en place » du contexte
 * canonique, « Sociétés de services observées » de l'historique) : une ligne par société, son niveau de preuve
 * en mots (déclaré / observé / déduit) et sa date. La fusion et ses règles vivent dans `presentEsn.ts`.
 *
 * Les hooks sont les MÊMES que les cartes qu'elle remplace (contexte canonique, contexte marché) : aucune
 * requête de plus. Une lecture indisponible n'enlève rien — le brief, déjà là, suffit à faire des lignes.
 */
export function PresentEsnList({
  accountId,
  esn,
  generatedAt,
  showMoreT,
  meaning,
  exEsnProfilesNote,
}: {
  accountId: string
  esn: CommercialBrief['esn']
  generatedAt: string | null
  /** Le traducteur des blocs partagés du brief (« Voir N de plus »). */
  showMoreT?: (key: string, options?: Record<string, string | number>) => string
  /** #4323.1 — « Ce que ça veut dire pour toi » de la rubrique ESN du brief : l'information reste, la rubrique double s'efface. */
  meaning?: string | null
  /** #4323.4 — une rubrique du brief cite des « profils ex-ESN » : la liste dit que ce sont des personnes, pas des sociétés. */
  exEsnProfilesNote?: boolean
}) {
  const { t } = useTranslation('accountDetail', { keyPrefix: 'presentEsn' })
  const { t: tDetail } = useTranslation('accountDetail')
  const intelligenceQuery = useAccountIntelligenceContext(accountId)
  const marketQuery = useAccountMarketContext(accountId, Boolean(accountId))
  const incumbentEsn = intelligenceQuery.data?.incumbentEsn
  const market = marketQuery.data
  // #4323.1 — tant qu'une des deux lectures charge, le total n'est PAS encore connu : « 10 » puis « 17 » une fois les
  // autres sources arrivées disait deux totaux pour la même liste. Le compteur n'apparaît qu'une fois le total acquis.
  const totalKnown = !intelligenceQuery.isLoading && !marketQuery.isLoading

  const rows = mergePresentEsn({
    brief: esn,
    briefDate: generatedAt,
    incumbents: incumbentEsn?.state === 'known' ? incumbentEsn.value : null,
    incumbentSource:
      incumbentEsn?.state === 'known'
        ? { source: incumbentEsn.provenance.source, observedAt: incumbentEsn.provenance.observedAt }
        : null,
    observed: market?.esn_observed_detail,
  })
  const sameProposals = probableSameEsn(rows)
  const { visible, nextCount, revealMore } = useRevealed(rows.length, PRESENT_ESN_INITIAL)
  if (rows.length === 0) return null
  // #4323.1 / #4323.2 — la synthèse (qui remplace la tuile « N ESN confirmées ») lit les MÊMES lignes que la liste :
  // une seule source de compte. Un niveau de preuve sans société n'est pas écrit (jamais « 0 déclarée »).
  const summary = (['declared', 'observed', 'deduced'] as const)
    .map(evidence => ({ evidence, count: rows.filter(row => row.evidence === evidence).length }))
    .filter(entry => entry.count > 0)
    .map(entry => t(`summary.${entry.evidence}`, { count: entry.count }))
    .join(' · ')

  return (
    <BriefFold
      testId="present-esn"
      title={t('title')}
      count={totalKnown ? rows.length : undefined}
      // #4323.1 — replié, le total porte sa ventilation par preuve (jamais « 11 » nu, sans un nom ni un niveau).
      detail={totalKnown ? summary : undefined}
    >
      <Text size="sm" weight="medium" className="mb-1 block" data-testid="present-esn-summary">
        {t('summaryLead')} {summary}
      </Text>
      <Text size="xs" className="mb-3 block text-[var(--bellum-text-muted)]">
        {t('hint')}
      </Text>
      {exEsnProfilesNote ? (
        <Text size="xs" className="mb-3 block text-[var(--bellum-text-muted)]" data-testid="present-esn-unit-note">
          {t('unitNote')}
        </Text>
      ) : null}
      {meaning ? (
        <Text size="sm" className="mb-3 block text-[var(--bellum-text-secondary)]" data-testid="present-esn-meaning">
          <span className="font-medium">{t('meaningTitle')}</span> — {meaning}
        </Text>
      ) : null}
      <ul className="flex flex-col gap-3">
        {rows.slice(0, visible).map(row => {
          const date = formatDate(row.date, { dateStyle: 'medium' })
          return (
            <li key={row.name.toLowerCase()} data-testid={`present-esn-${row.name.toLowerCase()}`} className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Text size="sm" weight="semibold">
                  {row.name}
                </Text>
                <Badge variant="outline">{t(`evidence.${row.evidence}`)}</Badge>
                {/* RV4-E-FIX 4295.21 (#4016.46) — une ESN déduite (prior, parcours d'ailleurs, indice) est une
                    ESTIMATION : badgée « estimé » avec sa base, jamais présentée comme un fait. */}
                {row.estimateSource ? (
                  <EstimatedBadge kind="probable" basis={tDetail(`estimateBasis.${row.estimateSource}`)} />
                ) : null}
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {date ? t('dated', { date }) : t('dateUnknown')}
                </Text>
                {row.perimeter ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {row.perimeter}
                  </Text>
                ) : null}
              </div>
              {sameProposals[row.name] ? (
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]" data-testid="present-esn-same">
                  {t('probablySame', { names: sameProposals[row.name]?.join(', ') })}
                </Text>
              ) : null}
              {row.proof ? (
                <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                  {row.proof}
                </Text>
              ) : null}
              {row.strengths ? (
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('strengths', { value: row.strengths })}
                </Text>
              ) : null}
              {row.weaknesses ? (
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('weaknesses', { value: row.weaknesses })}
                </Text>
              ) : null}
              {/* #4016 L10 — sous le seuil, la fourchette « 1-2 », jamais le compte exact. */}
              {row.paths ? (
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('paths', { range: row.paths.kind === 'range' ? row.paths.label : String(row.paths.count) })}
                </Text>
              ) : null}
            </li>
          )
        })}
      </ul>
      {showMoreT ? (
        <ShowMoreButton
          t={showMoreT}
          nextCount={nextCount}
          visible={visible}
          total={rows.length}
          onClick={revealMore}
          testId="present-esn-more"
        />
      ) : null}
    </BriefFold>
  )
}
