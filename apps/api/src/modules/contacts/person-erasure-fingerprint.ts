import { personErasureDigest } from '../../common/person-erasure-hmac'
import { contactIdentityKeys } from './contact-identity'

/**
 * #2297 — L'EMPREINTE D'UNE PERSONNE EFFACÉE (RGPD art. 17, décision Louis du
 * 19/09/2026). Un seul calcul, lu par les TROIS endroits qui en ont besoin :
 * l'effacement qui l'écrit (`PersonErasureService`), la collecte d'une analyse
 * (`ContactsService.bulkInsert`) et l'enrichissement
 * (`ContactsService.preflightEnrichment` / `enrichContact`) qui la vérifient à
 * l'ENTRÉE. Deux calculs divergeraient, et la personne reviendrait par celui
 * qui a dérivé.
 *
 * CE QUE C'EST : un HMAC-SHA-256 (#2297.51, clé `PERSON_ERASURE_HMAC_KEY`,
 * `common/person-erasure-hmac.ts`) de chaque clé d'identité de
 * `contactIdentityKeys` (identifiant fournisseur, e-mail, profil, nom), préfixée
 * par l'espace. Une empreinte ne se relit pas en nom ; elle répond à une seule
 * question — « cette personne entrante a-t-elle été effacée ? ».
 *
 * DEUX PORTÉES, et c'est délibéré :
 *   - les clés FORTES (identifiant fournisseur, e-mail, profil) valent pour
 *     tout l'ESPACE : c'est la même personne où qu'elle travaille désormais ;
 *   - la clé de NOM vaut pour le seul COMPTE où elle a été effacée. Le registre
 *     ne rend qu'un nom (« PERRIN Claire ») : sans cette clé, la prochaine
 *     analyse du compte la recréerait. Mais « deux homonymes chez deux sociétés
 *     différentes ne sont pas rapprochés » (doctrine) — une Claire Perrin
 *     d'une autre société n'a rien demandé, et la bloquer effacerait quelqu'un
 *     qui n'a pas exercé ce droit.
 *
 * #2297.51 — l'écart « empreintes sans secret » de la doctrine de
 * l'effacement est levé : sans la clé, qui détient la table ET devine la
 * personne ne peut plus vérifier sa supposition par dictionnaire. Sans clé,
 * aucune empreinte ne se calcule (503) — jamais de repli sur un SHA-256 nu.
 */
type ErasablePerson = {
  fullName?: string | null
  email?: string | null
  linkedinUrl?: string | null
  apolloId?: string | null
  /** Le compte où la personne a été vue — la portée de sa clé de NOM. */
  accountId?: string | null
}

export function personErasureFingerprints(workspaceId: string, person: ErasablePerson): string[] {
  const keys = contactIdentityKeys(person).map(key =>
    key.startsWith('name:') ? `account:${person.accountId ?? '-'}|${key}` : key,
  )
  // #2297.51 — HMAC à clé dédiée ; lève une indisponibilité sans clé.
  return [...new Set(keys.map(key => personErasureDigest(workspaceId, key)))]
}

/** #2297 — une de ces empreintes figure-t-elle parmi celles effacées ? */
export function isErasedPerson(fingerprints: readonly string[], erased: ReadonlySet<string>): boolean {
  return fingerprints.some(print => erased.has(print))
}

/**
 * #2297.51 — l'empreinte d'une ADRESSE, telle que l'opposition d'une personne
 * effacée la garde dans `email_suppressions`. C'est la MÊME que la clé `email:`
 * de ses empreintes d'effacement — un seul calcul, pas un second qui dériverait.
 * `null` quand ce n'est pas une adresse. Lève une indisponibilité sans clé.
 */
export function erasedEmailFingerprint(workspaceId: string, email: string | null | undefined): string | null {
  return personErasureFingerprints(workspaceId, { email })[0] ?? null
}
