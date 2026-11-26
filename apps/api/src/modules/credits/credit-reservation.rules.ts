/**
 * La dérivation « ce qui est EN VOL » — écrite UNE SEULE FOIS, ici (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FICHIER PUR PLUTÔT QU'UNE MÉTHODE DE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux endroits ont besoin de ce calcul et ne peuvent pas s'appeler l'un
 * l'autre :
 *
 *  - le registre qui ÉCRIT les réservations vit dans Action OS
 *    (`CreditReservationService`), au plus près du moteur qui les pose ;
 *  - le service qui ANNONCE le solde vit dans la facturation
 *    (`CreditsService`), parce que lui seul connaît le POOL auquel il faut
 *    retrancher ce qui est promis.
 *
 * Un service qui irait chercher le service de l'autre module est précisément ce
 * que GA-07 interdit (§3.2), et la garde propose l'issue : « passe par un
 * contrat partagé ». Ce fichier EST ce contrat — pur, sans NestJS, sans
 * repository, donc testable directement et impossible à faire diverger.
 *
 * Ce qu'il ne fait PAS : lire ou écrire la base. Les lignes lui sont données.
 */

import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'

/**
 * Durée de vie d'une réservation. Au-delà, elle ne compte plus dans le solde et
 * sera balayée : un process tué en plein run (déploiement, OOM) ne doit pas
 * geler des crédits pour toujours.
 *
 * Trente minutes : plus long que n'importe quel run gouverné (une poignée de
 * pas sur une cible), assez court pour qu'un incident ne coûte pas la journée.
 */
export const RESERVATION_TTL_MS = 30 * 60_000

/** Ce qu'une ligne de réservation porte d'utile au calcul — le seul
 *  sous-ensemble dont dépend « qu'est-ce qui est en vol ». */
type ReservationRow = Pick<CreditReservationEntity, 'amount' | 'expires_at' | 'reference' | 'state'>

/**
 * Une réservation est VIVANTE si elle est encore `reserved` ET pas périmée.
 *
 * Les deux conditions comptent : `reserved` seul laisserait un run mort geler
 * des crédits, et la date seule compterait une réservation déjà soldée.
 */
function isLive(row: ReservationRow, now: Date): boolean {
  return row.state === 'reserved' && new Date(row.expires_at).getTime() > now.getTime()
}

/**
 * Total PROMIS et pas encore soldé — ce qu'il faut retrancher du solde annoncé
 * pour ne pas promettre deux fois les mêmes crédits.
 *
 * ⚠️ Dédupliqué par RÉFÉRENCE, et c'est la nuance qui compte. Une référence est
 * une dépense (un run, une action) ; deux lignes `reserved` qui la portent
 * couvrent LA MÊME dépense — un rejeu de la file, un double clic. Les
 * additionner annoncerait un manque de crédits qui n'existe pas, et le
 * commercial verrait « 0 restant » avec 8 crédits en poche. On garde le montant
 * le plus ÉLEVÉ de la référence : entre deux estimations d'une même dépense, la
 * prudente est celle qui promet le moins.
 */
export function liveReservedTotal(rows: readonly ReservationRow[], now: Date): number {
  const byReference = new Map<string, number>()
  for (const row of rows) {
    if (!isLive(row, now)) continue
    byReference.set(row.reference, Math.max(byReference.get(row.reference) ?? 0, row.amount))
  }
  let total = 0
  for (const amount of byReference.values()) total += amount
  return total
}

/**
 * Le solde qu'on a le DROIT de promettre : ce qui reste au pool, moins ce qui
 * est déjà engagé par une action en cours.
 *
 * Jamais négatif — un dépassement (débit concurrent, ajustement opérateur) se
 * lit « 0 », comme partout ailleurs dans ce module. Attention : « 0 » est ici un
 * solde MESURÉ à zéro, pas une absence de mesure — c'est la seule raison pour
 * laquelle l'écrire est juste.
 */
export function spendableCredits(remaining: number, reserved: number): number {
  return Math.max(0, remaining - reserved)
}
