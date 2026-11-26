import { Card, CardHeader, KpiTile, Stat } from '@/ui'
import { LineChart, WaterfallChart } from '@/app/_components/charts'
import { fetchBusinessMetrics, type BusinessMetricsOverview } from '@/lib/business-metrics'
import { jour } from '@/lib/dates'
import { SnapshotPanel } from './_components/snapshot-panel'
import {
  REPERES,
  controleDuSolde,
  etapesDuMois,
  formaterEuros,
  libelleMois,
  metriquesDerivees,
  moisDe,
  periodeDeLaSerie,
  seriesDuGraphique,
  totalToutesSources,
} from './revenus.logic'

/**
 * REVENUS — le MRR de BellumAI, décomposé (#1651).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE BLOCS, ET CE QU'ILS REFUSENT DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **La décomposition du dernier mois figé** — début, nouveau, expansion,
 *     contraction, churn, fin. Le contrôle du solde est AFFICHÉ : la somme des
 *     composantes doit valoir `mrrEnd` exactement (T2), et le jour où elle ne le
 *     vaudra plus, l'écran le dira plutôt que de dessiner un graphique qui
 *     n'arrive pas sur sa dernière barre.
 *  2. **La série 12 mois** — cinq lignes. Un mois sans mouvement mesuré fait un
 *     TROU, jamais une ligne droite entre deux points connus.
 *  3. **Les métriques dérivées, avec leur repère de marché SOURCÉ.** Aucun
 *     repère inventé (T3) : ARPA et LTV n'en ont pas, donc ils n'en affichent
 *     pas. Et la LTV n'existe pas sous six mois de churn OBSERVÉ (T1) — sous
 *     cette barre, elle mentirait avec assurance.
 *  4. **Les revenus contractés**, à CÔTÉ et jamais additionnés au MRR sans une
 *     ligne qui dit ce que le total contient et ce qu'il laisse dehors.
 *
 * ⚠️ Tout ce qui se calcule ici se calcule sur les mois FIGÉS, jamais sur la
 * position du moment : un mois en cours est incomplet par construction, et une
 * rétention calculée le 3 du mois dirait toujours que tout va bien.
 *
 * ⚠️ L'écran est MINCE À DESSEIN : chaque décision — le signe d'un mouvement, le
 * refus d'une métrique, la phrase d'un refus — vit dans `revenus.logic.ts`, où
 * elle est testée. Ici il ne reste que du placement.
 *
 * ⚠️ Écran RÉSERVÉ AU PROPRIÉTAIRE (`ECRANS_PROPRIETAIRE`, middleware) : c'est
 * le chiffre d'affaires de l'entreprise. `/revenus/clients` est la seule
 * exception de la section, et elle est nommée dans `lib/roles.ts`.
 */
export const dynamic = 'force-dynamic'

/** L'espace entre deux blocs, écrit une fois. */
const BLOC = { margin: '0 0 20px' } as const
const LIGNE = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 1fr) minmax(90px, auto) minmax(0, 2fr)',
  gap: 12,
  padding: '6px 0',
  borderTop: '1px solid var(--border)',
  fontSize: 13,
} as const

