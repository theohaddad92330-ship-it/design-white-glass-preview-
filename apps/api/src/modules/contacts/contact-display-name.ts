/**
 * #4586 — un NOM n'est jamais une adresse e-mail.
 *
 * Mesuré en recette (26/10) : des fiches « à qualifier » se lisaient `prenom.nom@société.com`, parce que trois
 * chemins d'écriture (synchro CRM, import de fichier, CSV) remplaçaient un nom absent par l'adresse. Un identifiant
 * technique pris pour une personne : le contact n'est ni rangé ni cherchable par son nom.
 *
 * UN seul endroit (GA-26) : les écritures et le rattrapage lisent cette règle. Ce qu'elle fait quand le nom manque ou
 * qu'il est lui-même une adresse :
 *  - la partie locale lisible, DANS L'ORDRE OÙ ELLE EST ÉCRITE (on ne devine pas « prénom nom » ou « nom prénom »),
 *    et MARQUÉE dérivée (`derived`) — `isIncompleteContactName` laisse un enrichissement la remplacer ;
 *  - une boîte de service (contact@, rh@…) ou un seul mot ne désigne personne : « Contact à compléter », jamais
 *    l'adresse, jamais une personne inventée.
 */

/** Le libellé d'une fiche dont aucun nom n'est connu ni dérivable honnêtement. */
export const UNNAMED_CONTACT_NAME = 'Contact à compléter'

import { isPlaceholderEmail } from './placeholder-email'

const EMAIL_SHAPE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Boîtes de service : elles ne sont la boîte de personne. */
const ROLE_MAILBOXES = new Set([
  'contact',
  'info',
  'infos',
  'rh',
  'hello',
  'bonjour',
  'admin',
  'support',
  'sales',
  'commercial',
  'jobs',
  'recrutement',
  'direction',
  'compta',
  'comptabilite',
  'accueil',
  'secretariat',
  'noreply',
  'no-reply',
  'dsi',
])

export function looksLikeEmailAddress(value: string | null | undefined): boolean {
  return EMAIL_SHAPE.test((value ?? '').trim())
}

function capitalise(token: string): string {
  return token.charAt(0).toLocaleUpperCase('fr') + token.slice(1).toLocaleLowerCase('fr')
}

function nameFromLocalPart(email: string): string | null {
  const local = email.trim().split('@')[0] ?? ''
  if (ROLE_MAILBOXES.has(local.toLowerCase())) return null
  const tokens = local.split(/[._\-+]+/).filter(token => /^\p{L}{2,}$/u.test(token))
  return tokens.length >= 2 ? tokens.map(capitalise).join(' ') : null
}

type WritableContactName = { readonly name: string; readonly derived: boolean }

/** Le nom à ÉCRIRE pour une fiche : celui de la source s'il est un nom, sinon la partie locale (marquée), sinon « à compléter ». */
export function writableContactName(
  name: string | null | undefined,
  email: string | null | undefined,
): WritableContactName {
  const given = (name ?? '').trim()
  if (given && !looksLikeEmailAddress(given)) return { name: given, derived: false }
  const address = looksLikeEmailAddress(given) ? given : (email ?? '').trim()
  const derived = address ? nameFromLocalPart(address) : null
  return derived ? { name: derived, derived: true } : { name: UNNAMED_CONTACT_NAME, derived: false }
}

/**
 * #4586 — le nom à AFFICHER d'une ligne DÉJÀ en base : celles créées avant la garde d'écriture portent encore leur adresse
 * pour nom (mesuré en prod 27/10 : `/contacts?q=menette` → `menette.sebastien@capgemini.com`). Le rattrapage de la base est
 * un geste d'opérateur ; la lecture, elle, ne montre plus jamais une adresse comme nom. Lecture seule : la base n'est pas
 * touchée, et un nom qui n'est pas une adresse passe tel quel.
 */
export function displayedContactName(fullName: string, email: string | null | undefined): string {
  return looksLikeEmailAddress(fullName) ? writableContactName(fullName, email).name : fullName
}

/** #4599 — l'adresse AFFICHÉE : un gabarit (`prenom.nom@…`) n'est l'adresse de personne, il se lit « absent ». Lecture seule. */
export function displayedContactEmail(email: string | null | undefined): string | null {
  return email && !isPlaceholderEmail(email) ? email : null
}

/**
 * #4586 — le nom RÉPARÉ d'une fiche DÉJÀ en base, ou `null` quand rien n'est à réparer. Deux formes, jamais de devinette :
 *  - société collée (« Prénom Nom <Société> ») : retirée SEULEMENT si elle égale le nom du compte (le reste doit
 *    comporter au moins un mot) ;
 *  - prénoms répétés séparés par des virgules (« Prénom, Prénom, Prénom NOM ») : repliés quand chaque segment
 *    précédent est le prénom du dernier segment.
 */
export function repairedContactName(fullName: string, companyName: string | null | undefined): string | null {
  const name = fullName.trim().replace(/\s+/g, ' ')
  const parts = name.split(/\s*,\s*/)
  if (parts.length > 1) {
    const last = parts[parts.length - 1] ?? ''
    const first = last.split(' ')[0]?.toLocaleLowerCase('fr') ?? ''
    const repeated = parts.slice(0, -1).every(part => part.toLocaleLowerCase('fr') === first)
    return repeated && last.includes(' ') ? last : null
  }
  const company = (companyName ?? '').trim().replace(/\s+/g, ' ')
  if (
    company &&
    name.length > company.length + 1 &&
    name.toLocaleLowerCase('fr').endsWith(` ${company.toLocaleLowerCase('fr')}`)
  )
    return name.slice(0, name.length - company.length).trim()
  return null
}

/**
 * #4586.5 — la déduction se VOIT : vrai quand le nom affiché a été tiré de l'adresse, soit parce que l'écriture l'a marqué
 * (`raw_data.nameDerivedFromEmail`, lu en texte par la liste), soit parce que la ligne, antérieure à la garde, porte encore
 * l'adresse pour nom et que `displayedContactName` la lit par sa partie locale. Une boîte de service (« Contact à compléter »)
 * n'est PAS une déduction : rien n'est deviné.
 */
export function isNameDerivedFromEmail(
  fullName: string,
  email: string | null | undefined,
  markerText: string | null | undefined,
): boolean {
  if (markerText === 'true') return true
  return looksLikeEmailAddress(fullName) && writableContactName(fullName, email).derived
}
