import { z } from 'zod'

/**
 * L'anonymisation d'un dossier de compétences (PDF 3 §9.2 et §9.3).
 *
 * Elle compte DEUX FOIS, et les deux raisons sont indépendantes :
 *
 *  - **le RGPD** : un dossier envoyé à un prospect qui ne retiendra pas le
 *    profil laisse une donnée personnelle chez un tiers ;
 *  - **la protection commerciale** : un client qui a le nom complet peut
 *    contacter le consultant en direct et court-circuiter l'ESN. C'est le
 *    risque que les ESN citent en premier, et il n'a rien de théorique.
 *
 * Trois décisions de conception :
 *
 *  - **fonction PURE, appliquée APRÈS génération.** Jamais demandée au modèle :
 *    un modèle qui « oublie » d'anonymiser une occurrence sur douze produit un
 *    document qui a l'air anonyme et ne l'est pas — c'est pire que pas
 *    d'anonymisation du tout, parce que personne ne relit ;
 *  - **on masque les NOMS DE CLIENTS des missions autant que l'identité.**
 *    « J'ai travaillé chez Orange » identifie autant qu'un patronyme dans un
 *    milieu où tout le monde se connaît ;
 *  - **on ne masque QUE ce qu'on nous a donné.** La fonction ne devine pas un
 *    nom dans le texte : elle remplace les chaînes qu'on lui nomme. Deviner
 *    ferait disparaître des mots ordinaires — un consultant qui s'appelle
 *    « Leroy » verrait « le roy » survivre et « Leroy Merlin » disparaître.
 */

export const ANONYMISATION_RULES = [
  'nom_complet', //     rien n'est masqué — le mode par défaut historique
  'prenom_initiale', // « Yanis B. »
  'initiales', //       « Y. B. »
  'trigramme', //       « YBE »
] as const
export const anonymisationRuleSchema = z.enum(ANONYMISATION_RULES)
export type AnonymisationRule = (typeof ANONYMISATION_RULES)[number]

/** Ce qu'un dossier peut masquer, au-delà du nom. */
export const ANONYMISABLE_FIELDS = ['email', 'phone', 'photo', 'address', 'client_names'] as const
export const anonymisableFieldSchema = z.enum(ANONYMISABLE_FIELDS)
export type AnonymisableField = (typeof ANONYMISABLE_FIELDS)[number]

export const anonymisationSettingsSchema = z
  .object({
    rule: anonymisationRuleSchema.default('nom_complet'),
    /** Les champs masqués en plus du nom. */
    hide: z.array(anonymisableFieldSchema).default([]),
  })
  .strict()
export type AnonymisationSettings = z.infer<typeof anonymisationSettingsSchema>

/** Ce qu'on remplace par quoi. Ce que la fonction ne connaît pas, elle le laisse. */
export type AnonymisationInput = {
  /** `null` quand la fiche n'a pas de nom (D366) : il n'y a alors rien à
   *  masquer, et rien qui puisse fuir. */
  fullName: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  /** Les clients cités dans les missions, à remplacer par leur secteur. */
  clients?: readonly { name: string; sector?: string | null }[]
}

/** Le marque-place d'un champ masqué. Explicite : un blanc se lirait comme un
 *  oubli de saisie, et quelqu'un finirait par le combler. */
const MASKED = '[masqué]'

/**
 * Le nom, réduit selon la règle.
 *
 * Les particules (« de », « van », « el ») font PARTIE du nom de famille et
 * suivent l'initiale : « Marie de La Fontaine » donne « Marie d. L. F. » en
 * initiales, jamais « Marie L. » — supprimer la particule change le nom.
 */
