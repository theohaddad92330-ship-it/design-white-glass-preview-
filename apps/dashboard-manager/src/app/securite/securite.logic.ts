import type { Anomalie, TypeAnomalie } from '@/lib/etat-securite'
import { jour } from '@/lib/dates'

/**
 * L'ÉCRAN /securite (#1671.3 — la détection d'accès anormal, BRANCHÉE ;
 * #1671.4 — l'état de sécurité) — ce qu'il CALCULE, séparé de ce qu'il rend.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE NE REFAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois signaux eux-mêmes (rafale d'échecs, pays jamais vu, heure
 * inhabituelle) sont calculés côté API — `calculerEtatSecurite` dans
 * `backoffice-access-journal.service.ts`, testée là-bas sans mock. Ce module
 * ne fait que les NOMMER : un libellé, une couleur, une phrase. Le recalculer
 * ici serait une seconde vérité qui diverge un jour de la première (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « CE QUI A ÉTÉ PURGÉ ET QUAND », SANS DEVINER LA FENÊTRE DE RÉTENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * La fenêtre de rétention (`RETENTION_DAYS_BACKOFFICE_ACCESS`, 365 jours par
 * défaut) est lue et appliquée par `PrivacyRetentionService`, un module que ce
 * lot n'a pas le droit de toucher. La relire ici — même le même nombre par
 * défaut — créerait EXACTEMENT le défaut que son propre docblock dénonce :
 * « deux lectures d'un même réglage finissent par diverger ». Ce qui est dit
 * ici est donc MESURÉ, pas configuré : la plus ancienne entrée ENCORE présente
 * dans le journal, qui mesure en creux jusqu'où le dernier passage de purge a
 * coupé — jamais une date ou un nombre de jours inventés.
 */

/** La fenêtre d'observation par défaut — miroir de `FENETRE_SECURITE_JOURS_DEFAUT` côté API. */
export const FENETRE_JOURS_DEFAUT = 30

/** Les raccourcis proposés à l'écran — le défaut y figure toujours. */
export const FENETRES_PROPOSEES = [7, FENETRE_JOURS_DEFAUT, 90] as const

const FENETRE_MIN = 1
const FENETRE_MAX = 365

const LIBELLES_ANOMALIE: Record<TypeAnomalie, string> = {
  rafale_echecs: 'Rafale d’échecs',
  pays_inhabituel: 'Pays inhabituel',
  heure_inhabituelle: 'Heure inhabituelle',
}

export function libelleTypeAnomalie(type: TypeAnomalie): string {
  return LIBELLES_ANOMALIE[type]
}

/**
 * ⚠️ ROUGE réservé à la rafale d'échecs : c'est le seul des trois signaux qui
 * peut décrire une attaque EN COURS (force brute). Les deux autres sont des
 * écarts à vérifier, pas des alarmes — même repère que `COULEUR_RESULTAT` de
 * l'écran d'audit, où un refus (le produit qui fonctionne) n'est jamais peint
 * comme une panne.
 */
export function couleurAnomalie(type: TypeAnomalie): string {
  return type === 'rafale_echecs' ? 'var(--red)' : 'var(--amber)'
}

const LIBELLES_EVENEMENT: Record<string, string> = {
  connexion: 'Connexion réussie',
  connexion_refusee: 'Connexion refusée',
  acces_refuse: 'Accès refusé (hors liste)',
  deconnexion: 'Déconnexion',
  enrolement_demarre: 'Enrôlement démarré',
  enrolement_confirme: 'Enrôlement confirmé',
  enrolement_refuse: 'Enrôlement refusé',
  capacite_refusee: 'Capacité refusée',
  email_revele: 'Adresse révélée',
}

/** Un événement inconnu ne casse pas l'écran : il rend sa valeur brute plutôt qu’une erreur. */
export function libelleEvenement(event: string): string {
  return LIBELLES_EVENEMENT[event] ?? event
}

/**
 * « CE QUI A ÉTÉ PURGÉ ET QUAND » — la phrase du panneau de rétention.
 *
 * Deux cas, et ils ne disent pas la même chose :
 *  · `null` — le journal est VIDE. Ce n'est pas la même situation qu'un journal
 *    qui aurait été entièrement purgé, mais rien ne les distingue depuis ce
 *    service : les deux se disent avec la même honnêteté (« rien à montrer »),
 *    sans deviner laquelle des deux c'est.
 *  · une date — la plus ancienne entrée ENCORE là. Tout ce qui est plus vieux a
 *    déjà quitté le journal, par la purge nocturne (04:17, voir le docblock de
 *    `purgeOlderThan` côté API).
 */
export function libellePurge(oldestEntryAt: string | null): string {
  if (oldestEntryAt === null) {
    return 'Le journal est vide pour l’instant — rien n’a encore été purgé.'
  }
  return `La plus ancienne entrée encore conservée date du ${jour(oldestEntryAt)}. Une purge nocturne (04:17) retire chaque jour ce qui dépasse la fenêtre de rétention.`
}

/** Le compte de chaque type — un type absent des anomalies est un VRAI zéro, jamais une case vide. */
export function resumeParType(anomalies: Anomalie[]): Record<TypeAnomalie, number> {
  const resume: Record<TypeAnomalie, number> = { rafale_echecs: 0, pays_inhabituel: 0, heure_inhabituelle: 0 }
  for (const anomalie of anomalies) {
    resume[anomalie.type] += 1
  }
  return resume
}

/**
 * Lit `?jours=` sans jamais faire confiance à sa forme — même discipline que
 * `lireFiltre` de l'écran d'audit. Bornée comme côté API (1 à 365 jours) :
 * une valeur illisible ou démesurée retombe sur le défaut plutôt que de casser
 * l'écran ou d'ouvrir une fenêtre sans fin.
 */
export function lireFenetre(params: Record<string, string | string[] | undefined>): number {
  const brut = params['jours']
  const valeur = Array.isArray(brut) ? brut[0] : brut
  const nombre = Number(valeur)
  if (!Number.isFinite(nombre)) return FENETRE_JOURS_DEFAUT
  return Math.min(Math.max(Math.floor(nombre), FENETRE_MIN), FENETRE_MAX)
}

/** Le lien vers une fenêtre donnée — pas de paramètre pour le défaut, pour garder l’URL stable. */
export function hrefFenetre(fenetreJours: number): string {
  return fenetreJours === FENETRE_JOURS_DEFAUT ? '/securite' : `/securite?jours=${fenetreJours}`
}
