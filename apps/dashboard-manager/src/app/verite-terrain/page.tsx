import type { CSSProperties } from 'react'
import { Card, CardHeader, KpiTile } from '@/ui'
import {
  fetchGroundTruthJudgments,
  fetchGroundTruthMetrics,
  MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES,
  type MarketMemoryGroundTruthJudgment,
  type MarketMemoryGroundTruthMetrics,
} from '@/lib/market-memory-ground-truth'
import { formatMetricFooter, formatMetricValue, LABEL_CAPTIONS, METRIC_CAPTIONS } from './verite-terrain.logic'
import { JudgeForm } from './_components/judge-form'

export const dynamic = 'force-dynamic'

/**
 * #1622, plus la télémétrie de #1639.3 — L'OUTILLAGE DE VÉRITÉ TERRAIN DE LA
 * MÉMOIRE MARCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION QUE CET ÉCRAN ASSUME
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis a tranché de construire cet outillage MÊME SI le corpus reste vide
 * tant que personne n'a jugé de cas à la main. Les six tuiles ci-dessous
 * s'affichent donc très probablement toutes « non mesuré » au premier
 * déploiement — c'est la VÉRITÉ du corpus, pas un défaut d'affichage : une
 * mesure impossible ne dit jamais « tout va bien » (voir `verite-terrain.logic.ts`
 * et la garde GA-285).
 *
 * `MARKET_MEMORY_SCORING_ENABLED` (GA-257) n'est touché nulle part ici : ce
 * jeu de vérité MESURE la mémoire marché, il ne décide rien à sa place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1639.3 — LA TÉLÉMÉTRIE DE PRÉFILTRE PAYANT N'EST PAS SUR CET ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_prefilter_used` / `paid_calls_avoided` / `paid_verification_triggered`
 * / `market_candidates_before/after` supposent un chemin de production qui
 * décide « je n'appelle pas un fournisseur payant parce que la mémoire marché
 * a déjà répondu ». Ce chemin N'EXISTE PAS aujourd'hui (aucun module
 * d'enrichissement de contact n'importe `MarketMemoryService` — vérifié par
 * balayage du code le 11/09/2026). Poser ces quatre compteurs sans point de
 * comptage réel serait exactement la métrique ESTIMÉE que ce dépôt refuse
 * (« ne l'estime pas », #1639.3). Voir le rapport du lot pour le détail.
 */
export default async function VeriteTerrainPage() {
  let metrics: MarketMemoryGroundTruthMetrics | null = null
  let judgments: MarketMemoryGroundTruthJudgment[] | null = null
  let erreur: string | null = null

  try {
    ;[metrics, judgments] = await Promise.all([fetchGroundTruthMetrics(), fetchGroundTruthJudgments()])
  } catch (err) {
    erreur = err instanceof Error ? err.message : String(err)
  }

  return (
    <main className="wrap">
      <h1>Vérité terrain — mémoire marché</h1>
      <p className="subtitle">
        20 comptes connus, 10 ESN connues, 5-10 consultants réels — jugés à la main. Sous 20 jugements courants, une
        métrique ne s’affiche jamais en pourcentage.
      </p>

      {erreur ? (
        <div className="error">
          Impossible de joindre l&apos;endpoint admin de l&apos;API.
          <br />
          {erreur}
        </div>
      ) : (
        <>
          <section
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}
          >
            {MARKET_MEMORY_GROUND_TRUTH_METRIC_NAMES.map(name => {
              const result = metrics![name]
              return (
                <KpiTile
                  key={name}
                  label={METRIC_CAPTIONS[name]}
                  value={formatMetricValue(result)}
                  period={formatMetricFooter(result)}
                />
              )
            })}
          </section>

          <div style={{ marginBottom: 24 }}>
            <Card>
              <CardHeader title="Juger un cas" />
              <div style={{ padding: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
                  Une ESN, un compte, la lecture de la mémoire marché, un verdict.
                </p>
                <JudgeForm />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Jugements courants" />
            <div style={{ padding: 16, overflowX: 'auto' }}>
              {/* GA-19 : « 0 cas jugé(s) » pendant le chargement serait un zéro de
                  CHARGEMENT lu comme un zéro de MESURE — le défaut exact que le
                  cliquet garde. Tant que la liste n'est pas revenue, on ne compte
                  rien ; une liste revenue VIDE, elle, dit bien zéro. */}
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
                {judgments ? `${judgments.length} cas jugé(s)` : 'Jugements non encore chargés'}
              </p>
              {judgments && judgments.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={cellStyle}>Compte</th>
                      <th style={cellStyle}>ESN</th>
                      <th style={cellStyle}>Lecture</th>
                      <th style={cellStyle}>Verdict</th>
                      <th style={cellStyle}>Jugé par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {judgments.map(judgment => (
                      <tr key={judgment.id}>
                        <td style={cellStyle}>{judgment.case.accountName}</td>
                        <td style={cellStyle}>{judgment.case.esnName}</td>
                        <td style={cellStyle}>
                          {judgment.reading.hadReading ? `rang ${judgment.reading.rank}` : 'non observée'}
                        </td>
                        <td style={cellStyle}>{LABEL_CAPTIONS[judgment.label]}</td>
                        <td style={cellStyle}>{judgment.judgedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Aucun cas jugé pour l’instant.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </main>
  )
}

const cellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottom: '1px solid var(--border)',
}
