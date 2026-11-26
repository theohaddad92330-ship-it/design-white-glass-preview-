import { fetchCosts, type CostOverview } from '@/lib/costs'
import { getLang, makeT } from '@/lib/i18n'
import { Card, CardHeader, EmptyState, KpiTile } from '@/ui'
import { fetchReasoningQuality, type RapportRaisonnement } from './reasoning-quality.client'
import { fetchReplyContestations, type RapportContestations } from './reply-contestations.client'
import { lignesDesPaliers } from './tier-cost.logic'
import { phraseFonctionsRetenues, valeurPartContestee } from './reply-contestations.logic'
import {
  libelleCouche,
  libelleSegment,
  phraseAccord,
  phraseEchantillon,
  valeurGenerique,
  valeurMesure,
} from './reasoning-quality.logic'

export const dynamic = 'force-dynamic'

/**
 * #3223.4 (#3198) — LE RAISONNEMENT COMMERCIAL DE LAURA, mesuré sur le trafic
 * réel : seize taux calculés depuis ce que chaque tour persiste déjà (reçu de
 * connaissance, preuve d'exécution, trace diagnostique), et la liste NOMMÉE de
 * ce que cette trace ne porte pas encore. Les deux derniers (#3223, lot R17) :
 * « correction sans changement de résultat » et « GO sur grand compte sans
 * accès » — le reste de l'épopée que les lots précédents avaient nommé sans
 * le détecteur.
 *
 * Même squelette que `produit/laura-non-compris/page.tsx` (référence visuelle) :
 * titre, sous-titre, mention de confidentialité, tuiles, puis cartes-tableaux.
 *
 * ⚠️ AUCUN ESPACE, AUCUNE PERSONNE, AUCUN MESSAGE : le rapport n'en porte pas.
 * Cet écran vit sous `/produit`, gardé contre tout identifiant d'espace.
 */
