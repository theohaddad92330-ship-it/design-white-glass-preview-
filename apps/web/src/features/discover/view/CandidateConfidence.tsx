import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { dataConfidenceFor } from '@/features/discover/lib/discover-score'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/* ------------------------------------------------------------------ */
/*  #2166.12 — la confiance de la donnée S'AFFICHE ; elle ne part plus  */
/*  seulement dans le CSV.                                             */
/*                                                                     */
/*  `dataConfidence` était calculé côté serveur, exporté par            */
/*  `discover-export.ts:75`… et lu par PERSONNE à l'écran. C'est le     */
/*  motif n°1 de ce dépôt : du code juste que personne n'appelle. On    */
/*  branche, on ne recode pas.                                          */
/*                                                                     */
/*  Deux règles tiennent ce bloc.                                       */
/*                                                                     */
/*  1. **#2613 — une confiance absente ne produit AUCUNE ligne.**        */
/*     Décision de Louis du 20/09/2026 : « on affiche pas ce qu'on a    */
/*     pas […] ça envoie juste un signal négatif à l'user qui est pas   */
/*     utile ». Cette carte est une ligne de LISTE : le bloc entier se  */
/*     tait. Ce qui TIENT toujours : l'absence ne devient pas « 0 » —   */
/*     « on n'a rien pu mesurer » et « la donnée est mauvaise » restent */
/*     deux affirmations opposées, et se taire ne les confond pas ; les */
/*     confondre en écrivant « 0 » condamnerait le compte.              */
/*     ⚠️ Sous un SCORE, l'énoncé des axes non évaluables RESTE         */
/*     (`ScoreWithAxes`) : là, le silence mentirait.                     */
/*  2. **Un chiffre ne se montre pas nu.** Sous le nombre, ce sur quoi  */
/*     il repose, compté et NOMMÉ : les signaux datés, les champs de    */
/*     registre renseignés, les facteurs de score qui portent leur      */
/*     donnée brute. Ce sont des FAITS de la fiche — pas les axes d'un  */
/*     barème, qu'on ne prétend donc pas décomposer.                     */
/*                                                                     */
/*  Et ce n'est PAS une probabilité : « à quel point on en sait quelque */
/*  chose » ne dit rien des chances de vendre. Refusé six fois.          */
/* ------------------------------------------------------------------ */

/**
 * ⚠️ `compact` n'est pas un réglage d'esthétique : la vue LISTE écrit déjà
 * « n signaux datés » sur sa propre ligne, et répéter le même fait sous la même
 * forme à dix centimètres est précisément ce que la loi 4 interdit. En compact,
 * la confiance se réduit donc à ce que la ligne ne dit pas encore : le chiffre
 * et son palier.
 */
export function CandidateConfidence({
  candidate,
  compact = false,
}: {
  candidate: DiscoverCandidate
  compact?: boolean
}) {
  const { t } = useTranslation('discover')
  const { level, datedSignals, registryFields, factorsWithEvidence } = dataConfidenceFor(candidate)
  const score = candidate.dataConfidence

  // #2613 — la confiance non mesurée ne dit RIEN. Pas de titre orphelin, pas
  // de « non mesurée » : la ligne n'existe pas. (Le `0` reste interdit par
  // ailleurs — ici il n'y a tout simplement plus de nombre à écrire.)
  if (score === null) return null

  const facts = [
    { key: 'signals', count: datedSignals },
    { key: 'registry', count: registryFields },
    { key: 'evidence', count: factorsWithEvidence },
  ].filter(fact => fact.count > 0)

  return (
    <div data-testid="candidate-confidence" className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        <ShieldCheck className="h-[11px] w-[11px] shrink-0" aria-hidden="true" />
        <span className="uppercase tracking-wider">{t('confidence.title')}</span>
        <span data-testid="candidate-confidence-score" style={{ color: 'var(--accent-soft-text)' }}>
          {t(`confidence.level.${level}`)}
        </span>
      </p>

      {!compact && facts.length > 0 && (
        <p data-testid="candidate-confidence-facts" className="text-xs" style={{ color: 'var(--text-ghost)' }}>
          {t('confidence.basedOn')} :{' '}
          {facts.map(fact => t(`confidence.facts.${fact.key}`, { count: fact.count })).join(' · ')}
        </p>
      )}
    </div>
  )
}
