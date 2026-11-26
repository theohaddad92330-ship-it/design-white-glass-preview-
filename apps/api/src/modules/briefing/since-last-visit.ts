import { SINCE_LAST_VISIT_UNMEASURED_STATES } from '@bellum/contracts'
import type { InterventionKind, SinceLastVisitLine, SinceLastVisitLineKind } from '@bellum/contracts'

/**
 * L'AGRÉGATION « ce qui a bougé depuis ta dernière visite », côté serveur.
 *
 * Tout ce qui est ici est PUR : les quatre lignes se vérifient sans base, sans
 * Nest et sans fournisseur, donc on peut vérifier les états qu'un rendu ne
 * montre presque jamais — la messagerie non branchée, la lecture qui échoue, le
 * zéro VRAI. C'est exactement ce que le bloc a coûté la première fois : il était
 * monté, visible, et personne n'avait vérifié ce qu'il montrait.
 *
 * ⚠️ AUCUNE des quatre règles métier n'est écrite ici. Chacune vit déjà ailleurs
 * et ce fichier ne fait que l'appliquer à une FENÊTRE :
 *
 *  - signaux            → {@link signalsDetectedSince}, la seule définition de
 *                         « signal actif apparu depuis », partagée avec le bloc
 *                         « comptes qui ont bougé » (48 h) du même brief ;
 *  - réponses reçues    → `activities.direction = 'inbound'`, la direction que
 *                         `ACTIVITY_DIRECTIONS` définit et que la capture de
 *                         messagerie écrit — un COMPTE, jamais un corps ;
 *  - changements de poste → `contactSourceTag(...) === 'RISQUE'`, la définition
 *                         partagée par quatre modules de « son employeur
 *                         courant n'est plus ce compte » ;
 *  - missions           → les interventions `renewal_at_risk` que le balayeur a
 *                         posées, donc `INTERVENTION_THRESHOLDS.renewalHorizonDays`
 *                         appliqué UNE fois, là où il vit.
 *
 * Deux dérivations du même fait divergent — la loi GA-26 du dépôt a déjà coûté
 * deux défauts sur ce chantier. Recopier une de ces quatre règles ici en aurait
 * fabriqué un troisième.
 */

/** Le seul `kind` d'intervention que ce bloc lit. Typé, donc un renommage de
 *  l'énumération casse la compilation au lieu de rendre la ligne muette. */
export const RENEWAL_AT_RISK: InterventionKind = 'renewal_at_risk'

/** La forme minimale d'une ligne d'historique de signal que ce calcul lit.
 *  NON exporté : il n'est consommé que dans ce fichier — l'exporter ferait
 *  échouer `pnpm lint:exports:types` (knip). Les appelants passent des lignes
 *  qui LUI ressemblent, le typage structurel fait le reste. */
type SignalDetection = {
  account_id: string | null
  status: string | null
  first_detected_at: string | Date | null
  /** `false` = backfill : le signal était DÉJÀ là, on ne sait pas depuis quand.
   *  Absent des lignes écrites avant la colonne, d'où l'optionnel. */
  first_detection_exact?: boolean | null
  /** #2107.28 — CE QUI a bougé (« Levée de fonds Série B »), déjà écrit à la
   *  matérialisation. Optionnel : les appelants qui ne le lisent pas (le
   *  compte de #2151.15) passent des lignes qui ne le portent pas. */
  label?: string | null
}

/**
 * QUAND le signal le plus récent de chaque compte a été repéré, dans la fenêtre.
 *
 * Le brief affichait « Nouveau signal détecté » — une phrase qui affirme qu'un
 * signal EXISTE sans dire lequel, ni de quand, donc qu'on ne peut ni vérifier
 * ni contredire. La date était dans la table depuis le début ; personne ne la
 * remontait.
 *
 * Le plus RÉCENT et non le plus ancien : la carte dit « ce compte a bougé », et
 * ce qui compte est la dernière fois qu'il a bougé. `exact` retombe à `false`
 * dès qu'UNE des détections retenues vient d'un backfill — l'écran dit alors
 * « suivi depuis », jamais « repéré le », parce qu'on sait seulement que le
 * signal était déjà là.
 *
 * ⚠️ Dérivée de {@link signalsDetectedSince} et non recopiée : « signal actif
 * apparu depuis » est UNE règle. Deux copies divergent le jour où quelqu'un
 * décide qu'un signal `resolved` compte encore (GA-26).
 */
