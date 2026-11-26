import { useState } from 'react'
import { usePackVocabulary } from '@/features/profile/hooks/usePackVocabulary'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { DiscoverCandidate, DiscoverScoreFactor, ScoreCriterion } from '@/features/discover/lib/discover-types'
import { groupScoreFactors, SCORE_BLOCKS } from '@/features/discover/lib/discover-score'

/**
 * Un facteur de score / d'adressabilité, ÉTENDU des deux champs additifs que
 * le contrat porte depuis le 09/09 (`packages/contracts/src/schemas/discover.ts`)
 * mais que `discover-types.ts` — un miroir maintenu à la main, hors du
 * périmètre de ce correctif — ne recopie pas encore : voir le rapport du lot.
 * Un objet d'AUJOURD'HUI (sans ces champs) reste parfaitement assignable ici,
 * puisqu'ils sont optionnels — c'est ce qui rend ce composant prêt à afficher
 * la traduction dès que le normaliseur les laissera passer, sans lui-même
 * casser sur ce qui existe déjà.
 */
type ScoreFactorWithKey = DiscoverScoreFactor & {
  label_key?: string
  label_params?: Record<string, string | number>
}

/**
 * Le libellé à afficher : la clé traduite quand `label_key` est là, sinon
 * `label` tel quel. C'est LE repli qui rend inoffensive la fenêtre où le web
 * (Vercel) est déployé et l'IA (Railway) ne l'est pas encore — un candidat
 * produit par l'ancien service n'a pas `label_key`, et cette fonction ne le
 * casse pas : elle rend son français, exactement comme avant ce lot.
 *
 * `defaultValue: factor.label` couvre aussi le cas d'une clé posée par l'IA
 * mais pas (encore) traduite ici : jamais une clé brute affichée à l'écran.
 */
function factorLabel(t: TFunction, factor: Pick<ScoreFactorWithKey, 'label' | 'label_key' | 'label_params'>): string {
  if (!factor.label_key) return factor.label
  return t(factor.label_key, { ...(factor.label_params ?? {}), defaultValue: factor.label })
}

/**
 * #3597.6 — le badge « xx/80 » SEUL, partagé entre la rubrique dépliable
 * ci-dessous et la ligne compacte de /discover (GA-26 : une seule source).
 * Score indisponible → « score indisponible », jamais « 0/100 ».
 */
export function ScoreValueBadge({ score, scoreMax }: { score: number | null; scoreMax: number | null }) {
  const { t } = useTranslation('discover')
  const unavailable = score === null
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        fontFamily: "'Geist Mono', monospace",
        // Un score indisponible n'a pas à porter la couleur d'un score : il
        // s'affiche en neutre, pour ne pas se lire comme une note basse.
        background: unavailable ? 'var(--bg-elevated)' : 'var(--accent-soft-bg)',
        color: unavailable ? 'var(--text-muted)' : 'var(--accent-soft-text)',
        border: `1px solid ${unavailable ? 'var(--border-subtle)' : 'var(--accent-soft-border)'}`,
      }}
    >
      {unavailable ? t('card.scoreUnavailable') : t('card.scoreOutOf', { score, max: scoreMax ?? 100 })}
    </span>
  )
}

/**
 * La CLASSE d'accès (tome 3). Ni un score ni une promesse : « ouvert PROBABLE ».
 * Non estimable se dit aussi — c'est une réponse, et la taire ferait lire
 * l'absence comme une classe A. #3597.6 : réutilisée telle quelle par la ligne.
 */
