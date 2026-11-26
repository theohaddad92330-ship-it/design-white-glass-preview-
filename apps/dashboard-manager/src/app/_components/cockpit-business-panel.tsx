import { Card, CardHeader, EmptyState, KpiTile } from '@/ui'
import { LineChart, WaterfallChart } from '@/app/_components/charts'
import {
  fetchBusinessMetrics,
  fetchMonthlyMovements,
  type BusinessMetricsOverview,
  type MonthlyClientMovement,
} from '@/lib/business-metrics'
import { fetchBellumMargin, type BellumMargin } from '@/lib/costs'
import { fetchAnalysesHeatmap, type AnalysesHeatmapPayload } from '@/lib/monitoring'
import { fetchDecisionQueue, type DecisionQueueReport } from '@/lib/decision-queue'
import { AnalysesHeatmap } from '@/app/monitoring/_components/analyses-heatmap'
import { DecisionQueueBlock } from '@/app/monitoring/_components/decision-queue-block'
import { jour } from '@/lib/dates'
import {
  etapesDuMois,
  formaterEuros,
  libelleMois,
  periodeDeLaSerie,
  seriesDuGraphique,
} from '@/app/revenus/revenus.logic'
import {
  LIBELLES_MOUVEMENT,
  ligneMouvementAffichee,
  messageMouvementsVides,
  tuileAttrition,
  tuileBurn,
  tuileClients,
  tuileMarge,
  tuileMrr,
  tuileRunway,
} from './cockpit-business.logic'
import styles from './cockpit-business.module.css'

/**
 * LE COCKPIT BUSINESS — l'état de BellumAI en un écran (#1646).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST RÉUTILISÉ TEL QUEL, ET CE QUI EST NEUF
 * ─────────────────────────────────────────────────────────────────────────────
 *  · Les SIX TUILES (#1646.1) mettent en forme des chiffres qui existaient déjà
 *    ailleurs — voir le docblock de `cockpit-business.logic.ts`.
 *  · Le WATERFALL et la COURBE 12 MOIS (#1646.2) sont EXACTEMENT ceux de
 *    `/revenus` (`WaterfallChart` + `etapesDuMois`, `LineChart` +
 *    `seriesDuGraphique`) — importés, jamais réécrits — simplement posés CÔTE
 *    À CÔTE au lieu d'empilés verticalement.
 *  · La FILE DE DÉCISION et la HEATMAP (#1646.3) sont `DecisionQueueBlock` et
 *    `AnalysesHeatmap`, déplacées ici EN IMPORT depuis `/monitoring` — leurs
 *    propres docblocks annonçaient ce déménagement depuis #1647 et #1650.
 *    ⚠️ Elles restent AUSSI rendues dans `monitoring/_components/cockpit-panel.tsx`
 *    (`/monitoring?view=cockpit`) : ce fichier est hors du périmètre de ce lot
 *    (voir CLAUDE.md, section fichiers), donc le doublon n'est pas retiré ici —
 *    à faire par l'intégrateur.
 *  · Le TABLEAU DES MOUVEMENTS PAR CLIENT (#1646.6) lit désormais un endpoint
 *    RÉEL — `GET internal/admin/business-metrics/movements/:month`
 *    (`BusinessMetricsService.monthlyClientMovements`, qui compare deux
 *    `business_metric_snapshot_lines` au niveau ligne et joint le nom de
 *    l'espace au sujet facturé). #1646.4 l'annonçait « non mesurable ici » —
 *    ce n'est plus vrai, voir `cockpit-business.logic.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES TUILES FINANCIÈRES SE FERMENT AU RÔLE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * MRR, marge, burn et runway sont EXACTEMENT la classe de données que
 * `ECRANS_PROPRIETAIRE` ferme sur `/revenus` et `/revenus/tresorerie`
 * (`src/lib/roles.ts`, middleware). Les poser sur `/` SANS vérifier le rôle
 * ouvrirait le chiffre d'affaires de l'entreprise à `operator` et `viewer` par
 * un simple changement de route — une régression d'accès que rien n'aurait
 * demandée. `middleware.ts` et `roles.ts` sont hors du périmètre de ce lot
 * (fichiers interdits), donc le filtre se pose ICI, au niveau de la page, avec
 * le MÊME mécanisme que `audit/page.tsx` (`operateurDepuisJeton` + `peut(...,
 * 'treasury.read')`) plutôt qu'un nouveau chemin de vérification — la capacité
 * `treasury.read` existe déjà et nomme exactement cette classe de données.
 * `estProprietaire` est calculé dans `page.tsx` et passé ici en PROP : ce
 * composant ne relit pas la session lui-même.
 */
