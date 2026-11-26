import { CHURN_ALERT_SCORE, type ClientHealth } from '../admin/client-health'

/**
 * #1946.22 — décision Louis 13/09 batch 12 : « Espace à risque → intervention
 * ciblée ou alerte équipe, sans harceler ». Le fait PUR ; le service
 * (`backoffice-alerts.service.ts#checkWorkspacesAtRisk`) FETCH, ce fichier DÉCIDE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE DÉCISION LÈVE, ET POUR CE SEUL USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux refus tenaient jusqu'au 13/09/2026 :
 *  - la règle 5 de `c64_analytique_produit` — « rien de comportemental par
 *    espace client NOMMÉ dans le back-office » ;
 *  - le refus de Louis du 10/09/2026 écrit dans `client-lifecycle-alerts.ts` —
 *    aucune alerte sur SIGNAL D'USAGE, seulement sur le fait contractuel.
 * Louis les lève, CONTRE la recommandation, pour CETTE alerte seulement, et
 * assume le traitement AVANT la relecture juridique RGPD, qui reste due. Tout
 * le reste de c64 tient. L'exception est nommée et unique : GA-266
 * (`team-detail-never-reads-behavioral.spec.ts`) refuse une seconde alerte par
 * espace nommé qui lirait un signal d'usage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ALERTE EST, ET CE QU'ELLE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Une alerte OPÉRATEUR : elle part vers l'équipe Bellum (e-mail / Slack du
 *    back-office, `BACKOFFICE_ALERT_EMAILS`, no-op strict sans destinataire),
 *    JAMAIS vers le client. Aucun message ne part vers l'espace concerné.
 *  - Elle dit le NOM de l'espace, le SCORE et ses AXES NOMMÉS — ce qui n'a pas
 *    pu être évalué est nommé avec sa raison (« un score n'est jamais nu »). Elle
 *    ne porte AUCUNE donnée de personne (ni adresse du propriétaire, ni
 *    identifiant d'utilisateur) et aucun contenu d'échange : l'entrée de cette
 *    fonction n'en a pas le champ, et le test le prouve sur une ligne qui en porte.
 *  - Elle se déclenche sur le score MESURÉ passé sous le seuil EXISTANT
 *    (`CHURN_ALERT_SCORE`, lu via `health.churnRisk` — une dérivation vit à un
 *    seul endroit). Aucun seuil neuf.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » N'EST JAMAIS « À RISQUE », NI « TOUT VA BIEN »
 * ─────────────────────────────────────────────────────────────────────────────
 * `too_recent` et `not_enough_axes` rendent `not_measured` — une raison DISTINCTE
 * de `not_at_risk`. Aucune alerte ne part, et aucune « résolution » non plus.
 *
 * ⚠️ Ce que le score lit, vérifié dans `admin-client-health.service.ts` : des
 * gestes VALIDÉS (`user_actions`), les connexions (`user_last_seen`), les
 * crédits, les sièges, les analyses et les retours. Il NE LIT PAS le traceur
 * produit (`product_events` comportemental, `VITE_PRODUCT_TRACKER_ENABLED`) :
 * l'état de ce traceur ne rend donc AUCUN axe « non mesuré » ici. Si le traceur
 * nourrit un jour un axe, un axe qu'il n'alimente pas sortira du dénominateur
 * comme les autres — et, sous trois axes, il n'y a pas de score, donc pas
 * d'alerte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS HARCELER
 * ─────────────────────────────────────────────────────────────────────────────
 * Une alerte par espace, au plus une fois par {@link WORKSPACE_RISK_ALERT_WINDOW_MS}
 * (appliquée par `decideAlertAction` via `antiRepeatMsFor`), calculée une fois
 * par JOUR (et non toutes les 5 minutes), et JAMAIS « résolue » : un espace qui
 * oscille autour du seuil ne produit pas un « à risque / résolu / à risque »
 * dans la même semaine.
 */

/** Une alerte par espace, au plus une fois par fenêtre — sept jours. */
export const WORKSPACE_RISK_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** L'écran du back-office qui porte la fiche de santé d'un espace. */
const CLIENTS_SCREEN_PATH = '/revenus/clients'

/** Ce que la décision lit — un ESPACE, jamais une personne. Local (knip). */
type WorkspaceRiskInput = {
  workspaceId: string
  name: string
  isDemo: boolean
  health: ClientHealth
}

/** Le verdict. Trois raisons de NE PAS alerter, jamais confondues. Local. */
type WorkspaceRiskVerdict =
  | { alert: true; subject: string; title: string; detail: string }
  | { alert: false; reason: 'demo' | 'not_measured' | 'not_at_risk' }

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

/**
 * Faut-il prévenir l'équipe, et avec quelle phrase.
 *
 * L'ordre des refus compte : une salle de DÉMONSTRATION n'est le compte de
 * personne, elle sort avant même qu'on regarde son score.
 */
export function workspaceRiskAlert(
  input: WorkspaceRiskInput,
  opts: { backofficeUrl: string | null },
): WorkspaceRiskVerdict {
  if (input.isDemo) return { alert: false, reason: 'demo' }
  const { health } = input
  if (health.kind !== 'score') return { alert: false, reason: 'not_measured' }
  if (!health.churnRisk) return { alert: false, reason: 'not_at_risk' }

  const measured: string[] = []
  const unmeasured: string[] = []
  for (const axis of health.axes) {
    if (axis.ratio === null) {
      unmeasured.push(`${axis.label} (${axis.unmeasured ?? 'raison non enregistrée'})`)
    } else {
      measured.push(`${axis.label} — ${axis.detail ?? 'mesuré'} (${percent(axis.ratio)})`)
    }
  }

  // Jamais une URL devinée : sans back-office configuré, on NOMME l'écran.
  const base = opts.backofficeUrl?.trim().replace(/\/+$/, '') ?? ''
  const where = base
    ? `${base}${CLIENTS_SCREEN_PATH}?search=${encodeURIComponent(input.name)}`
    : 'back-office, écran Revenus › Clients'

  const detail = [
    `Score de santé ${health.score}/100 — sous le seuil d'alerte (${CHURN_ALERT_SCORE}), sur ${health.measured} axes mesurés.`,
    `Axes mesurés : ${measured.join(' · ')}.`,
    unmeasured.length > 0 ? `Non évalués : ${unmeasured.join(' · ')}.` : 'Non évalués : aucun.',
    `Fiche : ${where}`,
  ].join('\n')

  return { alert: true, subject: input.workspaceId, title: input.name, detail }
}
