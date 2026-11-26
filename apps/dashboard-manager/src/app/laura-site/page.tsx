import { fetchChatbotFunnel, type ChatbotExperimentReading, type ChatbotFunnelReading } from '@/lib/chatbot-funnel'
import { dateEtHeure } from '@/lib/dates'
import { SegmentBar } from '@/ui'
import {
  decrireMediane,
  decrireTaux,
  libelleEtape,
  raisonDeLAbsence,
  segmentsDuTunnel,
} from './_components/funnel.logic'

export const dynamic = 'force-dynamic'

/**
 * #1659 — le tunnel de Laura, en barre segmentée.
 *
 *   Visiteurs → Widget ouvert → Conversation → Qualification atteinte → RDV pris
 *
 * avec le taux de passage entre chaque étape et la médiane du score.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ÉCRAN DE LECTURE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun taux n'est calculé ici : l'API les rend déjà, seuil d'agrégation
 * minimale compris (`chatbot-funnel-stages.ts`). Le choix des phrases vit dans
 * `_components/funnel.logic.ts`, en logique pure et testée. Cette page ne fait
 * que rendre ce qu'elle reçoit — et rendre une absence en PHRASE, jamais en
 * zéro, jamais en tiret muet.
 *
 * ⚠️ AUCUNE DONNÉE NOMINATIVE, ET C'EST TENU EN AMONT. L'unité d'analyse est
 * l'ÉTAPE (doctrine `c64_analytique_produit`) : la charge utile ne porte que des
 * comptes et des identifiants d'étape, ce que vérifie le balayage de
 * `chatbot-funnel.service.spec.ts` sur la réponse ENTIÈRE.
 */

const STEP_LABEL: Record<ChatbotFunnelReading['step'], string> = {
  exposed: 'Widget vu',
  opened: 'Ouvert',
  engaged: 'Première réponse',
  demo: 'Démo cliquée',
  booked: 'Calendly cliqué',
  held: 'RDV tenu',
}

const EXPERIMENT_LABEL: Record<ChatbotExperimentReading['id'], string> = {
  first_message: 'Premier message / First message',
  open_timing: "Moment d'ouverture / Open timing",
}

const VERDICT_LABEL: Record<ChatbotExperimentReading['verdict'], string> = {
  unmeasured: 'non mesuré / unmeasured',
  inconclusive: 'non concluant / inconclusive',
  readable: 'lisible / readable',
}