export function freshSignalDetections(
  rows: readonly SignalDetection[],
  sinceMs: number,
): Map<string, { detectedAt: string | null; exact: boolean; label: string | null }> {
  const kept = signalsDetectedSince(rows, sinceMs).accountIds
  const out = new Map<string, { detectedAt: string | null; exact: boolean; label: string | null }>()
  for (const row of rows) {
    const accountId = row.account_id ? String(row.account_id) : null
    if (!accountId || !kept.has(accountId)) continue
    const detected = row.first_detected_at ? Date.parse(String(row.first_detected_at)) : Number.NaN
    // Un signal résolu, ou daté hors fenêtre, n'a pas participé à la sélection :
    // le laisser dater la carte contredirait la règle qui l'a fait entrer.
    if (row.status !== 'active' || Number.isNaN(detected) || detected < sinceMs) continue
    const exact = row.first_detection_exact !== false
    // #2107.28 — le libellé suit la MÊME détection que la date : celle
    // retenue comme la plus récente, jamais une autre ligne du compte.
    const label = row.label ?? null
    const current = out.get(accountId)
    if (!current || !current.detectedAt || Date.parse(current.detectedAt) < detected) {
      out.set(accountId, { detectedAt: new Date(detected).toISOString(), exact, label })
      continue
    }
    // Une seule détection approximative suffit à rendre la date approximative.
    if (!exact) out.set(accountId, { detectedAt: current.detectedAt, exact: false, label: current.label })
  }
  return out
}

/**
 * Les signaux ACTIFS apparus depuis `sinceMs`, et chez combien de comptes.
 *
 * UNE définition, DEUX fenêtres. Le bloc « comptes qui ont bougé » l'appelle
 * avec 48 heures ; celui-ci avec le repère de dernière visite. Elle était
 * jusqu'ici écrite en dur dans `buildAccountsToWatch` — l'en recopier une
 * seconde fois aurait produit deux comptes de signaux qui divergent le jour où
 * quelqu'un décide qu'un signal `resolved` compte encore.
 *
 * Un signal dont la date de détection est ILLISIBLE est écarté, jamais compté :
 * un `Number.NaN` comparé à quoi que ce soit est faux, et le laisser passer
 * ferait entrer dans « depuis ta dernière visite » un signal de 2021.
 */
export function signalsDetectedSince(
  rows: readonly SignalDetection[],
  sinceMs: number,
): { signals: number; accountIds: Set<string> } {
  const accountIds = new Set<string>()
  let signals = 0
  for (const row of rows) {
    if (row.status !== 'active') continue
    const detected = row.first_detected_at ? Date.parse(String(row.first_detected_at)) : Number.NaN
    if (Number.isNaN(detected) || detected < sinceMs) continue
    signals += 1
    if (row.account_id) accountIds.add(String(row.account_id))
  }
  return { signals, accountIds }
}

// `freshSignalAccountIds` vivait ici : les seuls COMPTES concernés, sans leur
// date. Son unique appelant demande maintenant la date AVEC les comptes —
// {@link freshSignalDetections} — et un exportateur sans appelant est
// précisément ce que `pnpm lint:exports:types` refuse.

/**
 * Une ligne MESURÉE. `count` porte un nombre, `reason` est nul.
 *
 * `scope` reste `null` par défaut : trois des quatre lignes n'ont qu'un seul
 * compteur, et leur en inventer un second ferait écrire « 2 réponses sur 2 »
 * à un écran qui n'a rien de plus à dire.
 */
export function measuredLine(
  kind: SinceLastVisitLineKind,
  count: number,
  scope: number | null = null,
): SinceLastVisitLine {
  return { kind, state: 'ready', reason: null, count, scope }
}

/**
 * Une ligne qu'on n'a PAS pu mesurer. `count` vaut `null`, et c'est le cœur du
 * contrat : « je n'ai pas su regarder » ne s'écrit jamais « 0 ».
 *
 * `reason` est une CLÉ, pas une phrase — l'écran localise, et le serveur ne
 * décide pas de la langue de quelqu'un qu'il ne connaît pas.
 */
export function unmeasuredLine<K extends SinceLastVisitLineKind>(
  kind: K,
  // Le silence doit être ATTEIGNABLE pour cette ligne-là : rendre
  // `not_connected` sur les signaux — qui ne dépendent d'aucun connecteur —
  // afficherait « va brancher quelque chose » sans rien à brancher. Le type
  // dérive de la table du contrat, donc l'erreur ne compile pas, et la garde
  // d'i18n lit la MÊME table pour exiger une phrase FR et EN à chaque couple.
  state: (typeof SINCE_LAST_VISIT_UNMEASURED_STATES)[K][number],
  reason: string,
): SinceLastVisitLine {
  return { kind, state, reason, count: null, scope: null }
}