export async function CockpitBusinessPanel({ estProprietaire }: { estProprietaire: boolean }) {
  // #1647 / #1650 — lancées AVANT tout `await` pour que les lectures se
  // recouvrent, exactement comme `monitoring/_components/cockpit-panel.tsx`.
  // Une panne est capturée ICI : elle ne doit ni couler le cockpit, ni se
  // rendre comme « rien à décider »/« semaine sans analyse ».
  const grilleLancements: Promise<{ payload: AnalysesHeatmapPayload | null; erreur: string | null }> =
    fetchAnalysesHeatmap().then(
      payload => ({ payload, erreur: null }),
      (err: unknown) => ({ payload: null, erreur: err instanceof Error ? err.message : String(err) }),
    )
  const fileDeDecision: Promise<{ rapport: DecisionQueueReport | null; erreur: string | null }> =
    fetchDecisionQueue().then(
      rapport => ({ rapport, erreur: null }),
      (err: unknown) => ({ rapport: null, erreur: err instanceof Error ? err.message : String(err) }),
    )

  let donnees: BusinessMetricsOverview | null = null
  let margeData: BellumMargin | null = null
  let panneFinance: string | null = null
  let panneMarge: string | null = null

  // Les deux lectures financières ne partent QUE pour un propriétaire — un
  // rôle qui n'y a pas droit ne doit même pas déclencher l'appel.
  if (estProprietaire) {
    const [resultatMetrics, resultatMarge] = await Promise.allSettled([fetchBusinessMetrics(), fetchBellumMargin(30)])
    if (resultatMetrics.status === 'fulfilled') donnees = resultatMetrics.value
    else panneFinance = messageDe(resultatMetrics.reason)
    if (resultatMarge.status === 'fulfilled') margeData = resultatMarge.value
    else panneMarge = messageDe(resultatMarge.reason)
  }

  const dernier = donnees?.series[donnees.series.length - 1] ?? null
  const calculeLe = dernier ? jour(dernier.computedAt) : jour(new Date().toISOString())

  // #1646.6 — lancée avec les deux autres lectures indépendantes, pour le même
  // recouvrement. Réservée au propriétaire ET à un mois déjà figé : sans mois
  // figé, il n'y a rien à comparer et l'appel serait un aller-retour pour rien.
  const mouvementsDuMois: Promise<{ lignes: MonthlyClientMovement[]; erreur: string | null }> =
    estProprietaire && dernier
      ? fetchMonthlyMovements(dernier.month).then(
          lignes => ({ lignes, erreur: null }),
          (err: unknown) => ({ lignes: [], erreur: err instanceof Error ? err.message : String(err) }),
        )
      : Promise.resolve({ lignes: [], erreur: null })

  const [heatmap, decisions, mouvements] = await Promise.all([grilleLancements, fileDeDecision, mouvementsDuMois])
  const messageMouvements = messageMouvementsVides(dernier, mouvements.lignes)

  return (
    <>
      {/* #1646.1 — six tuiles : MRR, clients, taux d'attrition, marge, burn, runway. */}
      {!estProprietaire ? (
        <Card className={styles['reserve']}>
          <CardHeader title="Indicateurs business — réservés au propriétaire" />
          <p className="subtitle" style={{ margin: 0 }}>
            MRR, clients, taux d’attrition, marge, burn et runway sont réservés au rôle « propriétaire », comme sur
            /revenus et /revenus/tresorerie. Ce qui demande une décision et le volume d’analyses, ci-dessous, reste
            ouvert à ton rôle.
          </p>
        </Card>
      ) : !donnees ? (
        <div className="error" style={{ marginBottom: 16 }}>
          Indicateurs business indisponibles — l’API n’a pas répondu. {panneFinance}
        </div>
      ) : (
        <>
          <section className={styles['tuiles']} aria-label="Indicateurs business">
            <KpiTile {...tuileMrr(donnees.current, dernier)} />
            <KpiTile {...tuileClients(donnees.current, dernier)} />
            <KpiTile {...tuileAttrition(donnees.series)} />
            <KpiTile {...tuileMarge(margeData, panneMarge)} />
            <KpiTile {...tuileBurn(donnees.treasury)} />
            <KpiTile {...tuileRunway(donnees.treasury)} />
          </section>

          {/* #1646.2 — le waterfall du MRR et la courbe multi-séries, CÔTE À CÔTE. */}
          <section className={styles['graphiques']}>
            <Card>
              <CardHeader
                title={dernier ? `Décomposition de ${libelleMois(dernier.month)}` : 'Décomposition du mois'}
              />
              {dernier ? (
                <WaterfallChart
                  steps={etapesDuMois(dernier)}
                  period={libelleMois(dernier.month)}
                  asOf={calculeLe}
                  format={valeur => formaterEuros(valeur)}
                />
              ) : (
                <p className="subtitle" style={{ margin: 0 }}>
                  Aucun mois figé — la décomposition apparaîtra au premier instantané, sur /revenus.
                </p>
              )}
            </Card>
            <Card>
              <CardHeader title="Douze mois de MRR" />
              {donnees.series.length > 0 ? (
                <LineChart
                  series={seriesDuGraphique(donnees.series)}
                  period={periodeDeLaSerie(donnees.series)}
                  asOf={calculeLe}
                  format={valeur => formaterEuros(valeur)}
                />
              ) : (
                <p className="subtitle" style={{ margin: 0 }}>
                  Aucun mois figé — la série commencera au premier instantané, sur /revenus.
                </p>
              )}
            </Card>
          </section>
        </>
      )}

      {/* #1646.3 — ce qui demande une décision, et quand le produit est utilisé.
          Réutilisées TELLES QUELLES : mêmes composants, mêmes chargeurs. */}
      <DecisionQueueBlock rapport={decisions.rapport} erreur={decisions.erreur} />
      <AnalysesHeatmap payload={heatmap.payload} erreur={heatmap.erreur} />

      {/* #1646.6 — les mouvements par client du dernier mois figé. */}
      {estProprietaire ? (
        <section className={styles['mouvements']}>
          <Card>
            <CardHeader title={dernier ? `Mouvements de ${libelleMois(dernier.month)}` : 'Mouvements du mois'} />
            {mouvements.erreur ? (
              <div className="error" style={{ margin: 0 }}>
                Mouvements indisponibles — l’API n’a pas répondu. {mouvements.erreur}
              </div>
            ) : messageMouvements ? (
              <EmptyState message={messageMouvements} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Montant</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.lignes.map((mouvement, index) => {
                      const ligne = ligneMouvementAffichee(mouvement)
                      return (
                        <tr key={`${ligne.client}-${ligne.nature}-${index}`}>
                          <td>{ligne.client}</td>
                          <td>{LIBELLES_MOUVEMENT[ligne.nature]}</td>
                          <td className="num">{ligne.montant}</td>
                          <td>{ligne.date}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      ) : null}
    </>
  )
}

function messageDe(raison: unknown): string {
  return raison instanceof Error ? raison.message : String(raison)
}
