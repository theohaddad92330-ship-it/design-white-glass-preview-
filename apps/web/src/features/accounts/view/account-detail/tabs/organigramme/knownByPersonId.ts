import { knownPersonKey, type KnownPeople } from '@bellum/contracts'
import type { FocalKnown } from './focalOrgData'

/**
 * #4072.1 — les personnes du graphe que l'espace connaît déjà (CRM, mission passée),
 * rapprochées au nom EXACT (forme neutralisée, jamais l'orthographe). UN calcul pour
 * la vue focale ET la carte d'influence (GA-26) : rien n'est deviné.
 */
export function buildKnownByPersonId(
  people: ReadonlyArray<{ id: string; fullName: string }>,
  knownPeople: KnownPeople | null,
): Map<string, FocalKnown> {
  const byKey = new Map((knownPeople?.people ?? []).map(known => [knownPersonKey(known.fullName), known]))
  const out = new Map<string, FocalKnown>()
  for (const person of people) {
    const known = byKey.get(knownPersonKey(person.fullName))
    if (known) out.set(person.id, { reasons: known.reasons, lastDate: known.lastDate })
  }
  return out
}
