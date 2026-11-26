import type { KillSwitchReport, KillSwitchState, KillSwitchStatus } from '@/lib/telemetry'
import { dateEtHeure } from '@/lib/dates'

// Backoffice — « qu'est-ce qui est coupé, en ce moment ».
//
// Le trou que ça bouche (D169) : vingt-trois interrupteurs d'arrêt existaient
// sans AUCUNE surface. Posé pendant un incident, un interrupteur ne se voyait
// nulle part — et six ne laissaient même pas une ligne de journal. « Un
// interrupteur qu'on oublie d'éteindre est indistinguable d'un produit qui n'a
// jamais su faire. »
//
// Trois règles de justesse gouvernent ce panneau :
//
//  1. **Coupé n'est pas cassé.** Un interrupteur posé est une DÉCISION, et le
//     vocabulaire de l'écran doit l'être aussi : « coupée » et jamais « en
//     erreur ». Les deux appellent des gestes opposés — on remet la première en
//     route, on diagnostique la seconde.
//  2. **Le silence n'est pas la santé.** Le moteur IA est un autre process :
//     quand il ne répond pas, ses huit capacités sont « inconnues », jamais
//     « actives ». C'est le motif du `200 {"status":"degraded"}` compté
//     `operational`, qui rend une panne invisible.
//  3. **On nomme la capacité, jamais la variable.** Aucun nom d'environnement,
//     aucune valeur ne traverse cette route (GA-85). Un écran opérateur qui
//     listerait des variables apprendrait à en lire une, et la suivante
//     porterait un secret.
//
// ⚠️ Il ne parle PAS du cas « sans clé = no-op strict » : une intégration sans
// clé est un chemin normal, pas un interrupteur posé. Les mélanger ferait lire
// une absence de configuration comme un incident.

const STATE_LABEL: Record<KillSwitchState, string> = {
  active: 'Active',
  cut: 'Coupée',
  unknown: 'Inconnu',
}

// `.badge.completed` = vert, `.badge.error` = rouge, `.badge.analyzing` = neutre
// (globals.css) — réutilisés tels quels, aucun CSS nouveau. Une couleur porte un
// ÉTAT, jamais une catégorie : c'est pourquoi `service` n'en reçoit aucune.
const STATE_BADGE: Record<KillSwitchState, string> = {
  active: 'completed',
  cut: 'error',
  unknown: 'analyzing',
}

const SERVICE_LABEL: Record<KillSwitchStatus['service'], string> = {
  api: 'Application',
  ia: 'Moteur d’analyse',
}

/** Ce qui est coupé d'abord, puis ce qu'on ignore, puis le reste : un écran
 *  d'incident se lit de haut en bas et la première ligne doit compter. */
const ORDER: Record<KillSwitchState, number> = { cut: 0, unknown: 1, active: 2 }

export function KillSwitchPanel({ report }: { report: KillSwitchReport }) {
  const { summary, switches, iaReachable } = report
  const rows = [...switches].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.id.localeCompare(b.id))
  const cutFacingUsers = switches.filter(s => s.state === 'cut' && s.audience === 'user')

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>
        Capacités coupées{'  '}
        <span className={`badge ${summary.cut > 0 ? 'error' : 'completed'}`}>
          {summary.cut > 0 ? `${summary.cut} coupée(s)` : 'aucune'}
        </span>
      </h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Les interrupteurs d&apos;arrêt posés en ce moment, sur les deux services. « Coupée » veut dire{' '}
        <strong>coupée exprès</strong> — c&apos;est une décision d&apos;exploitation, pas une panne. Ce tableau ne dit
        rien d&apos;une intégration sans clé : ça, c&apos;est un chemin normal.
      </p>

      {/* Ce que l'écran doit crier : une capacité coupée que l'utilisateur voit,
          sans que rien ne le lui dise. C'est le défaut d'origine, pas un détail. */}
      {cutFacingUsers.length > 0 && (
        <div className="error" style={{ marginBottom: 12 }}>
          <strong>{cutFacingUsers.length} capacité(s) coupée(s) que les utilisateurs constatent</strong> —{' '}
          {cutFacingUsers.map(s => s.labelFr).join(', ')}. Leur écran continue de les annoncer disponibles.
        </div>
      )}

      {/* Le moteur muet : on le DIT, on ne peint pas huit lignes en vert. */}
      {!iaReachable && (
        <div className="error" style={{ marginBottom: 12 }}>
          Le moteur d&apos;analyse n&apos;a pas répondu : l&apos;état de ses capacités est{' '}
          <strong>inconnu, pas bon</strong>. Un service muet ne prouve pas que ce qu&apos;il porte tourne.
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Capacité</th>
              <th>État</th>
              <th>Service</th>
              <th>Ce qui s&apos;arrête</th>
              <th>Qui le constate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>{row.labelFr}</td>
                <td>
                  <span className={`badge ${STATE_BADGE[row.state]}`}>{STATE_LABEL[row.state]}</span>
                </td>
                <td style={{ color: 'var(--muted)' }}>{SERVICE_LABEL[row.service]}</td>
                <td style={{ maxWidth: 460, overflowWrap: 'anywhere' }}>{row.cutsFr}</td>
                <td style={{ color: 'var(--muted)' }}>
                  {row.audience === 'user' ? 'l’utilisateur aussi' : 'l’exploitant seul'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
        {summary.active} active(s) · {summary.cut} coupée(s) · {summary.unknown} inconnue(s) — mesuré le{' '}
        {dateEtHeure(report.measuredAt)}. Le nom de la variable à retirer n&apos;est volontairement pas affiché : il vit
        dans <code>agent_docs/env-reference.md</code> et dans les deux registres (<code>common/kill-switches.ts</code>,{' '}
        <code>services/kill_switch.py</code>).
      </p>
    </section>
  )
}
