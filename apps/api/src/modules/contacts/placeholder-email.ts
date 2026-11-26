/**
 * #4599 — une adresse dont la partie locale est un REMPLAÇANT (`prenom.nom@…`) n'est l'adresse de personne.
 *
 * Le gabarit d'un exemple de prompt (« cold_email:prenom.nom@domaine.com ») fuyait dans la sortie du modèle, qui ne
 * substituait que le domaine : huit fiches d'un même compte portaient la même fausse adresse. Une adresse fabriquée
 * est pire qu'une adresse absente — elle a l'air vraie.
 *
 * PUR : la garde REFUSE et dit pourquoi, elle ne répare jamais en devinant (deviner l'adresse réelle est le travail
 * de l'estimateur, qui vérifie MX + SMTP avant d'écrire).
 */

/** Les mots-remplaçants, FR et EN : prénom, nom de famille, et leurs variantes d'invite (« votre.nom »). */
const FIRST = ['prenom', 'firstname', 'first', 'givenname', 'given', 'forename']
const LAST = ['nom', 'lastname', 'last', 'surname', 'familyname', 'family']
const PLACEHOLDER_WORDS = new Set([...FIRST, ...LAST, 'name', 'votre', 'your', 'initiale', 'initial'])

/** « nom » seul ou « prenom_nom », « votre.nom », « firstname-lastname » : TOUS les mots sont des remplaçants. */
export function isPlaceholderLocalPart(local: string): boolean {
  const words = local
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[._-]+/)
    .filter(Boolean)
  if (words.length === 0 || words.length > 3) return false
  return words.every(word => PLACEHOLDER_WORDS.has(word))
}

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim()
  const at = raw.lastIndexOf('@')
  if (at <= 0 || at === raw.length - 1) return false
  const local = raw.slice(0, at)
  const plus = local.indexOf('+')
  return isPlaceholderLocalPart(plus > 0 ? local.slice(0, plus) : local)
}

type PlaceholderEmailVerdict = { email: string | null; refused: 'placeholder_local_part' | null }

/** La porte d'écriture : l'adresse vraie passe, le gabarit sort `null` AVEC sa raison, l'absence reste une absence. */
export function refusePlaceholderEmail(value: string | null | undefined): PlaceholderEmailVerdict {
  const raw = (value ?? '').trim()
  if (!raw) return { email: null, refused: null }
  if (isPlaceholderEmail(raw)) return { email: null, refused: 'placeholder_local_part' }
  return { email: raw, refused: null }
}

/**
 * #4599 — le MÊME verdict que {@link isPlaceholderEmail}, en motif Postgres (`~*`) : le filtre de liste
 * `placeholderEmail` compte les gabarits EN BASE, quand l'écran n'en montre que 25 sur 67 224. UNE liste de mots (GA-26) :
 * ajouter un remplaçant à la garde d'écriture l'ajoute ici. Les `e` acceptent leurs accents (« prénom »), comme le
 * `normalize('NFD')` de la garde ; 1 à 3 mots, sous-adresse `+tag` tolérée.
 */
export function placeholderEmailSqlPattern(): string {
  const word = `(${[...PLACEHOLDER_WORDS].map(w => w.replace(/e/g, '[eéèêë]')).join('|')})`
  return `^${word}([._-]${word}){0,2}([+][^@]*)?@[^@]+$`
}

/**
 * #4599 — « a un e-mail » = une adresse RÉELLE : renseignée et qui n'est pas un gabarit. UN prédicat pour le filtre
 * `channel=with_email` et pour le compteur « Avec e-mail » (même population, GA-26).
 */
export function recordedEmailSql(alias: string): string {
  return `(${alias}.email IS NOT NULL AND ${alias}.email !~* '${placeholderEmailSqlPattern().replace(/'/g, "''")}')`
}
