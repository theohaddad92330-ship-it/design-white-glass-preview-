import { isPlausiblePhoneNumber } from '@bellum/contracts'

/**
 * Lire une coordonnée dans une réponse dont on ne connaît PAS le contrat.
 *
 * Décision Louis du 03/08 sur Kaspr et FullEnrich : « code défensif sans
 * identifiants ». Leur documentation vit derrière un compte client ; on ne peut
 * donc ni vérifier les noms de champs, ni les figer. Deviner `data.email` puis
 * découvrir que le fournisseur écrit `results[0].contact.email_address`
 * produirait un provider muet — et personne ne s'en apercevrait, puisqu'un
 * enrichissement qui ne trouve rien est un cas NORMAL.
 *
 * La réponse est de ne rien deviner du tout : on parcourt l'arbre et on retient
 * ce qui EST une adresse ou un numéro, quelle que soit la clé qui le porte.
 *
 * Le risque bascule alors du bon côté. Un contrat mal deviné donnait « ça débite
 * un crédit pour une réponse mal lue » ; ici il donne « ça ne trouve rien ».
 * Trois verrous tiennent cette promesse :
 *
 * 1. **La forme fait foi.** Seule une chaîne qui est une adresse valide est
 *    retenue comme adresse ; un numéro doit avoir assez de chiffres pour en
 *    être un. Aucune clé n'est prise pour argent comptant.
 * 2. **On ne se relit pas soi-même.** Toute valeur qu'on a ENVOYÉE au
 *    fournisseur est écartée — un service qui renvoie sa requête en écho ne doit
 *    pas nous faire croire qu'il a trouvé quelque chose.
 * 3. **Le domaine attendu prime.** Quand on connaît le domaine du compte, une
 *    adresse sur un autre domaine n'est retenue qu'à défaut : c'est ainsi qu'on
 *    évite de payer pour l'adresse personnelle d'un homonyme.
 */

/** Assez strict pour écarter du texte, assez large pour les adresses réelles. */
const EMAIL_RE = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[a-z]{2,}$/i

/** Les fournisseurs marquent parfois une adresse « probable ». On ne la prend
 *  pas : une adresse devinée par motif est exactement ce qu'un commercial ne
 *  doit pas envoyer, et c'est ce pour quoi il aurait payé un crédit. */
const GUESS_MARKERS = ['pattern', 'guess', 'probable', 'predicted', 'inferred', 'catch_all', 'catchall']

// #2297.39 (24/09/2026) — l'heuristique « au moins huit chiffres, aucune
// lettre » a déménagé dans `@bellum/contracts` (`looksLikePhoneNumber`) pour
// que la fiche contact (web) puisse aussi s'en servir, sans la recopier
// (GA-26).
//
// #3850.1 (08/10) — ce module est un POINT D'ÉCRITURE (Kaspr, FullEnrich) :
// il retient désormais `isPlausiblePhoneNumber` (E.164 plausible ou format
// local français), plus stricte que `looksLikePhoneNumber`. Mesuré en prod
// le 08/10 : un code postal brésilien « 90480-000 » a la forme d'un numéro
// pour `looksLikePhoneNumber` (8 chiffres, aucune lettre) et aurait été
// retenu ici si un fournisseur l'avait renvoyé dans un champ non documenté.

type Candidate = { value: string; path: string[] }

/** Parcours borné de l'arbre — profondeur et nombre de nœuds. Une réponse
 *  hostile ne doit pas pouvoir faire tourner le serveur. */
function walk(
  node: unknown,
  visit: (value: string, path: string[]) => void,
  path: string[] = [],
  budget = { n: 5000 },
): void {
  if (budget.n <= 0 || path.length > 8) return
  budget.n -= 1
  if (typeof node === 'string') {
    visit(node, path)
    return
  }
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) walk(item, visit, [...path, String(index)], budget)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      walk(value, visit, [...path, key], budget)
    }
  }
}

/** Le chemin porte-t-il une marque de « devinette » ? */
function isGuessPath(path: readonly string[]): boolean {
  const joined = path.join('.').toLowerCase()
  return GUESS_MARKERS.some(marker => joined.includes(marker))
}

type TolerantContact = { email?: string; phone?: string }

/**
 * Extrait une adresse et un numéro d'une réponse de forme inconnue.
 *
 * `sent` contient tout ce qu'on a envoyé au fournisseur : ces valeurs sont
 * écartées d'office.
 */
export function extractContact(
  payload: unknown,
  options: { expectedDomain?: string; sent?: readonly string[] } = {},
): TolerantContact {
  const sent = new Set((options.sent ?? []).map(value => value.trim().toLowerCase()).filter(Boolean))
  const expectedDomain =
    options.expectedDomain
      ?.trim()
      .toLowerCase()
      .replace(/^www\./, '') || null

  const emails: Candidate[] = []
  const phones: Candidate[] = []

  walk(payload, (value, path) => {
    const trimmed = value.trim()
    if (!trimmed || sent.has(trimmed.toLowerCase())) return
    if (isGuessPath(path)) return
    if (EMAIL_RE.test(trimmed)) emails.push({ value: trimmed, path })
    else if (isPlausiblePhoneNumber(trimmed)) phones.push({ value: trimmed, path })
  })

  // Le domaine attendu prime : une adresse chez le client vaut mieux qu'une
  // adresse personnelle trouvée au même endroit de l'arbre.
  const onExpectedDomain = expectedDomain
    ? emails.find(candidate => candidate.value.toLowerCase().endsWith(`@${expectedDomain}`))
    : undefined

  const email = onExpectedDomain?.value ?? emails[0]?.value
  const phone = phones[0]?.value

  return { ...(email ? { email } : {}), ...(phone ? { phone } : {}) }
}
