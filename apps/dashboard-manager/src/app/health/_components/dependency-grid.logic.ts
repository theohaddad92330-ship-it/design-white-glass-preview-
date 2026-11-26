import { dureeEcoulee, jourEtHeureCourte } from '@/lib/dates'
import type { DependencyReading, DependencyState } from '@/lib/operator-health'
import type { SourceHealthReport } from '@/lib/telemetry'

/**
 * #1660 — la grille des onze tuiles de la page Santé, en logique PURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX RÈGLES QUE CE MODULE EXISTE POUR TENIR
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **« Cassé » et « non mesurable » ne se ressemblent pas ici.** Cinq états,
 *     et chacun porte un MOT — jamais une couleur seule. « État inconnu » n'est
 *     ni vert ni rouge, et il s'accompagne toujours de la date de la dernière
 *     mesure : dire qu'on ne sait pas sans dire depuis quand n'apprend rien.
 *  2. **Une capacité éteinte à dessein n'est pas une capacité en panne.** Sans
 *     clé, le dépôt fait un no-op strict. `off` est un état à part, avec son mot
 *     (« non branchée ») et sa couleur neutre. Un écran qui lit ce qui MANQUE
 *     sans lire l'INTERRUPTEUR annonce une panne au repos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RÉGIMES DE MESURE, ET ON NE LES MÉLANGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Six dépendances sont sondées toutes les cinq minutes : elles ont une latence
 * médiane et une série de disponibilité. Cinq sont mesurées sur les analyses
 * RÉELLEMENT exécutées — ce qui est un test réel au sens le plus fort — et
 * n'ont ni l'une ni l'autre. On l'ÉCRIT sur la tuile au lieu d'y dessiner une
 * série plate qui se lirait comme une mesure.
 *
 * ⚠️ `now` est un PARAMÈTRE. Une dérivation qui lit l'horloge passe à Paris et
 * échoue sur un exécuteur CI en UTC.
 */

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type BadgeEtat = 'completed' | 'error' | 'analyzing'

/** La série de disponibilité, ou la raison NOMMÉE de son absence. */
type Disponibilite = { kind: 'serie'; points: { value: number | null }[] } | { kind: 'absente'; raison: string }

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type TuileDependance = {
  id: string
  label: string
  /** Ce qui s'arrête quand elle tombe — ce qui rend la tuile actionnable. */
  cuts: string
  etat: DependencyState
  /** Le mot de l'état. Une couleur seule n'est pas une information. */
  motDEtat: string
  badge: BadgeEtat
  /** Comment cet état a été obtenu — jamais une déclaration. */
  origine: string
  latence: string
  derniereMesure: string
  dernierIncident: string
  disponibilite: Disponibilite
}

const MOT: Record<DependencyState, string> = {
  up: 'Opérationnelle',
  degraded: 'Dégradée',
  down: 'En panne',
  unknown: 'État inconnu',
  off: 'Non branchée',
}

/**
 * ⚠️ `unknown` et `off` prennent le badge NEUTRE, jamais le rouge.
 *
 * `.badge.completed` est vert, `.badge.error` rouge, `.badge.analyzing` neutre
 * (globals.css) — réutilisés tels quels, aucun CSS nouveau. Peindre en rouge
 * une capacité qu'on n'a pas branchée apprend à ignorer le rouge, et c'est
 * exactement ce qu'on ne veut pas d'un écran d'incident.
 */
const BADGE: Record<DependencyState, BadgeEtat> = {
  up: 'completed',
  degraded: 'error',
  down: 'error',
  unknown: 'analyzing',
  off: 'analyzing',
}

export function motDEtat(etat: DependencyState): string {
  return MOT[etat]
}

export function badgeDeLEtat(etat: DependencyState): BadgeEtat {
  return BADGE[etat]
}

