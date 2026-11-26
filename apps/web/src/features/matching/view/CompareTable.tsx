import type { MatchResult } from '@bellum/contracts'
import { Box, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/lib/locale'

type MatchIdentityConditions = {
  dailyRateCents?: number | null
  availableFrom?: string | null
  location?: string | null
  /** #2176.55 — posé par l'API SEULEMENT sous `finance:read` : absent = pas le droit. */
  finance?: { costCents: number | null; marginCents: number | null } | null
}

/** #2176.51 — la preuve des compétences PROUVÉES (`skills[].proof`, jamais
 *  vide pour `matched`) : la même donnée que la carte, jamais recalculée. */
function proofsOf(result: MatchResult): string[] {
  return result.skills
    .filter(skill => skill.status === 'matched' && skill.proof)
    .map(skill => `${skill.label} — ${skill.proof}`)
}

/** #2176.54 — les RISQUES DÉCLARÉS : exclusions et drapeaux, la même donnée
 *  que la carte (`MatchCard.tsx`) — jamais recalculée. Distincte de l'axe
 *  SCORÉ « risks » (#2176.21, `axisRisks` côté moteur) qui a sa propre ligne
 *  dans le tableau des axes ci-dessous (`t('axes.risks')`) : celle-ci est la
 *  liste des motifs (y compris ceux, comme un refus client, qui pèsent sur
 *  `client_constraints` et pas sur `risks`) ; celle-là est la note graduée des
 *  seuls signaux qui n'étaient encore QUE des drapeaux (consentement,
 *  disponibilité non revalidée, positionnements concurrents).
 *
 *  #2968 (#2336.13) — les drapeaux `preference_warning` n'y sont PLUS : ils
 *  ont leur PROPRE ligne (`preferenceWarningsOf`), nommée, jamais fondue dans
 *  ce sac générique — voir sa note. */
function risksOf(result: MatchResult): string[] {
  return [
    ...result.exclusions.map(exclusion => exclusion.detail),
    ...result.flags.filter(flag => flag.kind !== 'preference_warning').map(flag => flag.detail),
  ]
}

/**
 * #2968 (#2336.13) — QUAND UN BESOIN HEURTE UNE PRÉFÉRENCE DU CONSULTANT.
 *
 * `matching.service.ts` transmettait déjà `preferenceWarnings` au moteur
 * (`engine.ts` en fait un drapeau `preference_warning`, `MATCH_FLAG_TONES`
 * le classe `warning`) — mais ce comparateur le noyait dans la ligne
 * générique « Risques », entre un refus client et un consentement expiré :
 * une NOTE, pas un avertissement qu'on reconnaît. Cette ligne à part, avec
 * l'icône et le ton de `MatchCard.tsx` (même donnée, même lecture sur les
 * deux écrans — GA-26), est ce qui manquait : un besoin qui heurte une
 * préférence déclarée se voit nommément, pas en vrac.
 */
function preferenceWarningsOf(result: MatchResult): string[] {
  return result.flags.filter(flag => flag.kind === 'preference_warning').map(flag => flag.detail)
}

/** Une ligne de la comparaison qui rend une LISTE plutôt qu'un score : une
 *  liste vide se dit vide (pas de tiret, réservé au score non mesuré). */
function ListRow({
  label,
  results,
  itemsOf,
  emptyLabel,
  tone,
}: {
  label: string
  results: MatchResult[]
  itemsOf: (result: MatchResult) => string[]
  emptyLabel: string
  /** #2968 (#2336.13) — un avertissement NOMMÉ, jamais une puce anonyme :
   *  icône + ton, la même lecture que `MatchCard.tsx` (`MATCH_FLAG_TONES`).
   *  Absent = la puce simple d'avant, inchangée pour les trois autres lignes. */
  tone?: 'warning'
}) {
  return (
    <TableRow>
      <TableCell>
        <Text size="xs" weight="medium">
          {label}
        </Text>
      </TableCell>
      {results.map(result => {
        const items = itemsOf(result)
        return (
          <TableCell key={result.consultantId}>
            {items.length === 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {emptyLabel}
              </Text>
            ) : (
              <ul className={tone ? 'space-y-1' : 'list-disc pl-4'}>
                {items.map(item => (
                  <li key={item} className={tone ? 'flex items-start gap-1' : undefined}>
                    {tone === 'warning' ? (
                      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
                    ) : null}
                    <Text size="xs" className={tone === 'warning' ? 'text-[var(--warning-soft-text)]' : undefined}>
                      {item}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )
}

/**
 * La comparaison de deux à quatre profils, axe par axe (PDF 4 §8).
 *
 * La meilleure valeur de chaque ligne est surlignée. Un axe non évaluable
 * s'écrit « — » et n'est JAMAIS le meilleur : mettre en avant une absence de
 * donnée ferait choisir le profil dont on sait le moins de choses.
 *
 * La « ligne finale » du §8.1 — pourquoi recommander malgré un score inférieur —
 * n'est pas générée ici : elle demanderait un modèle, et le module est
 * délibérément déterministe. Ce que l'écran donne à la place est plus utile et
 * vérifiable : ce qui correspond et ce qui manque, en clair, critère par critère.
 */
export function CompareTable({
  results,
  nameOf,
  identities,
}: {
  results: MatchResult[]
  nameOf: (id: string) => string
  /** #2176.53 — TJM/disponibilité/lieu : des faits d'IDENTITÉ, jamais recalculés
   *  par le moteur (même séparation que `nameOf`, GA-06). `undefined` = aucune
   *  condition connue pour cet appelant, la ligne se comporte comme si tout
   *  était absent, jamais une valeur inventée. */
  identities?: ReadonlyMap<string, MatchIdentityConditions>
}) {
  const { t } = useTranslation('matching')
  if (results.length < 2) return null
  const axes = results[0]?.axes.map(axis => axis.axis) ?? []

  /** #2176.53 — chaque fait ABSENT sort de la liste plutôt que de s'afficher
   *  « non renseigné » : cohérent avec `risksOf`/`proofsOf` ci-dessus, une
   *  liste vide se dit vide via `emptyLabel`, jamais une ligne pour un « — ». */
  const conditionsOf = (result: MatchResult): string[] => {
    const identity = identities?.get(result.consultantId)
    if (!identity) return []
    const items: string[] = []
    if (identity.dailyRateCents != null)
      items.push(t('compare.dailyRate', { amount: formatCents(identity.dailyRateCents) }))
    const availableFrom = formatDate(identity.availableFrom)
    if (availableFrom) items.push(t('compare.availableFrom', { date: availableFrom }))
    if (identity.location) items.push(identity.location)
    return items
  }

  /** #2176.55 — la ligne coût/marge n'existe que si l'API a posé `finance`
   *  (droit `finance:read`) ; une valeur absente se NOMME, jamais un 0. */
  const showsFinance = results.some(result => identities?.get(result.consultantId)?.finance != null)
  const costMarginOf = (result: MatchResult): string[] => {
    const finance = identities?.get(result.consultantId)?.finance
    if (!finance) return []
    return [
      finance.costCents === null
        ? t('compare.costUnknown')
        : t('compare.cost', { amount: formatCents(finance.costCents) }),
      finance.marginCents === null
        ? t('compare.marginUnknown')
        : t('compare.margin', { amount: formatCents(finance.marginCents) }),
    ]
  }

  return (
    <Box className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('compare.axis')}</TableHead>
            {results.map(result => (
              <TableHead key={result.consultantId}>{nameOf(result.consultantId)}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Décision Louis (refonte Théo C, rapprochement) : la correspondance s'écrit EN CLAIR — ce qui
              correspond, ce qui manque — jamais en points. Chaque critère dit s'il est étayé ou à confirmer :
              un inconnu n'est jamais un non. */}
          <ListRow
            label={t('compare.matches')}
            results={results}
            itemsOf={result =>
              result.skills
                .filter(skill => skill.status === 'matched' || skill.status === 'adjacent')
                .map(skill => skill.label)
            }
            emptyLabel={t('compare.noMatch')}
          />
          <ListRow
            label={t('compare.lacks')}
            results={results}
            itemsOf={result => result.skills.filter(skill => skill.status === 'missing').map(skill => skill.term)}
            emptyLabel={t('compare.noLack')}
          />
          {axes.map(axis => (
            <TableRow key={axis}>
              <TableCell>
                <Text size="xs">{t(`axes.${axis}`)}</Text>
              </TableCell>
              {results.map(result => {
                const backed = (result.axes.find(entry => entry.axis === axis)?.score ?? null) !== null
                return (
                  <TableCell
                    key={result.consultantId}
                    className={backed ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--bellum-text-muted)]'}
                  >
                    {backed ? t('compare.axisBacked') : t('compare.axisToConfirm')}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
          {/* #2176.51/.52/.54 — preuves, écarts et risques : la même donnée
              que la carte (`MatchCard.tsx`), jamais recalculée, ni fondue
              avec les scores ci-dessus. */}
          <ListRow label={t('compare.proofs')} results={results} itemsOf={proofsOf} emptyLabel={t('compare.noProof')} />
          <ListRow
            label={t('compare.gaps')}
            results={results}
            itemsOf={result => result.gaps}
            emptyLabel={t('compare.noGap')}
          />
          <ListRow label={t('compare.risks')} results={results} itemsOf={risksOf} emptyLabel={t('compare.noRisk')} />
          {/* #2968 (#2336.13) — ligne À PART, nommée, jamais fondue dans
              « Risques » ci-dessus : voir `preferenceWarningsOf`. */}
          <ListRow
            label={t('compare.preferenceWarnings')}
            results={results}
            itemsOf={preferenceWarningsOf}
            emptyLabel={t('compare.noPreferenceWarning')}
            tone="warning"
          />
          <ListRow
            label={t('compare.conditions')}
            results={results}
            itemsOf={conditionsOf}
            emptyLabel={t('compare.noConditions')}
          />
          {/* #2176.55 — coût et marge, pour qui a le droit finance seulement. */}
          {showsFinance ? (
            <ListRow
              label={t('compare.costMargin')}
              results={results}
              itemsOf={costMarginOf}
              emptyLabel={t('compare.costUnknown')}
            />
          ) : null}
        </TableBody>
      </Table>
    </Box>
  )
}