export default async function RevenusPage() {
  const moisCourant = moisDe(new Date())

  let donnees: BusinessMetricsOverview | null = null
  let panne: string | null = null
  try {
    donnees = await fetchBusinessMetrics()
  } catch (err) {
    // ⚠️ Une panne d'API n'affiche PAS des zéros : elle se dit. Un « 0 € » ici
    // serait indiscernable d'une entreprise sans revenus.
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!donnees) {
    return (
      <main className="wrap">
        <h1>Revenus</h1>
        <p className="subtitle">
          Le MRR de BellumAI, décomposé mois par mois : ce qui entre, ce qui grossit, ce qui se rétracte et ce qui part.
          Réservé au propriétaire — c’est le chiffre d’affaires de l’entreprise.
        </p>
        <div className="error" style={{ margin: '16px 0' }}>
          Chiffres indisponibles — l’API n’a pas répondu. {panne}
        </div>
      </main>
    )
  }

  const { series, current } = donnees
  const dernier = series[series.length - 1] ?? null
  const metriques = metriquesDerivees(series)
  const total = totalToutesSources(current)
  const calculeLe = dernier ? jour(dernier.computedAt) : '—'

  // Les repères RÉELLEMENT cités par une métrique de cet écran. Le pied de page
  // ne liste que ceux-là : un repère affiché sans métrique en face n'aide
  // personne, et un repère sans source est refusé par construction (T3).
  const reperesCites = [...new Set(metriques.map(metrique => metrique.repere))].filter(
    (cle): cle is keyof typeof REPERES => cle !== null,
  )

  return (
    <main className="wrap">
      <h1>Revenus</h1>
      <p className="subtitle">
        Le MRR de BellumAI, décomposé mois par mois : ce qui entre, ce qui grossit, ce qui se rétracte et ce qui part.
        Tout se calcule sur les mois FIGÉS — un mois en cours est incomplet, et une rétention calculée le 3 du mois
        dirait toujours que tout va bien. Réservé au propriétaire.
      </p>

      {/* ── BLOC 1 — la décomposition du mois ────────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title={dernier ? `Décomposition de ${libelleMois(dernier.month)}` : 'Décomposition du mois'} />
          {!dernier ? (
            <p className="subtitle" style={{ margin: 0 }}>
              Aucun mois figé. La décomposition apparaîtra au premier instantané — elle ne s’invente pas à partir de la
              position du moment, qui bouge à chaque changement d’offre.
            </p>
          ) : (
            <>
              <WaterfallChart
                steps={etapesDuMois(dernier)}
                period={libelleMois(dernier.month)}
                asOf={calculeLe}
                format={valeur => formaterEuros(valeur)}
              />
              <div style={{ marginTop: 16 }}>
                <Mouvement
                  libelle="MRR début"
                  montant={dernier.mrrStartCents}
                  note={compteClients(dernier.customersStart, 'client')}
                />
                <Mouvement
                  libelle="+ Nouveau"
                  montant={dernier.mrrNewCents}
                  note={compteClients(dernier.customersNew, 'arrivée')}
                />
                <Mouvement
                  libelle="+ Expansion"
                  montant={dernier.mrrExpansionCents}
                  note="montée d’offre ou postes ajoutés"
                />
                <Mouvement
                  libelle="− Contraction"
                  montant={dernier.mrrContractionCents}
                  note="descente d’offre ou postes retirés"
                />
                <Mouvement
                  libelle="− Churn"
                  montant={dernier.mrrChurnedCents}
                  note={compteClients(dernier.customersChurned, 'départ')}
                />
                <Mouvement
                  libelle="= MRR fin"
                  montant={dernier.mrrEndCents}
                  note={compteClients(dernier.customersEnd, 'client')}
                />
              </div>
              <p className="subtitle" style={{ margin: '12px 0 0', maxWidth: '70ch' }}>
                {phraseDuSolde(controleDuSolde(dernier))}
              </p>
            </>
          )}
        </Card>
      </section>

      {/* ── BLOC 2 — la série 12 mois ────────────────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Douze mois de MRR" />
          {series.length === 0 ? (
            <p className="subtitle" style={{ margin: 0 }}>
              Aucun mois figé. La série commencera au premier instantané, et son MRR de début sera « — », pas 0 : on ne
              mesurait rien avant.
            </p>
          ) : (
            <>
              <LineChart
                series={seriesDuGraphique(series)}
                period={periodeDeLaSerie(series)}
                asOf={calculeLe}
                format={valeur => formaterEuros(valeur)}
              />
              <p className="subtitle" style={{ margin: '12px 0 0', maxWidth: '70ch' }}>
                « Contraction » et « Churn » sont des montants RETIRÉS, tracés en valeur absolue : une ligne qui
                plongerait sous zéro se lirait comme un MRR négatif. Un mois sans mouvement mesuré COUPE la ligne — le
                trou est visible parce qu’il est vrai.
              </p>
            </>
          )}
        </Card>
      </section>

      {/* ── BLOC 3 — les métriques dérivées et leurs repères ─────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Métriques dérivées" />
          <div className="cards" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}>
            {metriques.map(metrique => (
              <KpiTile
                key={metrique.cle}
                label={metrique.label}
                // ⚠️ `null` rend « — ». Une rétention absente affichée « 0 % »
                // ferait croire à la faillite ; la raison est juste en dessous.
                value={metrique.valeur.mesure ? metrique.valeur.texte : null}
                period={metrique.valeur.mesure ? metrique.definition : metrique.valeur.raison}
              />
            ))}
          </div>
          <div>
            {metriques.map(metrique => (
              <div key={metrique.cle} style={LIGNE}>
                <span style={{ color: 'var(--muted)' }}>{metrique.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {metrique.valeur.mesure ? metrique.valeur.texte : '—'}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {metrique.repere === null
                    ? 'Aucun repère de marché sourcé — on n’en invente pas.'
                    : `Repère : ${REPERES[metrique.repere].valeur} (${REPERES[metrique.repere].source})`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── BLOC 4 — les revenus contractés ──────────────────────────────── */}
      <section style={BLOC}>
        <Card>
          <CardHeader title="Revenus contractés (clients sur facture)" />
          <p className="subtitle" style={{ margin: '0 0 12px', maxWidth: '70ch' }}>
            Un client sur facture n’entre JAMAIS dans le MRR : son engagement n’est pas un abonnement récurrent, et le
            mélanger gonflerait un chiffre qui sert à décider. Les deux sont donc comptés à part, ici.
          </p>
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <Stat label="Revenu contracté (mensuel)" value={formaterEuros(current.contractedRevenueCents)} />
            <Stat label="Clients sur facture" value={current.contractedCustomers} />
            <Stat label="Ponctuel facturé" value={formaterEuros(current.oneOffCents)} />
            <Stat label="Contrats ponctuels" value={current.oneOffCustomers} />
          </div>
          <p className="subtitle" style={{ margin: 0, maxWidth: '70ch' }}>
            {total.phraseTotal}
          </p>
          <p className="subtitle" style={{ margin: '4px 0 0', maxWidth: '70ch' }}>
            {total.phraseNonRecurrent}
          </p>
        </Card>
      </section>

      {/* Le bandeau de #1645, arrivé ici depuis /revenus/tresorerie. */}
      <SnapshotPanel series={series} current={current} moisCourant={moisCourant} />

      {/* ── Le pied de page des repères — T3 : aucun repère sans source ─── */}
      <footer style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Repères de marché — d’où ils viennent</h2>
        <p className="subtitle" style={{ margin: '0 0 8px', maxWidth: '70ch' }}>
          Un repère sans source est une opinion, et un repère sans date en devient une au bout de deux ans. Ceux-ci sont
          les seuls affichés sur cet écran : quand une métrique n’a pas de repère sourcé, elle n’en affiche aucun.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)', fontSize: 13, maxWidth: '70ch' }}>
          {reperesCites.map(cle => (
            <li key={cle} style={{ marginBottom: 4 }}>
              {REPERES[cle].valeur} — {REPERES[cle].source},{' '}
              {REPERES[cle].date ?? 'année non précisée par la source fournie'}.
            </li>
          ))}
        </ol>
      </footer>
    </main>
  )
}

