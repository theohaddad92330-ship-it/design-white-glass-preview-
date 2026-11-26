import type { Contact } from '@bellum/contracts'
import { comparePriority } from '@/features/contacts/lib/contactPriority'

/**
 * #3686.4 — l'ordre d'une liste de contacts au sein d'un groupe.
 *
 * Avant : le SEUL rang `priority` 1-5 de l'IA. Désormais, dans l'ordre :
 *  1. le « motif d'approche » — tranché sans Louis : c'est le texte que le
 *     commercial a tapé dans la recherche de l'onglet (aucune autre entrée
 *     n'existe sur la liste). Une personne dont le PÉRIMÈTRE (ou les points
 *     clés) porte ce motif passe devant celle dont seul le titre le porte,
 *     qui passe devant les autres : un responsable de périmètre n'est pas
 *     dépassé par un dirigeant groupe pour une recherche opérationnelle ;
 *  2. le rang IA (inchangé) ;
 *  3. à rang égal seulement, l'accessibilité : e-mail vérifié ou téléphone connu.
 *
 * Sans motif, les clés 2-3 : le rang IA reste maître. Rien n'est filtré : cet
 * ordre ne retire personne (« le rôle change l'ORDRE, jamais le CONTENU »), et
 * ne crée ni lien hiérarchique ni autorité budgétaire.
 * Non couvert : les relations de l'équipe (aucune donnée de liste ne les porte
 * aujourd'hui) — jamais devinées.
 */

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** 2 = le périmètre / les points clés portent le motif, 1 = le titre seul, 0 = ni l'un ni l'autre ou pas de motif. */
export function approachFit(contact: Contact, focus: string): 0 | 1 | 2 {
  const needle = fold(focus)
  if (!needle) return 0
  const scopeText = fold([contact.scope ?? '', ...(contact.key_points ?? [])].join(' '))
  if (scopeText.includes(needle)) return 2
  return fold(contact.title ?? '').includes(needle) ? 1 : 0
}

function isReachable(contact: Contact): boolean {
  return contact.email_verified === true || Boolean(contact.phone?.trim())
}

export function sortForApproach(contacts: readonly Contact[], focus: string): Contact[] {
  return [...contacts].sort(
    (a, b) =>
      approachFit(b, focus) - approachFit(a, focus) ||
      comparePriority(a.priority, b.priority) ||
      Number(isReachable(b)) - Number(isReachable(a)),
  )
}