export function shortenName(fullName: string, rule: AnonymisationRule): string {
  const parts = fullName
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return ''
  if (rule === 'nom_complet') return fullName.trim()

  const [first, ...rest] = parts
  const firstName = first as string

  if (rule === 'prenom_initiale') {
    if (rest.length === 0) return firstName
    // Le nom composé garde ses DEUX initiales : « Jean-Marc Le Goff » devient
    // « Jean-Marc L. G. », parce que « L. » seul ne dit plus qui c'est.
    return `${firstName} ${rest.map(part => abbreviate(part)).join(' ')}`
  }

  if (rule === 'initiales') {
    return parts.map(part => abbreviate(part)).join(' ')
  }

  // Trigramme, comme les ESN le pratiquent : l'initiale du prénom puis les deux
  // premières lettres du nom de famille (« Yanis Berthier » → YBE). À partir de
  // trois parties, ce sont les trois premières initiales — « Maria Isabel
  // Garcia Lopez » donne MIG, et non un mélange qu'on ne saurait pas relire.
  if (parts.length >= 3) {
    return parts
      .slice(0, 3)
      .map(part => firstLetter(part))
      .join('')
  }
  const surname = stripAccents(parts[parts.length - 1] ?? '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
  if (parts.length === 1) return surname.slice(0, 3)
  return (firstLetter(firstName) + surname.slice(0, 2)).slice(0, 3)
}

/**
 * Une partie de nom → son initiale suivie d'un point.
 *
 * La CASSE d'origine est conservée : « de La Fontaine » donne « d. L. F. » et
 * non « D. L. F. ». Une particule s'écrit en minuscule, et la mettre en
 * majuscule change le nom autant que la supprimer. Une partie déjà réduite à
 * une initiale (« B. ») n'est pas doublée en « B.. ».
 */
function abbreviate(part: string): string {
  const cleaned = stripAccents(part).replace(/[^A-Za-z]/g, '')
  const letter = cleaned[0] ?? ''
  if (!letter) return ''
  // La casse vient du caractère d'ORIGINE, pas de sa version sans accent.
  const original = [...part].find(char => /[A-Za-zÀ-ÿ]/.test(char)) ?? letter
  const shown = original === original.toLowerCase() ? letter.toLowerCase() : letter.toUpperCase()
  return `${shown}.`
}

/** La première lettre SIGNIFIANTE, accents retirés, en majuscule. */
function firstLetter(part: string): string {
  const cleaned = stripAccents(part).replace(/[^A-Za-z]/g, '')
  return (cleaned[0] ?? '').toUpperCase()
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Applique l'anonymisation à un texte déjà généré.
 *
 * L'ordre des remplacements compte : le nom COMPLET d'abord, les parties
 * ensuite. Commencer par le prénom laisserait le nom de famille orphelin dans
 * « Yanis Berthier » → « Yanis B. erthier ».
 */
export function anonymiseText(text: string, input: AnonymisationInput, settings: AnonymisationSettings): string {
  let output = text

  if (settings.rule !== 'nom_complet' && input.fullName && input.fullName.trim()) {
    const shortened = shortenName(input.fullName, settings.rule)
    output = replaceAll(output, input.fullName.trim(), shortened)
    // Les parties encore présentes isolément deviennent leur initiale. Le
    // prénom n'est retiré QU'À PARTIR des initiales : la règle « prénom +
    // initiale » le garde, c'est tout son intérêt.
    const parts = input.fullName.split(/\s+/).filter(Boolean)
    const removable = settings.rule === 'prenom_initiale' ? parts.slice(1) : parts
    // De la plus longue à la plus courte : remplacer « Le » avant « Le Goff »
    // couperait le nom en deux.
    for (const part of [...removable].sort((a, b) => b.length - a.length)) {
      if (part.length < 2) continue
      output = replaceAll(output, part, abbreviate(part))
    }
  }

  const hide = new Set(settings.hide)
  if (hide.has('email') && input.email) output = replaceAll(output, input.email, MASKED)
  if (hide.has('phone') && input.phone) output = replaceAll(output, input.phone, MASKED)
  if (hide.has('address') && input.address) output = replaceAll(output, input.address, MASKED)

  if (hide.has('client_names')) {
    // Un client devient son SECTEUR, pas un blanc : « un acteur bancaire de
    // premier plan » se lit, « [masqué] » fait douter du reste du dossier.
    for (const client of input.clients ?? []) {
      if (!client.name.trim()) continue
      output = replaceAll(output, client.name, client.sector?.trim() || 'un acteur du secteur')
    }
  }

  return output
}

/** Remplacement littéral, sans expression régulière : un nom peut contenir des
 *  caractères qui en ont un sens (« O'Brien », « Jean-Marc »). */
function replaceAll(haystack: string, needle: string, replacement: string): string {
  if (!needle) return haystack
  return haystack.split(needle).join(replacement)
}

/**
 * Le nom complet survit-il quelque part dans le document ?
 *
 * C'est la vérification que le ticket exige (« aucune occurrence du nom complet
 * dans le PDF généré »), et elle est SÉPARÉE de l'anonymisation : une fonction
 * qui se vérifie elle-même ne vérifie rien.
 */
export function leaksFullName(text: string, fullName: string | null): boolean {
  // Une fiche SANS nom ne peut rien laisser fuir : il n'y a pas de nom à
  // chercher. Rendre `true` par prudence bloquerait toute génération de CV
  // anonymisé sur les fiches nées d'un dépôt (D366).
  const trimmed = (fullName ?? '').trim()
  if (!trimmed) return false
  return text.includes(trimmed)
}