/** La latence médiane 24 h, ou la phrase qui dit pourquoi il n'y en a pas. */
function decrireLatence(dependance: DependencyReading): string {
  if (dependance.measuredBy === 'usage') {
    return 'non mesurée — cette source n’est pas sondée, son état vient des analyses réelles'
  }
  const latence = dependance.health.medianLatency24h
  switch (latence.kind) {
    case 'measured':
      return `${Math.round(latence.ms)} ms (médiane sur ${latence.samples} sondes)`
    case 'not_applicable':
      return 'sans objet — cette sonde ne fait aucun aller-retour réseau'
    case 'no_sample':
      return 'aucune sonde chiffrée sur 24 h'
  }
}

/** Depuis quand on ne sait rien — la moitié de la phrase « état inconnu ». */
function decrireDerniereMesure(
  dependance: DependencyReading,
  sourceStatus: SourceStatusLu | null,
  now: number,
): string {
  if (dependance.measuredBy === 'usage') {
    if (!sourceStatus) return 'jamais sollicitée sur la fenêtre observée'
    return sourceStatus.lastOkAt
      ? `dernier appel réussi il y a ${dureeEcoulee(now - Date.parse(sourceStatus.lastOkAt))}`
      : 'aucun appel réussi sur la fenêtre observée'
  }
  const at = dependance.health.lastMeasuredAt
  // ⚠️ `null` rend une PHRASE et pas « il y a 0 min » : jamais sondée et sondée
  // à l'instant sont les deux lectures les plus opposées possibles.
  return at === null ? 'jamais sondée' : `sondée il y a ${dureeEcoulee(now - at)}`
}

function decrireIncident(dependance: DependencyReading, sourceStatus: SourceStatusLu | null): string {
  if (dependance.measuredBy === 'usage') {
    if (!sourceStatus?.degradedSince) return 'aucune dégradation enregistrée sur la fenêtre observée'
    const prefixe = sourceStatus.degradedSinceIsWindowEdge ? 'au moins depuis ' : 'depuis '
    return `en cours ${prefixe}${jourEtHeureCourte(sourceStatus.degradedSince)}`
  }
  const incident = dependance.health.lastIncident
  switch (incident.kind) {
    case 'observed':
      return incident.resolvedAt === null
        ? `en cours depuis ${jourEtHeureCourte(incident.at)}`
        : `${jourEtHeureCourte(incident.at)} → ${jourEtHeureCourte(incident.resolvedAt)}`
    case 'none_in_window':
      return `aucun sur ${incident.windowDays} jours`
    case 'unknown':
      return 'inconnu — aucune sonde en mémoire'
  }
}

function decrireDisponibilite(dependance: DependencyReading): Disponibilite {
  if (dependance.measuredBy === 'usage') {
    return {
      kind: 'absente',
      raison: 'série non conservée — l’état vient des analyses exécutées, pas d’une sonde périodique',
    }
  }
  return { kind: 'serie', points: dependance.health.availability7d.map(point => ({ value: point.ratio })) }
}

/** Ce que l'écran a besoin de savoir d'une source, sans dépendre de sa forme. */
type SourceStatusLu = SourceHealthReport['sources'][number]

/**
 * L'état d'une dépendance mesurée à l'usage.
 *
 * ⚠️ ABSENTE du rapport = INCONNUE, jamais « opérationnelle ». Une source
 * qu'aucune analyse n'a sollicitée n'a rien prouvé — c'est déjà la règle du
 * panneau des sources, et la refaire ici la ferait diverger : on la LIT.
 */
function etatALUsage(
  configured: boolean,
  rapport: SourceHealthReport | null,
  source: string,
): {
  etat: DependencyState
  status: SourceStatusLu | null
} {
  if (!configured) return { etat: 'off', status: null }
  if (!rapport) return { etat: 'unknown', status: null }
  const status = rapport.sources.find(candidat => candidat.source === source) ?? null
  if (!status) return { etat: 'unknown', status: null }
  return { etat: status.state === 'ok' ? 'up' : status.state, status }
}

