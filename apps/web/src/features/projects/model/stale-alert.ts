import { isPipelineStage, type ProjectStage } from '@bellum/contracts'
import type { StageSlaRow } from '@/features/settings/lib/stage-sla-api'

/** Le geste que propose une alerte de stagnation, ou `null` quand il n'y en a pas.
 *  Non exporté : seul `StaleInfo` (qui l'embarque) sort de ce fichier — GA/knip
 *  refuse un type qui ne voyage que jusqu'à son propre fichier. */
type StaleGesture = 'qualifier' | 'contact' | 'matching' | 'relance'

/**
 * QUEL GESTE UNE STAGNATION APPELLE — déduit de l'étape, jamais deviné.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * #1326 (6/9.2) : « "36 jours sans mouvement" informe mais ne permet pas
 * vraiment d'agir. **Aucune alerte ne doit être affichée sans action
 * associée.** »
 *
 * C'est la cause racine « une réponse juste sans chemin », et ce dépôt l'a
 * déjà payée : trois familles de relances s'affichaient sans aucun geste pour
 * les fermer (#1285).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST LU, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉTAPE, qui est une donnée réelle du projet. Les trois exemples de l'issue
 * s'y retrouvent exactement :
 *
 *   « besoin exprimé mais aucun profil présenté » → lancer le matching
 *   « aucun contact actif »                       → trouver un interlocuteur
 *   « 36 jours sans mouvement »                   → préparer une relance
 *
 * ⚠️ Une affaire CLOSE (gagnée, perdue) ou dormante ne rend AUCUN geste. Une
 * alerte sur un projet gagné serait du bruit, et relancer quelqu'un qu'on n'a
 * jamais contacté n'a pas de sens. `null` dit qu'il n'y a pas de geste ; il
 * n'en fabrique pas un par défaut — c'est la même règle que « non mesuré n'est
 * pas mesuré à zéro », appliquée à une action.
 */
export function staleGesture(stage: ProjectStage): StaleGesture | null {
  switch (stage) {
    // Une piste détectée ou plausible n'est pas encore une demande du client :
    // le geste est de la qualifier, pas de relancer une conversation qui
    // n'existe pas.
    case 'detected':
    case 'potential':
      return 'qualifier'
    // Qualifié mais sans mouvement : il manque quelqu'un à qui parler.
    case 'qualified':
      return 'contact'
    // Le besoin est confirmé et rien n'avance : ce qui manque, ce sont des
    // profils en face.
    case 'confirmed':
      return 'matching'
    // Des profils sont partis, la négociation est ouverte : c'est une relance.
    case 'profiles_submitted':
    case 'negotiation':
      return 'relance'
    default:
      return null
  }
}

/**
 * LES QUATRE PALIERS DE L'IMMOBILITÉ — #1326 (6/9.1).
 *
 * « < 7 j = neutre · 7–14 j = attention légère · 14–30 j = orange · > 30 j =
 * alerte. »
 *
 * Jusqu'ici la carte n'en connaissait qu'un : quatorze jours, et une seule
 * couleur au-delà. Un projet arrêté depuis trois semaines et un projet arrêté
 * depuis quatre mois s'affichaient donc à l'identique, alors que ce sont deux
 * situations qui n'appellent pas le même empressement — et c'est justement ce
 * tri-là qu'on vient chercher sur un pipe le lundi matin.
 *
 * ⚠️ `null` sous sept jours, et ce n'est pas un seuil cosmétique : une alerte
 * qui s'affiche sur toutes les cartes cesse d'être une alerte. Le premier
 * palier ne colore rien non plus — il NOMME le nombre de jours sans le peindre,
 * parce que « attention légère » veut dire « regarde », pas « agis ».
 *
 * Les bornes sont INCLUSIVES en bas, comme l'issue les écrit : à 14 jours
 * exactement on est dans le troisième palier, pas encore dans le quatrième.
 */
type StaleLevel = 'attention' | 'warning' | 'danger'