/** Une ligne de la décomposition : le libellé, le montant, ce qu'il compte. */
function Mouvement({ libelle, montant, note }: { libelle: string; montant: number | null; note: string }) {
  return (
    <div style={LIGNE}>
      <span style={{ color: 'var(--muted)' }}>{libelle}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formaterEuros(montant)}</span>
      <span style={{ color: 'var(--muted)' }}>{note}</span>
    </div>
  )
}

/** « 15 clients », « — » quand le compte n'est pas mesuré. Jamais « 0 client ». */
function compteClients(combien: number | null, nom: string): string {
  if (combien == null) return '—'
  return `${combien} ${nom}${combien > 1 ? 's' : ''}`
}

/**
 * Ce que le contrôle du solde DIT à l'écran — T2 de #1651, rendu visible plutôt
 * que seulement testé. Un invariant qu'on ne montre pas est un invariant dont
 * personne ne saura le jour où il cassera.
 */
function phraseDuSolde(solde: ReturnType<typeof controleDuSolde>): string {
  if (solde.etat === 'sans_comparaison') {
    return 'Premier mois figé de la série : il n’a pas de mois précédent, donc aucun mouvement à décomposer. Ce n’est pas un mois sans mouvement, c’est un mois sans terme de comparaison — et « 0 € » mentirait.'
  }
  if (solde.etat === 'exact') {
    return `Contrôle : début + nouveau + expansion − contraction − churn = ${formaterEuros(solde.cents)}, exactement le MRR de fin du mois figé.`
  }
  return `⚠️ Écart de ${formaterEuros(solde.ecartCents)} : la somme des composantes vaut ${formaterEuros(solde.calculeCents)}, le mois figé porte ${formaterEuros(solde.figeCents)}. Un instantané ne se recalcule jamais — c’est une reprise de données à examiner, pas un défaut d’affichage.`
}