const ORIGINE_SONDE = 'sonde synthétique, toutes les 5 min'
const ORIGINE_USAGE = 'analyses réellement exécutées'

/**
 * L'ordre de la grille : ce qui va mal d'abord.
 *
 * Un opérateur ouvre cet écran pour trouver la panne. Un inventaire dans
 * l'ordre du registre l'oblige à lire onze tuiles pour en trouver une.
 */
const RANG: Record<DependencyState, number> = { down: 0, degraded: 1, unknown: 2, off: 3, up: 4 }

export function construireGrille(
  dependances: readonly DependencyReading[],
  rapportSources: SourceHealthReport | null,
  now: number,
): TuileDependance[] {
  return dependances
    .map(dependance => {
      const usage = dependance.measuredBy === 'usage'
      const { etat, status } = usage
        ? etatALUsage(dependance.configured, rapportSources, dependance.usageSource)
        : { etat: dependance.health.state, status: null }

      return {
        id: dependance.id,
        label: dependance.label,
        cuts: dependance.cuts,
        etat,
        motDEtat: MOT[etat],
        badge: BADGE[etat],
        origine: usage ? ORIGINE_USAGE : ORIGINE_SONDE,
        latence: decrireLatence(dependance),
        derniereMesure: decrireDerniereMesure(dependance, status, now),
        dernierIncident: decrireIncident(dependance, status),
        disponibilite: decrireDisponibilite(dependance),
      }
    })
    .sort((a, b) => RANG[a.etat] - RANG[b.etat] || a.label.localeCompare(b.label))
}

/**
 * Le compte des tuiles par état, pour l'entête.
 *
 * ⚠️ « inconnu » et « non branchée » comptent SÉPARÉMENT des pannes. Les fondre
 * dans un total d'anomalies referait exactement l'erreur que cet écran corrige.
 */
export function compterParEtat(tuiles: readonly TuileDependance[]): Record<DependencyState, number> {
  const compte: Record<DependencyState, number> = { up: 0, degraded: 0, down: 0, unknown: 0, off: 0 }
  for (const tuile of tuiles) compte[tuile.etat] += 1
  return compte
}

/**
 * Le verdict de l'entête de « Santé système ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'INCIDENT — RECETTE DU 09/09/2026, PENDANT UNE PANNE RÉELLE
 * ─────────────────────────────────────────────────────────────────────────
 * La pastille affichait « healthy » pendant que la grille, juste en dessous,
 * disait « 1 en panne · SUPABASE (AUTHENTIFICATION) · incident en cours depuis
 * 09:05 ». Un client a signalé « 0 résultats » à 09:06:57 — la minute suivante.
 *
 * La cause : le verdict venait de `health.status`, qui décrit l'API elle-même
 * (son process, sa base, sa file), et jamais les dépendances SONDÉES du
 * produit. Deux questions différentes sous une seule pastille, en tête de la
 * page où un opérateur vient demander « est-ce que quelque chose est cassé ? ».
 *
 * Un agrégat qui ignore une panne ne se contente pas d'être incomplet : il
 * fait MANQUER l'incident.
 *
 * ⚠️ Et « je n'ai pas pu mesurer » n'est pas « tout va bien » : sans compte de
 * dépendances (l'endpoint n'a pas répondu), le verdict ne peut pas être sain.
 */
export function verdictSante(
  apiSaine: boolean,
  compte: Record<DependencyState, number> | null,
): { sain: boolean; libelle: string } {
  if (!compte) return { sain: false, libelle: 'dépendances non mesurées' }
  if (compte.down > 0) return { sain: false, libelle: `${compte.down} dépendance(s) en panne` }
  if (compte.degraded > 0) return { sain: false, libelle: `${compte.degraded} dépendance(s) dégradée(s)` }
  if (!apiSaine) return { sain: false, libelle: 'degraded' }
  return { sain: true, libelle: 'healthy' }
}
