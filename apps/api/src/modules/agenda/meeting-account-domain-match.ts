import type { AgendaEvent } from '@bellum/contracts'

/**
 * #2390.4/#2390.17 (épopée #2926) — rattacher un rendez-vous à un compte pour
 * décider, SANS geste humain, qu'aucune tâche de préparation n'existe encore.
 *
 * Volontairement le mirroir ÉTROIT de la branche « domaine » de
 * `matchAccountForEvent` (`apps/web/.../meeting-account-match.ts`) : c'est la
 * seule des deux preuves de ce fichier qui soit une PREUVE (le domaine d'un
 * invité externe), jamais la branche « titre », un INDICE que ce fichier ne
 * porte pas — créer une tâche de préparation sur un rapprochement de titre
 * (deux mots qui se ressemblent) écrirait une action sur un mauvais dossier,
 * sans qu'aucun commercial ne l'ait relu avant qu'elle apparaisse.
 */

export type DomainMatchableAccount = {
  readonly id: string
  readonly company_name: string
  readonly website: string | null
}

function domainOf(value: string | null | undefined): string | null {
  let s = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!s) return null
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1)
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0]!.split('?')[0]!
  s = s.replace(/^www\./, '')
  return s.includes('.') ? s : null
}

export function matchAccountByDomain(
  event: Pick<AgendaEvent, 'attendees'>,
  accounts: readonly DomainMatchableAccount[],
): DomainMatchableAccount | null {
  const externalDomains = new Set(
    (event.attendees ?? [])
      .filter(attendee => attendee.external)
      .map(attendee => domainOf(attendee.email))
      .filter((domain): domain is string => Boolean(domain)),
  )
  if (!externalDomains.size) return null
  return (
    accounts.find(account => {
      const domain = domainOf(account.website)
      return domain !== null && externalDomains.has(domain)
    }) ?? null
  )
}