export default async function RaisonnementPage() {
  const lang = await getLang()
  const t = makeT(lang)

  let rapport: RapportRaisonnement | null = null
  let erreur: string | null = null
  try {
    rapport = await fetchReasoningQuality()
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  // #2442.10 (lot W9) — lecture à part : une panne ici ne masque pas le reste de l'écran.
  let contestations: RapportContestations | null = null
  let erreurContestations: string | null = null
  try {
    contestations = await fetchReplyContestations()
  } catch (e) {
    erreurContestations = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  // #3861.R2 — coût par palier : lecture à part, une panne ne masque pas le reste de l'écran.
  let couts: CostOverview | null = null
  let erreurCouts: string | null = null
  try {
    couts = await fetchCosts(30)
  } catch (e) {
    erreurCouts = e instanceof Error ? e.message : 'Erreur inconnue'
  }
  const paliers = couts ? lignesDesPaliers(couts.byTier ?? [], lang) : []

  const lignes = rapport
    ? [
        { label: t('reasoningMetricPublicOnly'), mesure: rapport.metrics.publicOnlyRate },
        { label: t('reasoningMetricMarketMemory'), mesure: rapport.metrics.marketMemoryRate },
        { label: t('reasoningMetricIgnoredTools'), mesure: rapport.metrics.ignoredToolsRate },
        { label: t('reasoningMetricBudget'), mesure: rapport.metrics.budgetInterruptedRate },
        { label: t('reasoningMetricAfterBudget'), mesure: rapport.metrics.finalAnswerAfterBudgetRate },
        { label: t('reasoningMetricDataforge'), mesure: rapport.metrics.dataforgeUnavailableRate },
        { label: t('reasoningMetricInternalUnused'), mesure: rapport.metrics.internalSourceUnusedRate },
        { label: t('reasoningMetricCounterAdvice'), mesure: rapport.metrics.counterAdviceRate },
        { label: t('reasoningMetricAlternatives'), mesure: rapport.metrics.alternativesRate },
        { label: t('reasoningMetricNoGoNoAlt'), mesure: rapport.metrics.noGoWithoutAlternativesRate },
        { label: t('reasoningMetricUserCorrection'), mesure: rapport.metrics.userCorrectionRate },
        { label: t('reasoningMetricRerunAfterCorrection'), mesure: rapport.metrics.rerunAfterCorrectionRate },
        { label: t('reasoningMetricFalseSuccess'), mesure: rapport.metrics.falseSuccessRate },
        { label: t('reasoningMetricWrongZero'), mesure: rapport.metrics.wrongZeroRate },
        { label: t('reasoningMetricMarketMemoryUncited'), mesure: rapport.metrics.marketMemoryUncitedRate },
        {
          label: t('reasoningMetricCorrectionWithoutResultChange'),
          mesure: rapport.metrics.correctionWithoutResultChangeRate,
        },
        {
          label: t('reasoningMetricGoLargeAccountWithoutAccess'),
          mesure: rapport.metrics.goLargeAccountWithoutAccessRate,
        },
      ]
    : []

  return (
    <main className="wrap">
      <h1>{t('reasoningTitle')}</h1>
      <p className="subtitle">{t('reasoningSubtitle')}</p>
      <p className="muted">{t('reasoningPrivacy')}</p>

      {erreur ? (
        <Card>
          <EmptyState icon="!" message={`${t('reasoningError')} ${erreur}`} />
        </Card>
      ) : null}

      {rapport ? (
        <>
          <section className="kpi-grid">
            <KpiTile
              label={t('reasoningKpiTurns')}
              value={rapport.turns}
              period={`${rapport.windowDays} ${t('reasoningDays')}`}
            />
          </section>

          <Card>
            <CardHeader title={t('reasoningRatesTitle')} />
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('reasoningColMetric')}</th>
                    <th>{t('reasoningColValue')}</th>
                    <th>{t('reasoningColSample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(ligne => (
                    <tr key={ligne.label}>
                      <td>{ligne.label}</td>
                      <td>{valeurMesure(ligne.mesure, lang)}</td>
                      <td>{phraseEchantillon(ligne.mesure, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('reasoningRouteTitle')} />
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('reasoningColLayer')}</th>
                    <th>{t('reasoningColValue')}</th>
                    <th>{t('reasoningColSample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.sourceRoute.map(couche => (
                    <tr key={couche.layer}>
                      <td>{libelleCouche(couche.layer, lang)}</td>
                      <td>{valeurMesure(couche.measure, lang)}</td>
                      <td>{phraseEchantillon(couche.measure, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('reasoningGenericTitle')} />
            <p className="muted">{t('reasoningGenericBody')}</p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('reasoningColMetric')}</th>
                    <th>{t('reasoningColValue')}</th>
                    <th>{t('reasoningColSample')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{t('reasoningGenericMetric')}</td>
                    <td>{valeurGenerique(rapport.genericRecommendation, lang)}</td>
                    <td>
                      {rapport.genericRecommendation.measure
                        ? phraseEchantillon(rapport.genericRecommendation.measure, lang)
                        : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td>{t('reasoningJudgeAgreement')}</td>
                    <td colSpan={2}>{phraseAccord(rapport.genericRecommendation.judge, lang)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('reasoningContestedTitle')} />
            <p className="muted">{t('reasoningContestedBody')}</p>
            {[
              { titre: t('reasoningContestedBySector'), cellules: rapport.contested.bySector },
              { titre: t('reasoningContestedBySize'), cellules: rapport.contested.bySize },
            ].map(({ titre, cellules }) => (
              <section key={titre}>
                <h3>{titre}</h3>
                {cellules.length === 0 ? (
                  <p className="muted">{t('reasoningContestedEmpty')}</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>{t('reasoningColSegment')}</th>
                          <th>{t('reasoningColValue')}</th>
                          <th>{t('reasoningColSample')}</th>
                          <th>{t('reasoningColWorkspaces')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cellules.map(cellule => (
                          <tr key={cellule.value}>
                            <td>{libelleSegment(cellule.value, lang)}</td>
                            <td>{valeurMesure(cellule.measure, lang)}</td>
                            <td>{phraseEchantillon(cellule.measure, lang)}</td>
                            <td>{cellule.contributingWorkspaces}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </Card>

          <Card>
            <CardHeader title={t('contestTitle')} />
            <p className="muted">{t('contestBody')}</p>
            {erreurContestations ? <p className="muted">{`${t('contestError')} ${erreurContestations}`}</p> : null}
            {contestations ? (
              <>
                {phraseFonctionsRetenues(contestations.withheldTools, contestations.minDistinctReplies, lang) ? (
                  <p className="muted">
                    {phraseFonctionsRetenues(contestations.withheldTools, contestations.minDistinctReplies, lang)}
                  </p>
                ) : null}
                {contestations.byTool.length === 0 ? (
                  <EmptyState message={t('contestEmpty')} />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>{t('contestColTool')}</th>
                          <th>{t('contestColReplies')}</th>
                          <th>{t('contestColFeedbacks')}</th>
                          <th>{t('contestColContested')}</th>
                          <th>{t('contestColCorrected')}</th>
                          <th>{t('contestColShare')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contestations.byTool.map(ligne => (
                          <tr key={ligne.tool}>
                            <td>{ligne.tool}</td>
                            <td>{ligne.replies}</td>
                            <td>{ligne.feedbacks}</td>
                            <td>{ligne.contested}</td>
                            <td>{ligne.corrected}</td>
                            <td>{valeurPartContestee(ligne.contestedShare, lang)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t('tierCostTitle')} />
            <p className="muted">{t('tierCostBody')}</p>
            {erreurCouts ? <p className="muted">{`${t('tierCostError')} ${erreurCouts}`}</p> : null}
            {couts && paliers.length === 0 ? <EmptyState message={t('tierCostEmpty')} /> : null}
            {paliers.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('tierCostColTier')}</th>
                      <th>{t('tierCostColCalls')}</th>
                      <th>{t('tierCostColCost')}</th>
                      <th>{t('tierCostColAvg')}</th>
                      <th>{t('tierCostColLatency')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paliers.map(({ palier, ligne, moyenne }) => (
                      <tr key={ligne.key}>
                        <td>{palier}</td>
                        <td>{ligne.calls}</td>
                        <td>{`${ligne.cost_usd.toFixed(2)} $`}</td>
                        <td>{moyenne === null ? t('tierCostAvgUnknown') : `${moyenne.toFixed(4)} $`}</td>
                        <td>{t('tierCostNotMeasured')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          {/* #3861 (DEC-4036 Q13, Louis 19/10) — le taux de repli IA : le repli mesuré sur le contexte
              persisté, et les replis que la trace ne porte pas, nommés avec leur raison (jamais « 0 % »). */}
          <Card>
            <CardHeader title={t('fallbackTitle')} />
            <p className="muted">{t('fallbackBody')}</p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>{t('reasoningColMetric')}</th>
                    <th>{t('reasoningColValue')}</th>
                    <th>{t('reasoningColSample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.metrics.capabilityFallbackRate ? (
                    <tr>
                      <td>{t('fallbackCapability')}</td>
                      <td>{valeurMesure(rapport.metrics.capabilityFallbackRate, lang)}</td>
                      <td>{phraseEchantillon(rapport.metrics.capabilityFallbackRate, lang)}</td>
                    </tr>
                  ) : null}
                  {(rapport.fallbackNotMeasured ?? []).map(absente => (
                    <tr key={absente.metric}>
                      <td>{absente.metric}</td>
                      <td colSpan={2}>{`${lang === 'fr' ? 'Non mesuré' : 'Not measured'} — ${absente.reason}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('reasoningNotMeasuredTitle')} />
            <p className="muted">{t('reasoningNotMeasuredBody')}</p>
            <ul>
              {rapport.notMeasured.map(absente => (
                <li key={absente.metric}>
                  <strong>{absente.metric}</strong> — {absente.reason}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </main>
  )
}
