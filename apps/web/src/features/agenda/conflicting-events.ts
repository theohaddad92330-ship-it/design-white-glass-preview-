import type { AgendaConflict } from '@bellum/contracts'

/**
 * Les rendez-vous qui se chevauchent, par identifiant.
 *
 * Le brief affichait « Conflits · 4 » au-dessus d'une liste où RIEN ne
 * désignait les quatre créneaux concernés. Un compteur sans référent est pire
 * qu'un compteur absent : il annonce un problème puis laisse chercher.
 *
 * Le calcul reste au serveur (`free-slots.ts`) — un chevauchement recalculé
 * dans le navigateur avec un autre fuseau ou un autre arrondi finirait par
 * contredire le compteur affiché juste au-dessus. On ne fait ici que traduire
 * des PAIRES en un ensemble d'identifiants, ce qu'une liste sait consommer.
 */
export function conflictingEventIds(conflicts: readonly AgendaConflict[] | undefined): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const conflict of conflicts ?? []) {
    // Les DEUX rendez-vous d'une paire sont en conflit : n'en marquer qu'un
    // laisserait l'autre passer pour un créneau libre.
    if (conflict?.first?.id) ids.add(conflict.first.id)
    if (conflict?.second?.id) ids.add(conflict.second.id)
  }
  return ids
}

/**
 * #2926 — la MÊME donnée que `conflictingEventIds` ci-dessus, indexée par
 * évènement plutôt qu'en simple ensemble : une carte cliquée doit retrouver
 * SON conflit (pour ouvrir la boîte de conflit) sans que l'appelant ait à
 * chercher la paire à la main.
 */
export function conflictByEventId(
  conflicts: readonly AgendaConflict[] | undefined,
): ReadonlyMap<string, AgendaConflict> {
  const byId = new Map<string, AgendaConflict>()
  for (const conflict of conflicts ?? []) {
    if (conflict?.first?.id) byId.set(conflict.first.id, conflict)
    if (conflict?.second?.id) byId.set(conflict.second.id, conflict)
  }
  return byId
}