export function BarrierChip({ barrier }: { barrier: NonNullable<DiscoverCandidate['barrier']> }) {
  const { t } = useTranslation('discover')
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-xs"
      style={{
        background: 'var(--bg-elevated)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      title={t('card.barrierHint')}
    >
      {barrier.measurable && barrier.label && barrier.score !== null
        ? t('card.barrierOutOf', {
            // `barrier.label` est écrit en FRANÇAIS par `access_scoring._class_of` —
            // la classe est un CODE stable (A/B/C/D), traduit par `card.barrierClass.*`.
            label: barrier.access_class ? t(`card.barrierClass.${barrier.access_class}`) : barrier.label,
            score: barrier.score,
          })
        : t('card.barrierUnmeasurable')}
    </span>
  )
}

/**
 * Score + sa rubrique dépliable.
 *
 * L'écran v1 affichait un `X/10` inventé par le LLM dans un badge d'apparence
 * précise. Ici le chiffre n'est jamais montré sans son « comment » : chaque
 * facteur porte son libellé, sa contribution signée et la donnée brute qui la
 * justifie. Un score que le commercial ne peut pas auditer est un score qu'il
 * n'utilisera pas.
 *
 * Et quand il n'y a RIEN à auditer, on ne montre pas de chiffre du tout :
 * `score === null` rend « score indisponible » plutôt qu'un « 0/100 » qui se
 * lirait « ce compte ne vaut rien » alors qu'il signifie « on n'a rien pu
 * mesurer ». Les critères non mesurés sont nommés, pour que le commercial sache
 * quoi renseigner (son profil ESN, une zone) plutôt que de subir un score muet.
 */
export function CandidateScore({
  score,
  scoreMax,
  unmeasured,
  factors,
  addressability,
  barrier,
}: {
  score: number | null
  scoreMax: number | null
  unmeasured: ScoreCriterion[]
  factors: ScoreFactorWithKey[]
  addressability?: Omit<NonNullable<DiscoverCandidate['addressability']>, 'factors'> & {
    factors: (ScoreFactorWithKey & { axis: string })[]
  }
  barrier?: DiscoverCandidate['barrier']
}) {
  const { t } = useTranslation('discover')
  const { context } = usePackVocabulary()
  const [open, setOpen] = useState(false)
  const unavailable = score === null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        // #2740 — SANS `flex-wrap`, ce bouton compressait son dernier libellé
        // (« Voir le détail du score ») à ~56 px sur 3 lignes plutôt que de
        // laisser les badges voisins (déjà `shrink-0`) passer à la ligne.
        className="flex w-full flex-wrap items-center gap-2 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-[color:var(--bg-surface-hover)]"
      >
        <ScoreValueBadge score={score} scoreMax={scoreMax} />
        {/* Le SECOND nombre, côte à côte et jamais additionné (§6.4). « Intérêt
            68/80 · adressabilité 4/20 » dit « parfait, et hors de portée » ;
            un 61 unique ne le dit pas, et c'est ce compte-là qui sortirait en
            tête de liste. */}
        {/* #2613 — la puce n'apparaît QUE si l'accès a été mesuré. Elle disait
            « accès non mesuré » sur une carte de liste ; décision de Louis du
            20/09/2026, on n'écrit pas ce qu'on n'a pas. ⚠️ Ce n'est PAS un
            retour au `?? 0` que le commentaire ci-dessous condamne : l'absence
            disparaît, elle ne se chiffre pas — « accès 0/20 » reste interdit,
            et le tri d'accès lit la valeur, jamais cette puce.
            ⚠️ La règle d'en face ne s'applique pas ici : ce score-là ne porte
            AUCUN axe à énoncer. L'exception SCORE protège les axes d'une note
            AFFICHÉE, pas l'annonce qu'une note manque. */}
        {addressability && addressability.max > 0 && addressability.score !== null && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              fontFamily: "'Geist Mono', monospace",
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
            title={t('card.addressabilityHint')}
          >
            {/* `?? 0` affichait « accès 0/20 » sur une adressabilité NON
                mesurée — c'est-à-dire exactement la lecture que le tome 1
                interdit : « aucun chemin trouvé » au lieu de « je n'ai pas
                pu regarder ». Un 0/20 met le compte en bas du tri d'accès. */}
            {t('card.addressabilityOutOf', { score: addressability.score, max: addressability.max })}
          </span>
        )}
        {/* La CLASSE d'accès (tome 3). Ni un score ni une promesse : « ouvert
            PROBABLE ». Non estimable se dit aussi — c'est une réponse, et la
            taire ferait lire l'absence comme une classe A. */}
        {barrier && <BarrierChip barrier={barrier} />}
        {/* #2740 — le libellé ne rétrécit jamais en dessous de son texte : sans
            `shrink-0 whitespace-nowrap`, il se compressait à ~56 px (3 lignes)
            derrière les badges `shrink-0` ci-dessus. */}
        <span className="shrink-0 whitespace-nowrap text-xs" style={{ color: 'var(--text-ghost)' }}>
          {open ? t('card.scoreFactorsHide') : t('card.scoreFactorsShow')}
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 shrink-0" style={{ color: 'var(--text-ghost)' }} />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" style={{ color: 'var(--text-ghost)' }} />
        )}
      </button>

      {open && (
        <div
          className="mt-2 rounded-md p-2.5"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="mb-1.5 text-xs uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
            {t('card.scoreFactorsTitle')}
          </p>

          {factors.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {unavailable ? t('card.scoreUnavailableHelp', { context }) : t('card.scoreFactorsEmpty')}
            </p>
          ) : (
            /* Groupés par bloc du barème, et non à plat. Un commercial ne lit
               pas « d'où viennent les points » dans une liste de neuf lignes
               indifférenciées ; il le lit dans « accessibilité 14/20 ». Le
               regroupement existait, testé, depuis des mois — sans qu'aucun
               écran ne l'appelle. */
            <div className="space-y-2.5">
              {groupScoreFactors(
                factors,
                // Les blocs que le backend a ÉVALUÉS. Ceux qui n'ont rapporté
                // aucun point s'affichent quand même : sinon le dénominateur du
                // badge ne correspond à rien de visible.
                SCORE_BLOCKS.map(b => b.key).filter(key => !unmeasured.includes(key)),
              ).map(group => (
                <div key={group.key}>
                  <p
                    className="mb-1 flex items-baseline justify-between gap-2 text-xs uppercase tracking-wider"
                    style={{ color: 'var(--text-ghost)' }}
                  >
                    <span>{t(`card.scoreCriteria.${group.key}`, { context })}</span>
                    <span style={{ fontFamily: "'Geist Mono', monospace" }}>
                      {group.max === null
                        ? t('card.scoreBlockTotalNoMax', { points: group.points })
                        : t('card.scoreBlockTotal', { points: group.points, max: group.max })}
                    </span>
                  </p>
                  {group.factors.length === 0 ? (
                    <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                      {t('card.scoreBlockZero')}
                    </p>
                  ) : null}
                  <ul className="space-y-1.5">
                    {group.factors.map((factor, i) => (
                      <li key={`${factor.label}-${i}`} className="flex items-start gap-2">
                        <span
                          className="mt-[1px] w-9 shrink-0 text-right text-xs font-medium"
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            color: factor.points >= 0 ? 'var(--success-soft-text)' : 'var(--danger-soft-text)',
                          }}
                        >
                          {factor.points >= 0 ? `+${factor.points}` : factor.points}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {factorLabel(t, factor)}
                          </span>
                          {factor.evidence && (
                            <span className="block text-xs leading-snug" style={{ color: 'var(--text-ghost)' }}>
                              {factor.evidence}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Ce qui BLOQUE et ce qui OUVRE — les deux colonnes que le tome 3
              dit faire la valeur de l'écran. Un score sans explication est un
              score qu'on subit. */}
          {barrier && (
            <div className="mt-2.5 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="mb-1 text-xs uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
                {t('card.barrierTitle')}
              </p>
              {barrier.measurable ? (
                <>
                  {/* La stratégie par CLASSE (tome 3 §1.4) — quatre phrases
                      statiques, une par classe, sourcées `agent_docs/recomptages/PDF-08.md`
                      (items #33-36). Une classe sans stratégie n'est qu'un badge : le
                      commercial voit « ouvert par une entité » mais pas quoi en faire.
                      `access_class` est `null` quand la barrière n'est pas mesurable —
                      pas de stratégie alors, une estimation n'a pas de classe. */}
                  {barrier.access_class && (
                    <p className="mb-1.5 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-medium" style={{ color: 'var(--text-ghost)' }}>
                        {t('card.barrierStrategyTitle')}
                      </span>{' '}
                      {t(`card.barrierStrategy.${barrier.access_class}`)}
                    </p>
                  )}
                  {blockingProxy(barrier) && (
                    <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      {t('card.barrierBlocks', { evidence: blockingProxy(barrier)?.evidence })}
                    </p>
                  )}
                  {openingProxy(barrier) && (
                    <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      {t('card.barrierOpens', { evidence: openingProxy(barrier)?.evidence })}
                    </p>
                  )}
                  {barrier.corrections.map(correction => (
                    <p key={correction.key} className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      {/* `correction.label` est écrit en FRANÇAIS par
                          `access_scoring.correcting_signals` — traduit ici par son
                          `key` STABLE (`echeance_proche`), déjà transporté par le
                          contrat. Repli sur le libellé brut pour une correction future
                          que ce catalogue ne connaît pas encore. */}
                      {t(`card.corrections.${correction.key}`, correction.label)} — {correction.evidence}
                    </p>
                  ))}
                </>
              ) : (
                <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
                  {t('card.barrierMissing', {
                    proxies: barrier.missing.map(key => t(`card.barrierProxies.${key}`, key)).join(', '),
                  })}
                </p>
              )}
            </div>
          )}

          {/* « Pourquoi tu peux y entrer », sous « pourquoi c'est intéressant ».
              Les deux listes restent SÉPARÉES : les fondre rendrait impossible
              de lire « bon compte, mauvaise porte ». */}
          {addressability && (addressability.factors.length > 0 || addressability.unmeasured.length > 0) && (
            <div className="mt-2.5 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="mb-1.5 text-xs uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
                {t('card.addressabilityTitle')}
              </p>
              <ul className="space-y-1.5">
                {addressability.factors.map((factor, i) => (
                  <li key={`${factor.axis}-${i}`} className="flex items-start gap-2">
                    <span
                      className="mt-[1px] w-9 shrink-0 text-right text-xs font-medium"
                      style={{
                        fontFamily: "'Geist Mono', monospace",
                        color: factor.points > 0 ? 'var(--success-soft-text)' : 'var(--text-muted)',
                      }}
                    >
                      {`+${factor.points}`}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {factorLabel(t, factor)}
                      </span>
                      {factor.evidence && (
                        <span className="block text-xs leading-snug" style={{ color: 'var(--text-ghost)' }}>
                          {factor.evidence}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {addressability.unmeasured.length > 0 && (
                <p className="mt-1.5 text-xs leading-snug" style={{ color: 'var(--text-ghost)' }}>
                  {t('card.addressabilityUnmeasured', {
                    axes: addressability.unmeasured.map(axis => t(`card.addressabilityAxes.${axis}`)).join(', '),
                  })}
                </p>
              )}
            </div>
          )}

          {unmeasured.length > 0 && (
            /* Ce qu'on n'a PAS pu regarder, nommé. Sans cette ligne, un score
               partiel se lit comme un score complet : le commercial croirait
               que le compte a été jugé sur des critères jamais évalués. */
            <div className="mt-2.5 border-t pt-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs leading-snug" style={{ color: 'var(--text-ghost)' }}>
                {t('card.scoreUnmeasured', {
                  criteria: unmeasured.map(key => t(`card.scoreCriteria.${key}`, { context })).join(', '),
                })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Le proxy le plus PÉNALISANT — celui qui explique pourquoi la porte est dure.
 *  Les proxies non mesurés sont écartés : ils ne bloquent rien, on ne les a pas
 *  regardés. */
function blockingProxy(barrier: NonNullable<DiscoverCandidate['barrier']>) {
  const measured = barrier.proxies.filter(proxy => proxy.measurable && proxy.contribution > 0)
  return measured.sort((a, b) => b.contribution - a.contribution)[0] ?? null
}

/** Le proxy le plus FAVORABLE : une contribution négative (la décentralisation)
 *  ou, à défaut, la plus faible — c'est ce qui rend l'entrée possible. */
function openingProxy(barrier: NonNullable<DiscoverCandidate['barrier']>) {
  const measured = barrier.proxies.filter(proxy => proxy.measurable)
  const sorted = [...measured].sort((a, b) => a.contribution - b.contribution)
  const best = sorted[0]
  return best && best.contribution <= 0 ? best : null
}
