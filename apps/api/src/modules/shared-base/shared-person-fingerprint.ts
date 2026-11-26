import { createHash } from 'node:crypto'
import { isPersonErasureKeyConfigured, personErasureDigest } from '../../common/person-erasure-hmac'
import { contactIdentityKeys, normalizeFullName } from '../contacts/contact-identity'

/**
 * #3989 — L'EMPREINTE D'UNE PERSONNE DANS LA BASE COMMUNE (effacement RGPD c67
 * propagé, décision Louis 11/10/2026 : « purge dans la table commune ET dans
 * tous les espaces qui l'ont reçue par elle ; l'empreinte empêche la recollecte »).
 *
 * Le MÊME calcul que `person-erasure-fingerprint.ts` (HMAC-SHA-256 sous
 * `PERSON_ERASURE_HMAC_KEY`, mêmes clés d'identité `contactIdentityKeys`), à
 * une différence près, voulue : la PORTÉE n'est pas un espace mais la base
 * commune ({@link SHARED_BASE_ERASURE_SCOPE}) — une personne effacée dans un
 * espace doit se reconnaître dans la ligne commune qu'un AUTRE espace a
 * collectée. Les clés fortes (identifiant fournisseur, e-mail, profil) valent
 * partout ; la clé de NOM vaut pour la seule SOCIÉTÉ (`company:<clé>|name:…`),
 * pour la raison de l'original : deux homonymes chez deux sociétés différentes
 * ne sont pas la même personne.
 *
 * Sans clé, rien ne se calcule : `personErasureDigest` lève (503). Les
 * appelants qui partagent un fait NOMMÉ s'arrêtent avant
 * (`isPersonErasureKeyConfigured`) — un fait qu'on ne saurait pas effacer ne
 * sort pas.
 */
export const SHARED_BASE_ERASURE_SCOPE = 'shared-base'

type SharedErasablePerson = {
  fullName?: string | null
  email?: string | null
  linkedinUrl?: string | null
  apolloId?: string | null
  /** La société commune (`sharedCompanyKey`) — la portée de la clé de NOM. */
  companyKey: string | null
}

export function sharedPersonFingerprints(person: SharedErasablePerson): string[] {
  const keys = contactIdentityKeys(person).flatMap(key => {
    if (!key.startsWith('name:')) return [key]
    return person.companyKey ? [`company:${person.companyKey}|${key}`] : []
  })
  return [...new Set(keys.map(key => personErasureDigest(SHARED_BASE_ERASURE_SCOPE, key)))]
}

/** La clé de partage est-elle posée ? Sans elle, aucun fait NOMMÉ ne sort. */
export function canShareNamedFacts(): boolean {
  return isPersonErasureKeyConfigured()
}

/**
 * La clé STABLE d'un fait dans sa société, pour qu'un second passage mette à
 * jour la même ligne au lieu d'en ajouter une. Un fait nommé : l'HMAC de son
 * nom aux jetons TRIÉS (« PERRIN Claire » et « Claire Perrin » sont la même
 * ligne). Un fait anonyme : le condensat du rôle seul — il ne désigne personne.
 */
export function sharedFactKey(
  companyKey: string,
  fact: { origin: 'bellum' | 'user'; fullName: string | null; title: string | null },
): string {
  if (fact.origin === 'bellum') {
    const sorted = normalizeFullName(fact.fullName).split(' ').filter(Boolean).sort().join(' ')
    return personErasureDigest(SHARED_BASE_ERASURE_SCOPE, `company:${companyKey}|fact:${sorted}`)
  }
  const role = normalizeFullName(fact.title)
  return createHash('sha256').update(`${companyKey}|role:${role}`).digest('hex')
}