/** Les trois bornes basses (inclusives) des paliers, en jours. */
type StaleThresholds = { attention: number; warning: number; danger: number }

const DEFAULT_STALE_THRESHOLDS: Readonly<StaleThresholds> = Object.freeze({ attention: 7, warning: 14, danger: 30 })

export function staleLevel(days: number, thresholds: StaleThresholds = DEFAULT_STALE_THRESHOLDS): StaleLevel | null {
  if (!Number.isFinite(days)) return null
  if (days >= thresholds.danger) return 'danger'
  if (days >= thresholds.warning) return 'warning'
  if (days >= thresholds.attention) return 'attention'
  return null
}

/**
 * #2170.43 — LE SEUIL DÉPEND DE L'ÉTAPE, ET L'ESPACE LE RÈGLE.
 *
 * « Le seuil dépend du stage et peut être réglé dans les Listes métier /
 * règles. » Le réglage par étape et par espace EXISTE déjà : la durée cible
 * d'étape (`deal_stage_sla`, écran Règles → Pipe, `GET /pipeline/stage-sla`).
 * Une seconde table « seuils de stagnation » aurait fait deux réglages pour la
 * même question — « depuis combien de temps cette affaire est-elle immobile
 * dans son étape ? » — qui finiraient par se contredire (GA-26). La carte lit
 * donc CE réglage-là.
 *
 * · Étape que l'espace n'a PAS réglée (`isDefault`), étape hors pipe (piste
 *   détectée, plausible) ou réglage pas encore lu → les paliers d'avant,
 *   7/14/30. Jamais « aucun seuil » : un réglage absent ne fait pas taire le
 *   signal.
 * · Étape réglée à N jours → attention à N (la durée cible est dépassée),
 *   orange au double, alerte au quadruple — le même rapport que 7/14/30.
 */
export function staleThresholdsFor(stage: ProjectStage, slaRows: readonly StageSlaRow[] | undefined): StaleThresholds {
  if (!slaRows || !isPipelineStage(stage)) return DEFAULT_STALE_THRESHOLDS
  const row = slaRows.find(candidate => candidate.stage === stage)
  if (!row || row.isDefault || row.slaDays === null || row.slaDays < 1) return DEFAULT_STALE_THRESHOLDS
  return { attention: row.slaDays, warning: row.slaDays * 2, danger: row.slaDays * 4 }
}

/**
 * Le nombre de jours ÉCOULÉS depuis une date ISO, ou `null` si elle est illisible.
 *
 * ⚠️ `null` et non `0` : une date qu'on n'arrive pas à lire ne veut pas dire
 * « ça vient de bouger ». Les deux se ressemblent à l'œil et appellent des
 * gestes opposés — c'est le même partage que `status_changed_at` sur les
 * besoins ouverts.
 *
 * `now` est un paramètre pour que le test n'ait pas à geler l'horloge : un test
 * qui dépend de l'heure de la machine est un test qui casse une nuit sur deux.
 */
export function daysSince(iso: string, now: number = Date.now()): number | null {
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return null
  return Math.floor((now - at) / 86_400_000)
}

type StaleInfo = { days: number; level: StaleLevel; gesture: StaleGesture | null }

/**
 * #2170.48 — UNE SEULE DÉFINITION DE « VIEILLISSANTE » (GA-26). Vivait
 * seulement dans `PipelineBoard.tsx` (la carte) : le filtre rapide du pipe
 * (`ProjectsPage.tsx`) la réutilise plutôt que de la recalculer — un projet
 * « vieillissant » sur la carte et pas dans le filtre serait exactement la
 * divergence que GA-26 refuse.
 */
export function staleOf(
  project: { stage_entered_at: string; stage: ProjectStage },
  now: number = Date.now(),
  slaRows?: readonly StageSlaRow[],
): StaleInfo | null {
  const days = daysSince(project.stage_entered_at, now)
  if (days === null) return null
  const level = staleLevel(days, staleThresholdsFor(project.stage, slaRows))
  if (level === null) return null
  return { days, level, gesture: staleGesture(project.stage) }
}
