import type { SourceHealthReport, SourceState, SourceStatus } from '@/lib/telemetry'
import { dateEtHeure } from '@/lib/dates'

// Backoffice — « quelle source, depuis quand, avec quelle cause ».
//
// Les dégradations étaient déjà relevées côté IA (`record_degradation`) mais rien
// ne les agrégeait : on apprenait qu'une brique était HS en ouvrant un dossier
// vide. Ce panneau est la lecture de `analysis_runs.source_health`.
//
// Trois règles de justesse le gouvernent, et elles priment sur la lisibilité :
//
//  1. « aucune donnée » ≠ « source HS ». Seule une dégradation ENREGISTRÉE
//     (exception, refus, non-2xx) colore une ligne. Une entreprise qui ne recrute
//     pas ne rend pas France Travail rouge.
//  2. Le silence n'est pas la santé. Sans run dans la fenêtre, l'écran dit
//     « inconnu » — jamais « opérationnel ».
//  3. Pas d'historique inventé. « Depuis » sort d'horodatages de runs réels ; quand
//     la série atteint le bord de la fenêtre on écrit « au moins depuis ».

const STATE_LABEL: Record<SourceState, string> = {
  ok: 'OK',
  degraded: 'Dégradée',
  down: 'HS',
  unknown: 'Inconnu',
}

// `.badge.completed` = vert, `.badge.error` = rouge, `.badge.analyzing` = neutre
// (globals.css) — réutilisés tels quels, aucun CSS nouveau.
const STATE_BADGE: Record<SourceState, string> = {
  ok: 'completed',
  degraded: 'error',
  down: 'error',
  unknown: 'analyzing',
}

// Vocabulaire `DegradeReason` partagé avec l'IA (company_filters.py). Traduit
// ici, jamais réécrit côté IA : le code machine reste stable, la phrase change.
const CODE_LABEL: Record<string, string> = {
  missing_api_key: 'clé API absente',
  unauthorized: 'jeton refusé',
  quota_exceeded: 'quota épuisé',
  rate_limited: 'rate limit',
  upstream_error: 'erreur du fournisseur',
  network_error: 'panne réseau',
  invalid_response: 'réponse illisible',
  empty_query: 'requête vide',
  unsupported_filters: 'filtres non supportés',
}

function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.floor(hours / 24)} j`
}

/** Depuis quand la source est en panne. Rend l'incertitude explicite quand la
 *  série de runs dégradés atteint le bord de la fenêtre : l'incident peut être
 *  plus vieux que tout ce qu'on observe. */
function since(row: SourceStatus, now: number): string {
  if (!row.degradedSince) return '—'
  const prefix = row.degradedSinceIsWindowEdge ? 'au moins ' : ''
  return `${prefix}${ago(row.degradedSince, now)}`
}

/** La cause : le code traduit quand il a été classé, sinon le détail brut. On
 *  n'affiche jamais « erreur inconnue » à la place d'un texte qu'on possède. */
function cause(row: SourceStatus): string {
  if (row.state === 'ok') return '—'
  const label = row.lastCode ? (CODE_LABEL[row.lastCode] ?? row.lastCode) : null
  if (label && row.lastReason) return `${label} — ${row.lastReason}`
  return label ?? row.lastReason ?? 'cause non enregistrée'
}

export function SourceHealthPanel({ report }: { report: SourceHealthReport }) {
  const now = Date.now()
  const { window: win, sources } = report

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>État des sources externes</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Lu sur les analyses réellement exécutées ces {win.hours} h. Une source n&apos;est marquée HS que si un run a
        ENREGISTRÉ son échec — « cette entreprise n&apos;a rien » ne rend jamais une source rouge.
      </p>

      {/* Aucun run = aucune information. Le pire écran possible serait un vert
          rassurant construit sur du vide : on dit « inconnu » et on s'arrête. */}
      {report.unavailable ? (
        <div className="error">
          <strong>Lecture impossible</strong> — l&apos;état des sources n&apos;a pas pu être lu. Ce n&apos;est ni «
          aucun run » ni un signal de bonne santé.
        </div>
      ) : win.runsConsidered === 0 ? (
        <div className="error">
          Aucune analyse exploitable sur les {win.hours} dernières heures — <strong>état des sources inconnu</strong>.
          <br />
          Ce n&apos;est pas un signal de bonne santé : sans run, aucune source n&apos;a été sollicitée, donc rien ne
          permet de dire qu&apos;elles répondent.
        </div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>État</th>
                <th>En panne depuis</th>
                <th>Cause</th>
                <th className="num">Runs dégradés</th>
                <th>Dernier run OK</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(row => (
                <tr key={row.source}>
                  <td className="mono">{row.source}</td>
                  <td>
                    <span className={`badge ${STATE_BADGE[row.state]}`}>{STATE_LABEL[row.state]}</span>
                  </td>
                  <td style={{ color: row.degradedSince ? 'var(--red)' : 'var(--muted)' }}>{since(row, now)}</td>
                  <td style={{ maxWidth: 380, overflowWrap: 'anywhere' }}>{cause(row)}</td>
                  <td className="num">
                    {row.runsDegraded} / {row.runsObserved}
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {row.lastOkAt ? `il y a ${ago(row.lastOkAt, now)}` : 'jamais sur la fenêtre'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
            {win.runsConsidered} run(s) analysés
            {win.oldestRunAt && win.newestRunAt
              ? ` — du ${dateEtHeure(win.oldestRunAt)} au ${dateEtHeure(win.newestRunAt)}`
              : ''}
            . « HS » = tous les runs qui l&apos;ont sollicitée ont échoué ; « Dégradée » = elle échoue en ce moment mais
            a répondu sur la fenêtre. Une source absente du tableau n&apos;a été appelée par aucun run : son état est
            inconnu, pas bon.
          </p>
        </>
      )}
    </section>
  )
}