function pct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)} %`
}

function num(value: number | null): string {
  return value === null ? '—' : String(value)
}

export default async function LauraSitePage(props: { searchParams: Promise<{ period?: string }> }) {
  const searchParams = await props.searchParams
  const period = searchParams.period?.trim() || undefined

  let overview: Awaited<ReturnType<typeof fetchChatbotFunnel>> | null = null
  let error: string | null = null
  try {
    overview = await fetchChatbotFunnel(period)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  /**
   * ⚠️ `stages` et `medianScore` sont des champs NEUFS. Entre le déploiement du
   * back-office et celui de l'API, cette page reçoit une charge utile qui ne les
   * porte pas — et un `for…of` sur `undefined` fait tomber l'écran ENTIER, pas
   * seulement le tunnel. Ce dépôt a déjà payé ce défaut : un champ serveur neuf
   * lu sans garde casse durablement les onglets ouverts. On le DÉTECTE et on le
   * DIT, plutôt que de rendre un tunnel vide qui se lirait « aucun visiteur ».
   */
  const stages = overview && Array.isArray(overview.stages) ? overview.stages : null
  const tunnel = stages ? segmentsDuTunnel(stages) : null

  return (
    <main className="wrap">
      <h1>Laura · Site</h1>
      <p className="subtitle">
        Le tunnel du chatbot public — visiteurs, widget ouvert, conversation, qualification, rendez-vous pris — avec le
        taux de passage entre chaque étape et la médiane du score. Écran de PILOTAGE : tout y est agrégé par étape,
        jamais par personne.
      </p>

      <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', margin: '16px 0' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          Période / Period
          <input
            name="period"
            defaultValue={period ?? '30d'}
            placeholder="30d"
            style={{ width: 120 }}
            aria-label="Période Plausible (ex. 30d, 7d) / Plausible period (e.g. 30d, 7d)"
          />
        </label>
        <button className="btn-sm" type="submit">
          Actualiser / Refresh
        </button>
      </form>

      {error ? (
        <p style={{ color: 'var(--red)' }}>{error}</p>
      ) : !overview ? null : (
        <>
          {!overview.configured ? (
            <p className="muted">
              La mesure n’est pas branchée : <code>PLAUSIBLE_API_KEY</code> ou <code>PLAUSIBLE_SITE_ID</code> ne sont
              pas définies côté API — tout ci-dessous est donc « non mesuré », pas « zéro ». / Measurement isn’t wired:{' '}
              <code>PLAUSIBLE_API_KEY</code> or <code>PLAUSIBLE_SITE_ID</code> aren’t set on the API — so everything
              below reads “unmeasured”, not “zero”.
            </p>
          ) : null}

          <h2 style={{ fontSize: 18 }}>Tunnel</h2>
          {!stages || !tunnel ? (
            <div className="error">
              L’API déployée ne rend pas encore le tunnel à cinq étapes — c’est la fenêtre entre le déploiement du
              back-office et le sien. Ce n’est pas « aucun visiteur » : c’est « la mesure n’est pas encore servie ».
              Recharge dans quelques minutes.
            </div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                Les largeurs comparent les étapes ENTRE ELLES — le dénominateur de la barre est la somme des étapes
                dessinées, pas la population du site. Les taux de passage, eux, sont dans le tableau.
              </p>

              <SegmentBar segments={tunnel.segments} />

              {tunnel.absentes.length > 0 && (
                <ul className="muted" style={{ fontSize: 12, margin: '12px 0 0', paddingLeft: 18 }}>
                  {tunnel.absentes.map(absente => (
                    <li key={absente.libelle}>
                      <strong>{absente.libelle}</strong> — non dessinée : {absente.raison}.
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ overflowX: 'auto', marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Étape</th>
                      <th className="num">Occurrences</th>
                      <th className="num">Sessions distinctes</th>
                      <th>Taux depuis l’étape précédente</th>
                      <th>Part de l’entrée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map(stage => (
                      <tr key={stage.stage}>
                        <td>{libelleEtape(stage.stage)}</td>
                        {stage.measured ? (
                          <>
                            <td className="num">{stage.count}</td>
                            <td className="num">{stage.sessions}</td>
                          </>
                        ) : (
                          <td colSpan={2} style={{ color: 'var(--muted)' }}>
                            non mesuré — {raisonDeLAbsence(stage.unmeasured)}
                          </td>
                        )}
                        <td style={{ color: stage.passRate.kind === 'measured' ? undefined : 'var(--muted)' }}>
                          {decrireTaux(stage.passRate)}
                        </td>
                        <td style={{ color: stage.shareOfEntry.kind === 'measured' ? undefined : 'var(--muted)' }}>
                          {decrireTaux(stage.shareOfEntry)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="label">Médiane du score de qualification</div>
                <div style={{ marginTop: 6 }}>{decrireMediane(overview.medianScore)}</div>
              </div>
            </>
          )}

          <h2 style={{ fontSize: 18, marginTop: 24 }}>Autres jalons observés</h2>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Deux faits que le tunnel ci-dessus ne porte pas : le clic vers la démo, qui n’est pas sur le chemin du
            rendez-vous, et le rendez-vous TENU, que le site ne peut structurellement pas observer.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Jalon</th>
                  <th className="num">Compte</th>
                  <th>Non mesuré</th>
                </tr>
              </thead>
              <tbody>
                {overview.funnel
                  .filter(row => row.step === 'demo' || row.step === 'held')
                  .map(row => (
                    <tr key={row.step}>
                      <td>{STEP_LABEL[row.step]}</td>
                      <td className="num">{num(row.count)}</td>
                      <td style={{ color: 'var(--muted)' }}>
                        {row.unmeasured === 'not_observable'
                          ? 'non observable — rien sur le site ne peut voir cette étape'
                          : row.unmeasured === 'source_unavailable'
                            ? 'source indisponible'
                            : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 18, marginTop: 24 }}>Qualité / Quality</h2>
          <section className="kpi-grid">
            <div className="card">
              <div className="label">Conversations</div>
              <div className="value">{num(overview.quality.conversations)}</div>
            </div>
            <div className="card">
              <div className="label">Handoff humain / Human handoff</div>
              <div className="value">{pct(overview.quality.handoffRate)}</div>
            </div>
            <div className="card">
              <div className="label">Refus / Refusals</div>
              <div className="value">{pct(overview.quality.refusalRate)}</div>
            </div>
            <div className="card">
              <div className="label">Abandon</div>
              <div className="value">{pct(overview.quality.abandonRate)}</div>
            </div>
          </section>

          <h2 style={{ fontSize: 18, marginTop: 24 }}>Essais A/B / A/B experiments</h2>
          <p className="muted" style={{ fontSize: 12 }}>
            Aucun « gagnant » n’est annoncé — seul le meilleur taux OBSERVÉ, et seulement au-dessus du seuil de lecture.
            / No “winner” is ever announced — only the best OBSERVED rate, and only above the read threshold.
          </p>
          {overview.experiments.map(experiment => (
            <div key={experiment.id} className="card" style={{ marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>
                {EXPERIMENT_LABEL[experiment.id]} — <span className="badge">{VERDICT_LABEL[experiment.verdict]}</span>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                Seuil de lecture / Read threshold : {experiment.minExposures} expositions/variante ·{' '}
                {experiment.bestObserved
                  ? `Meilleur taux observé / Best observed rate : ${experiment.bestObserved}`
                  : 'Pas encore lisible / Not readable yet'}
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Variante / Variant</th>
                      <th>Expositions / Exposures</th>
                      <th>Succès / Successes</th>
                      <th>Taux / Rate</th>
                      <th>Manquant / Shortfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experiment.variants.map(variant => (
                      <tr key={variant.variant}>
                        <td>
                          <code>{variant.variant}</code>
                        </td>
                        <td>{num(variant.exposures)}</td>
                        <td>{num(variant.successes)}</td>
                        <td>{pct(variant.rate)}</td>
                        <td>
                          {variant.shortfall === null
                            ? '—'
                            : variant.shortfall === 0
                              ? 'atteint / met'
                              : variant.shortfall}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <p className="muted" style={{ fontSize: 11, marginTop: 16 }}>
            Généré le / Generated at {dateEtHeure(overview.generatedAt)} · période / period {overview.period}
          </p>
        </>
      )}
    </main>
  )
}
