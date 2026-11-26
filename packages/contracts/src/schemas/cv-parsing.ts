import { z } from 'zod'
import type { RecordFieldAudit } from './crm-record.js'
import { looksLikeAFileName } from './file-name.js'
import { LANGUAGE_LEVELS, type LanguageLevel } from './language.js'

/**
 * Le parsing d'un CV, champ par champ, avec sa PREUVE (PDF 3 §4).
 *
 * Ce que ce contrat impose, et pourquoi :
 *
 *  - **chaque champ porte l'extrait qui le justifie.** Un CV parsé sans preuve
 *    est une liste d'affirmations qu'on ne peut ni vérifier ni corriger.
 *    « D'où vient cette compétence ? » doit avoir une réponse. ⚠️ Deux dates
 *    circulent sur l'entrée en vigueur de l'annexe III de l'AI Act pour le tri
 *    de candidats — 02/08/2026 et 02/12/2027 — et aucune n'a été vérifiée contre
 *    le texte du règlement ; l'exigence de preuve ne dépend d'aucune des deux ;
 *  - **une confiance par champ**, pas une confiance globale. Un CV peut avoir
 *    un nom certain et des dates illisibles, et moyenner les deux cacherait
 *    exactement ce qu'il faut relire ;
 *  - **rien n'est écrit sans passage humain.** Le contrat de sortie du parsing
 *    est une PROPOSITION, distincte de la fiche.
 */

/**
 * Les quatorze blocs du §4, dans l'ordre du document.
 *
 * `education` (#2183.26) est le TREIZIÈME, ajouté après le lot d'origine :
 * aucun bloc « formations »/diplômes ne figurait dans les douze détections —
 * absent du prompt ET du contrat, pas seulement non affiché.
 * `daily_rate` (#3935, 15/10/2026) est le QUATORZIÈME : le TJM, quand le CV l'ÉCRIT, est lu et
 * recopié (renverse « jamais lu » du 31/08). Le prompt interdit toujours de l'ESTIMER.
 */
export const CV_DETECTIONS = [
  'identity', //      nom, prénom, e-mail, téléphone, ville
  'job_title', //     l'intitulé courant
  'skills', //        termes techniques et fonctionnels
  'seniority', //     années totales — CALCULÉES sur des dates réelles
  'sectors', //       déduits des clients cités, marqués comme déduits
  'environments', //  cloud, SGBD, CI/CD, méthode — le contexte, pas la maîtrise
  'tools', //         Jira, Git, Power BI — catégorie à part
  'languages', //     langue + niveau, seulement s'il est écrit
  'certifications', // intitulé, organisme, date
  'mobility', //      rarement dans un CV : `null` par défaut
  'availability', //  date ou mention ; absente ⇒ inconnue, jamais « disponible »
  'experiences', //   client, rôle, dates, réalisations — la base des preuves
  'education', //     formations, diplômes : intitulé, établissement, année (#2183.26)
  'daily_rate', //    TJM ÉCRIT dans le CV, recopié — jamais estimé (#3935, décision Louis 15/10/2026)
] as const
export const cvDetectionSchema = z.enum(CV_DETECTIONS)
export type CvDetection = (typeof CV_DETECTIONS)[number]

/**
 * Les champs CRITIQUES : ceux dont une erreur se propage partout.
 *
 * L'identité désigne la personne, l'intitulé et les compétences décident de ce
 * qu'on lui propose. Une confiance faible sur l'un d'eux interdit l'acceptation
 * en bloc — c'est la seule chose que « Tout accepter » doit savoir refuser.
 */
export const CV_CRITICAL_DETECTIONS: readonly CvDetection[] = ['identity', 'job_title', 'skills']

/** En dessous, un champ ne se valide pas les yeux fermés. */
export const CV_LOW_CONFIDENCE = 0.6

/**
 * Un champ extrait, avec ce qui le justifie.
 *
 * `sourceExcerpt` est OBLIGATOIRE dès qu'il y a une valeur : un champ sans
 * extrait est rejeté par le validateur, parce qu'un champ sans preuve est
 * indistinguable d'une invention.
 */
export const parsedFieldSchema = z
  .object({
    detection: cvDetectionSchema,
    /**
     * Ce qui a été lu. `null` = non trouvé dans le CV — et l'écran l'affiche
     * comme tel, jamais comme une case vide qu'on prendrait pour un oubli.
     */
    value: z.union([z.string(), z.array(z.string()), z.number(), z.null()]),
    confidence: z.number().min(0).max(1),
    /** La phrase du CV qui porte la valeur. Vide seulement si `value` est nul. */
    sourceExcerpt: z.string().max(2000),
    /** Où commence l'extrait dans le texte, pour le surligner au survol. */
    excerptOffset: z.number().int().min(0).nullable(),
  })
  .strict()
  .refine(field => field.value === null || field.sourceExcerpt.trim().length > 0, {
    message: 'Un champ détecté doit citer le passage du CV qui le porte',
    path: ['sourceExcerpt'],
  })
export type ParsedField = z.infer<typeof parsedFieldSchema>

export const cvParseResultSchema = z
  .object({
    fields: z.array(parsedFieldSchema),
    /** La longueur du texte lu — dit à l'écran ce qui a servi de matière. */
    sourceChars: z.number().int().nonnegative(),
  })
  .strict()
export type CvParseResult = z.infer<typeof cvParseResultSchema>

/**
 * « Tout accepter » est-il permis ?
 *
 * `false` dès qu'UN champ lu est en confiance faible.
 *
 * ⚠️ Le PDF se contredit : le §4.2 écrit « actif seulement si aucune confiance
 * faible », le ticket du §14 écrit « désactivé au-delà de 50 % de champs
 * faibles ». On retient la règle STRICTE, pour une raison simple : c'est le
 * dernier écran avant qu'un profil parte chez un client, et choisir
 * l'interprétation la plus permissive de deux formulations contradictoires
 * reviendrait à choisir le risque sans raison. Le coût du strict est un clic de
 * plus ; le coût du permissif est un CV faux envoyé à un client.
 *
 * `CV_CRITICAL_DETECTIONS` reste utilisé par l'écran, qui met ces champs en
 * avant : ils décident de ce qu'on propose à la personne.
 *
 * Un champ NON TROUVÉ (`value === null`) ne compte pas comme incertain : « ce
 * CV ne dit pas où la personne habite » est une lecture juste, pas un doute.
 */
export function canAutoAccept(fields: readonly ParsedField[]): boolean {
  const detected = fields.filter(field => field.value !== null)
  if (detected.length === 0) return false
  return detected.every(field => field.confidence >= CV_LOW_CONFIDENCE)
}

/**
 * Pourquoi une valeur lue dans le bloc `identity` n'a pas pu devenir un nom.
 *
 * Chaque motif est AFFICHABLE : « on n'a rien écrit » sans raison enverrait le
 * recruteur relancer la même lecture sur le même CV.
 */
export const IDENTITY_NAME_REFUSALS = [
  /** Le CV ne le dit pas — une lecture juste, pas un échec. */
  'absent',
  /** Une liste, ou un nombre : le bloc porte quatre items et ne les étiquette pas. */
  'not_text',
  /** Un e-mail ou un téléphone est DANS la valeur. */
  'carries_contact',
  /** Un séparateur joint plusieurs informations (`—`, `|`, `,`…). */
  'joins_several_items',
  /** `Nom : X` — l'étiquette du CV a été recopiée avec la valeur. */
  'is_a_labelled_field',
  /** Le nom du fichier déposé, qui n'a jamais été le nom de quelqu'un. */
  'looks_like_a_file',
  /** Au-delà de cent caractères, c'est un paragraphe. */
  'too_long',
] as const
export type IdentityNameRefusal = (typeof IDENTITY_NAME_REFUSALS)[number]

/** Un nom lu, ou l'absence de nom AVEC sa raison. Jamais une chaîne vide. */
export type IdentityNameReading = { name: string } | { name: null; refusal: IdentityNameRefusal }

/** Au-delà, ce n'est plus un nom (le plus long nom légal recensé tient large). */
const MAX_NAME_LENGTH = 100

/** Cinq chiffres : un numéro de téléphone en a dix, un nom de personne aucun. */
const CONTACT_DIGITS = 5

/**
 * Les séparateurs que le bloc `identity` et l'en-tête d'un CV utilisent pour
 * JOINDRE plusieurs informations.
 *
 * ⚠️ Le tiret d'union `-` (U+002D) n'en fait PAS partie et ne doit jamais en
 * faire partie : « Anne-Marie », « Le Guen-Kaczmarek ». Ce sont les tirets
 * TYPOGRAPHIQUES — cadratin `—` (U+2014), demi-cadratin `–` (U+2013) — qui
 * séparent, et les confondre refuserait un nom français sur deux.
 */
const ITEM_SEPARATORS = /[—–|•;/,\n\r\t]/

/**
 * Le bloc `identity` → le nom d'une PERSONNE, ou rien (D367).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET POURQUOI CETTE FONCTION EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le prompt de parsing demande, pour ce bloc : « nom complet, e-mail,
 * téléphone, ville — TELS QU'ÉCRITS ». QUATRE informations, UN seul `value`,
 * dont le type contractuel est `string | string[] | number | null`. Rien ne dit
 * laquelle des quatre occupe la valeur, ni dans quel ordre.
 *
 * Mesure du 30/08/2026, en exécutant le vrai validateur serveur
 * (`_validate_fields`, `apps/ia/app/routers/cv.py`) sur les 8 CV du dépôt : les
 * SIX formes que le prompt autorise sont acceptées 8 fois sur 8. Le validateur
 * ne regarde que la CITATION — une valeur totalement absente du CV passe, du
 * moment que `source_excerpt` en est extrait.
 *
 * Donc : la détection n'est pas du bruit — un nom est bien là — mais sa FORME
 * n'est pas contractée. Écrire `value` telle quelle dans `full_name`
 * remplacerait un remplissage (le nom du fichier) par un autre (un agrégat
 * « nom — e-mail — téléphone — ville »). C'est précisément le piège que ce lot
 * devait éviter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * On accepte ce qui est SANS AMBIGUÏTÉ un nom de personne. Tout le reste vaut
 * `null` et DIT pourquoi. Refuser coûte une correction à la main, avec sa
 * raison sous les yeux ; accepter écrit une adresse dans la colonne « nom »,
 * et cela ne se découvre que le jour où le dossier part chez un client.
 *
 * La règle s'applique à une valeur ACCEPTÉE comme à une valeur CORRIGÉE : ce
 * qu'elle garantit porte sur le SENS de la colonne — « ceci est le nom d'une
 * personne » — pas sur l'identité de qui a tapé. Un humain à qui elle dit non
 * garde le chemin d'édition de la fiche, qui est inconditionnel et de
 * provenance `human`.
 */
export function readPersonNameFromIdentity(value: ParsedField['value']): IdentityNameReading {
  if (value === null) return { name: null, refusal: 'absent' }
  if (Array.isArray(value)) return readNameFromPieces(value.filter(item => typeof item === 'string'))
  if (typeof value !== 'string') return { name: null, refusal: 'not_text' }

  const whole = readSingleName(value)
  if (whole.name !== null || whole.refusal === 'absent' || whole.refusal === 'looks_like_a_file') return whole
  // #3734 (06/10/2026) — RENVERSEMENT ASSUMÉ de D367 sur un point : un
  // AGRÉGAT n'est plus refusé en bloc. Mesuré en prod sur l'import ZIP : 464
  // fiches sur 484 sans nom après lecture, le nom étant la première ligne de
  // chaque CV. Le prompt demande nom + e-mail + téléphone + ville dans CE bloc :
  // l'agrégat est la forme normale. Le nom en tête est lu, sous une règle plus
  // STRICTE que pour une valeur seule (`isUnambiguousPersonName`) ; si aucun
  // morceau ne la passe, le refus d'origine reste, avec son motif.
  const fromPieces = readNameFromPieces(value.split(ITEM_SEPARATORS_ALL))
  return fromPieces.name !== null ? fromPieces : whole
}

/** Les mêmes séparateurs que `ITEM_SEPARATORS`, pour découper. */
const ITEM_SEPARATORS_ALL = new RegExp(ITEM_SEPARATORS.source, 'g')

/** Que des lettres (initiale pointée, trait d'union, apostrophe comprises),
 *  au moins DEUX mots : une ville seule, un intitulé chiffré, un libellé ne
 *  passent pas. */
const PERSON_NAME_SHAPE = /^\p{L}[\p{L}.'’-]*(?:\s+\p{L}[\p{L}.'’-]*){1,4}$/u

/** Les particules qu'un nom porte en minuscules — jamais en tête de nom. */
const NAME_PARTICLES = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'van',
  'von',
  'der',
  'den',
  'da',
  'di',
  'del',
  'dos',
  'el',
  'ben',
  'bin',
  "d'",
  'd’',
])

/** Un mot de MÉTIER fait d'un morceau un intitulé, jamais un nom — « Senior
 *  Business Unit Manager » a la casse d'un nom. */
const JOB_TITLE_WORDS =
  /\b(?:ing[ée]nieur(?:e)?|engineer|consultant(?:e)?|manager|management|chef|head|directeur|directrice|director|d[ée]veloppeu(?:r|se)|developer|responsable|senior|junior|lead|architecte?|architect|business|assistant(?:e)?|auditeur|auditrice|auditor|analyst(?:e)?|expert(?:e)?|technicien(?:ne)?|commercial(?:e)?|charg[ée]e?|officer|security|s[ée]curit[ée]|projet|project|product|data|devops|stagiaire|intern|freelance|cto|ceo|cfo|rssi|dsi|it)\b/iu

function hasPersonNameCase(piece: string): boolean {
  const words = piece.split(/\s+/)
  return words.every(
    (word, position) =>
      /^\p{Lu}/u.test(word) || (position > 0 && position < words.length - 1 && NAME_PARTICLES.has(word.toLowerCase())),
  )
}

function isUnambiguousPersonName(piece: string): boolean {
  return (
    PERSON_NAME_SHAPE.test(piece) &&
    hasPersonNameCase(piece) &&
    !JOB_TITLE_WORDS.test(piece) &&
    readSingleName(piece).name !== null
  )
}

/** Le premier morceau qui est SANS AMBIGUÏTÉ un nom de personne — le prompt
 *  place le nom en tête du bloc. */
function readNameFromPieces(pieces: readonly string[]): IdentityNameReading {
  const trimmed = pieces.map(piece => piece.trim()).filter(Boolean)
  if (trimmed.length === 0) return { name: null, refusal: 'absent' }
  const name = trimmed.find(isUnambiguousPersonName)
  if (name) return { name }
  return trimmed.some(piece => piece.includes('@') || (piece.match(/\d/g) ?? []).length >= CONTACT_DIGITS)
    ? { name: null, refusal: 'carries_contact' }
    : { name: null, refusal: 'joins_several_items' }
}

/** Une valeur SEULE → un nom, ou le motif du refus (la règle d'origine). */
function readSingleName(value: string): IdentityNameReading {
  const trimmed = value.trim()
  if (!trimmed) return { name: null, refusal: 'absent' }
  if (trimmed.length > MAX_NAME_LENGTH) return { name: null, refusal: 'too_long' }

  // Le nom de fichier D'ABORD : « CV_2024_v3 » porte aussi cinq chiffres, et le
  // dire « coordonnée » serait juste sur la forme et faux sur la cause.
  if (looksLikeAFileName(trimmed)) return { name: null, refusal: 'looks_like_a_file' }

  const digits = (trimmed.match(/\d/g) ?? []).length
  if (trimmed.includes('@') || digits >= CONTACT_DIGITS) return { name: null, refusal: 'carries_contact' }

  if (trimmed.includes(':')) return { name: null, refusal: 'is_a_labelled_field' }
  if (ITEM_SEPARATORS.test(trimmed)) return { name: null, refusal: 'joins_several_items' }

  return { name: trimmed }
}

/** Un texte cherchable depuis une valeur de champ — SANS en changer le sens :
 *  une liste reste la même matière, jointe pour qu'un regex la parcoure. Un
 *  nombre n'a jamais porté d'e-mail ni de téléphone. */
function asSearchableText(value: ParsedField['value']): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join(' ')
  return ''
}

/** Une adresse, reconnaissable sans ambiguïté par sa FORME. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/

/** Un numéro français : dix chiffres, `0` ou `+33` en tête, séparateurs libres
 *  (espace, point, tiret) ou aucun. */
const PHONE_PATTERN = /(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}/

/**
 * L'e-mail packé dans le bloc `identity`, ou `null` (D380, lot 19, #1789).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MOITIÉ QUI MANQUAIT À D367
 * ─────────────────────────────────────────────────────────────────────────────
 * `readPersonNameFromIdentity` sait extraire un NOM d'un agrégat, et sait
 * REFUSER quand elle ne peut pas — c'est tout ce qu'on lui a jamais demandé.
 * L'e-mail et le téléphone du même bloc n'avaient AUCUN extracteur : la valeur
 * composite était lue par le modèle, affichée telle quelle à l'écran de revue,
 * et jetée à l'écriture — les colonnes `consultants.email`/`consultants.phone`
 * existent, rien ne les a jamais alimentées depuis un CV.
 *
 * Contrairement au nom, une adresse a une FORME qui se reconnaît sans deviner
 * : l'extraire d'un « Nom — e-mail — téléphone — ville » est une CITATION du
 * texte lu, pas une interprétation. C'est pour ça que cette fonction n'a pas
 * de `refusal` comme `readPersonNameFromIdentity` : `null` ne veut jamais dire
 * « forme refusée », seulement « pas d'adresse dans ce texte » — un bloc
 * `identity` qui ne porte qu'un nom est un CV parfaitement normal, ça ne se
 * signale nulle part.
 */
export function readEmailFromIdentity(value: ParsedField['value']): string | null {
  const match = asSearchableText(value).match(EMAIL_PATTERN)
  return match ? match[0] : null
}

/** Même principe que {@link readEmailFromIdentity}, pour le téléphone. */
export function readPhoneFromIdentity(value: ParsedField['value']): string | null {
  const match = asSearchableText(value).match(PHONE_PATTERN)
  return match ? match[0].trim() : null
}

/**
 * Une ville française accolée à un CODE — département entre parenthèses
 * (« Paris (75) », le CV réel du 10/09) ou code postal en tête (« 75000
 * Paris ») — la seule FORME d'une ville qui se cite sans deviner (#2183.21).
 *
 * Une ville NUE (« Lyon ») n'a aucune forme qui la distingue d'un prénom ou
 * d'un mot quelconque du même agrégat — contrairement à l'e-mail (`@`) et au
 * téléphone (dix chiffres), rien ne permet de la CITER sans l'INTERPRÉTER.
 * C'est pour ça que cette fonction ne couvre que la forme codée : le reste
 * reste `null`, une lecture honnête plutôt qu'une ville inventée.
 */
const LOCATION_WITH_CODE_PATTERN =
  /[A-ZÀ-Ý][\wÀ-ÿ'.-]*(?:[ \t][\wÀ-ÿ'.-]+)*[ \t]*\((\d{2,3})\)|(?<!\d)\d{5}(?!\d)[ \t]+[A-ZÀ-Ý][\wÀ-ÿ'.-]*(?:[ \t][\wÀ-ÿ'.-]+)*/

/** Même principe que {@link readEmailFromIdentity}/{@link readPhoneFromIdentity}, pour la ville. */
export function readLocationFromIdentity(value: ParsedField['value']): string | null {
  const match = asSearchableText(value).match(LOCATION_WITH_CODE_PATTERN)
  return match ? match[0].trim() : null
}

/**
 * Une URL de profil professionnel (LinkedIn, Malt…), reconnaissable sans
 * ambiguïté par sa FORME — même famille que {@link readEmailFromIdentity} et
 * {@link readPhoneFromIdentity} (#3935.2, 08/10/2026).
 *
 * Mesuré sur le vivier de production (#3935) : l'information est souvent
 * écrite à côté du nom/e-mail/téléphone dans le même bloc de coordonnées, mais
 * le prompt ne la demandait jamais avant ce lot — `consultants.public_profile_url`
 * existe depuis `1789561203847-TalentEngagementAndRates` et n'avait jamais de
 * chemin d'écriture depuis un CV, seulement depuis la saisie manuelle et
 * l'enrichissement (`talent-enrichment.ts`).
 *
 * `null` ne veut jamais dire « refusé » : un CV sans URL de profil est un CV
 * normal, ça ne se signale nulle part — même garantie que l'e-mail/le
 * téléphone.
 */
const PROFILE_URL_PATTERN = /https?:\/\/\S+|(?:www\.)?(?:linkedin\.com|malt\.fr|malt\.com)\/\S+/i

export function readProfileUrlFromIdentity(value: ParsedField['value']): string | null {
  const match = asSearchableText(value).match(PROFILE_URL_PATTERN)
  if (!match) return null
  const url = match[0].replace(/[),.;|]+$/, '').trim()
  // Bug prod 31/10/2026 — sans protocole, l'adresse écrite en base faisait refuser toute la fiche à l'enregistrement.
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/** Les noms de langue — FR et EN, sans accent — reconnus sans deviner (#3935.2).
 *  Une langue dont le nom n'est pas dans cette liste reste NON lue : mieux
 *  vaut une langue manquante qu'un code inventé sur un nom mal reconnu. */
const CV_LANGUAGE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  francais: 'fr',
  french: 'fr',
  anglais: 'en',
  english: 'en',
  espagnol: 'es',
  spanish: 'es',
  castillan: 'es',
  allemand: 'de',
  german: 'de',
  deutsch: 'de',
  italien: 'it',
  italian: 'it',
  portugais: 'pt',
  portuguese: 'pt',
  neerlandais: 'nl',
  dutch: 'nl',
  chinois: 'zh',
  chinese: 'zh',
  mandarin: 'zh',
  japonais: 'ja',
  japanese: 'ja',
  arabe: 'ar',
  arabic: 'ar',
  russe: 'ru',
  russian: 'ru',
  coreen: 'ko',
  korean: 'ko',
  polonais: 'pl',
  polish: 'pl',
  turc: 'tr',
  turkish: 'tr',
  hindi: 'hi',
  vietnamien: 'vi',
  vietnamese: 'vi',
  roumain: 'ro',
  romanian: 'ro',
  grec: 'el',
  greek: 'el',
  suedois: 'sv',
  swedish: 'sv',
  norvegien: 'no',
  norwegian: 'no',
  danois: 'da',
  danish: 'da',
  finnois: 'fi',
  finnish: 'fi',
  tcheque: 'cs',
  czech: 'cs',
  hongrois: 'hu',
  hungarian: 'hu',
  ukrainien: 'uk',
  ukrainian: 'uk',
  hebreu: 'he',
  hebrew: 'he',
  thailandais: 'th',
  thai: 'th',
  indonesien: 'id',
  indonesian: 'id',
  catalan: 'ca',
}

/** Sans accent, en minuscules — pour reconnaître « Français »/« francais »/« FRANÇAIS »
 *  comme le même mot. */
function stripAccentsLower(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Le premier nom de langue reconnu dans un morceau de texte, ou `null`. */
function matchLanguageCode(chunk: string): string | null {
  const normalized = stripAccentsLower(chunk)
  for (const [name, code] of Object.entries(CV_LANGUAGE_NAME_TO_CODE)) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) return code
  }
  return null
}

/**
 * Un niveau CECRL (A1 à C2) ou « natif »/« langue maternelle », UNIQUEMENT
 * s'il est écrit explicitement sous cette forme — jamais un qualificatif flou
 * (« courant », « bon niveau ») rapproché du plus proche, ce serait une
 * évaluation que personne n'a faite (même garde que `parseSpokenLanguages`,
 * `language.ts`).
 */
function matchCefrLevel(chunk: string): LanguageLevel | null {
  const cefr = chunk.match(/\b([ABC][12])\b/i)
  if (cefr) {
    const level = cefr[1].toLowerCase()
    return (LANGUAGE_LEVELS as readonly string[]).includes(level) ? (level as LanguageLevel) : null
  }
  const normalized = stripAccentsLower(chunk)
  if (/\bnatif\b/.test(normalized) || /langue maternelle/.test(normalized) || /\bnative\b/.test(normalized)) {
    return 'natif'
  }
  return null
}

/**
 * Le bloc `languages` → `consultants.languages` (#3935.2, 08/10/2026).
 *
 * La colonne existe depuis l'origine (`{code, level}[]`, jsonb) mais n'avait
 * jamais de chemin d'écriture depuis un CV — signalé « chantier à part » au
 * lot 19 (#1789, `cv-parse.service.ts:636-641`) : le format `{code, level}`
 * demandait sa propre découpe, comme `identity`/`availability` ont eu la
 * leur. C'est cette découpe.
 *
 * Une langue dont le NOM n'est pas reconnu (liste fermée, {@link
 * CV_LANGUAGE_NAME_TO_CODE}) est ignorée plutôt que mal codée — absente est
 * plus honnête qu'un code faux. Un code déjà vu dans ce CV garde sa PREMIÈRE
 * occurrence, même règle que `parseSpokenLanguages`.
 */
export function readLanguagesFromDetection(
  value: ParsedField['value'],
): { code: string; level: LanguageLevel | null }[] | null {
  // Un élément de LISTE est découpé à part (jamais rejoint par un espace,
  // contrairement à `asSearchableText`) : deux langues dans deux éléments
  // distincts du bloc ne doivent pas fusionner en un seul morceau, où seule
  // la langue trouvée en PREMIER dans la carte serait retenue.
  const pieces = Array.isArray(value)
    ? value.flatMap(item => (typeof item === 'string' ? item.split(/[,;\n/•]+/) : []))
    : typeof value === 'string'
      ? value.split(/[,;\n/•]+/)
      : []

  const seen = new Set<string>()
  const result: { code: string; level: LanguageLevel | null }[] = []
  for (const chunk of pieces) {
    const trimmed = chunk.trim()
    if (!trimmed) continue
    const code = matchLanguageCode(trimmed)
    if (!code || seen.has(code)) continue
    seen.add(code)
    result.push({ code, level: matchCefrLevel(trimmed) })
  }
  return result.length > 0 ? result : null
}

/** Le vocabulaire accepté par `consultants.availability`
 *  (`1788013450112-Consultants`, CHECK SQL) — copié ici pour qu'aucune lecture
 *  ne puisse produire un mot hors contrainte. `inconnu` n'y figure pas : c'est
 *  le défaut de la colonne, jamais une valeur qu'une lecture ÉCRIT. */
export const AVAILABILITY_ENUM = ['immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible'] as const
export type AvailabilityEnumValue = (typeof AVAILABILITY_ENUM)[number]

/**
 * Le bloc `availability` → `consultants.availability`, ou `null` (D381, lot 19).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN MOT-CLÉ RECONNU, JAMAIS UNE DATE RECALCULÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le prompt demande une « date ou mention de disponibilité », TELLE QU'ÉCRITE.
 * La colonne, elle, est un vocabulaire FERMÉ. Faire le pont en calculant un
 * délai depuis une date lue (« aujourd'hui + X jours tombe dans quel seau ? »)
 * inventerait une opinion qu'aucune source n'a écrite — « aujourd'hui » n'est
 * dans aucun CV. Cette fonction se limite donc à RECONNAÎTRE, dans le texte lu,
 * un des quatre mots que le produit utilise déjà pour ce vocabulaire (les
 * libellés de `consultants.json` : « Disponible » pour immédiate, « Sous 1
 * mois », « Sous 3 mois », « En mission » pour indisponible) — jamais à en
 * déduire un depuis un délai approximatif. Un texte qui ne cite explicitement
 * AUCUN de ces mots rend `null` : le CV a été lu, la colonne reste `inconnu`,
 * et personne n'a inventé de catégorie à sa place.
 *
 * Une mention bare « Disponible », sans qualificatif de délai NI le mot
 * « immédiat », n'est PAS mappée à `immediate` : ce serait interpréter un mot
 * ambigu plutôt que le citer. Le coût est nommé — cette phrase-là reste
 * `inconnu` — et il est plus petit que celui d'une catégorie devinée.
 */
export function readAvailabilityFromDetection(value: ParsedField['value']): AvailabilityEnumValue | null {
  const text = asSearchableText(value).toLowerCase()
  if (!text.trim()) return null
  if (/indisponible/.test(text)) return 'indisponible'
  if (/imm[ée]diat/.test(text)) return 'immediate'
  if (/\b(?:1|un)\s*mois\b/.test(text)) return 'sous_1_mois'
  if (/\b(?:3|trois)\s*mois\b/.test(text)) return 'sous_3_mois'
  return null
}

/** Ce que l'utilisateur a fait de chaque champ, à la validation. */
export const CV_FIELD_DECISIONS = ['accept', 'correct', 'reject'] as const
export const cvFieldDecisionSchema = z.enum(CV_FIELD_DECISIONS)
export type CvFieldDecision = (typeof CV_FIELD_DECISIONS)[number]

export const cvCommitFieldSchema = z
  .object({
    detection: cvDetectionSchema,
    decision: cvFieldDecisionSchema,
    /** La valeur retenue. Requise sur `correct`, ignorée sur `reject`. */
    value: z.union([z.string(), z.array(z.string()), z.number(), z.null()]).optional(),
  })
  .strict()
export type CvCommitField = z.infer<typeof cvCommitFieldSchema>

export const cvCommitSchema = z
  .object({
    fields: z.array(cvCommitFieldSchema).max(CV_DETECTIONS.length),
  })
  .strict()
export type CvCommitInput = z.infer<typeof cvCommitSchema>

/**
 * La provenance à écrire pour un champ, selon ce que l'utilisateur en a fait.
 *
 * Un champ CORRIGÉ à la main devient `human` et l'emporte sur toute réécriture
 * ultérieure — c'est la règle de provenance du dépôt, appliquée ici. Un champ
 * accepté tel quel reste `model` : l'accepter ne veut pas dire l'avoir écrit.
 * Les confondre ferait croire, six mois plus tard, que quelqu'un a saisi une
 * valeur que personne n'a jamais tapée.
 */
export function provenanceForDecision(decision: CvFieldDecision): 'human' | 'model' | null {
  if (decision === 'correct') return 'human'
  if (decision === 'accept') return 'model'
  return null
}

/**
 * #2184.37 / #2184.38 — le préfixe posé par `consultants.controller.ts` sur la
 * ligne de journal qui trace une DÉCISION DE REVUE (accepter/corriger un bloc),
 * par opposition aux lignes qui tracent la colonne réellement écrite
 * (`full_name`, `title`…). `cv_parse.identity` dit « quelqu'un a revu ce bloc,
 * voici qui et quand » — indépendamment de ce que la revue a fini par écrire.
 */
export const CV_PARSE_HISTORY_FIELD_PREFIX = 'cv_parse.'

/**
 * Pour chaque détection, la DERNIÈRE fois qu'un humain l'a revue — qui et
 * quand (#2184.37 « traçabilité : auteur », #2184.38 « traçabilité : date »).
 *
 * Le journal (`ProvenanceService.history`) est trié du plus récent au plus
 * ancien : la première ligne rencontrée pour une détection est donc la plus
 * récente, et les suivantes pour la même détection sont ignorées.
 *
 * Une détection jamais revue n'a AUCUNE ligne — elle n'apparaît pas ici avec
 * une valeur devinée : « non mesuré n'est jamais 0 » (GA-18/GA-19). L'écran
 * (`CvReviewPanel`) doit donc traiter une détection absente de ce résultat
 * comme « jamais revue », jamais comme une revue par personne inconnue.
 */
export function latestCvParseDecisions(
  entries: readonly RecordFieldAudit[],
): Partial<Record<CvDetection, RecordFieldAudit>> {
  const result: Partial<Record<CvDetection, RecordFieldAudit>> = {}
  for (const entry of entries) {
    if (!entry.field.startsWith(CV_PARSE_HISTORY_FIELD_PREFIX)) continue
    const candidate = entry.field.slice(CV_PARSE_HISTORY_FIELD_PREFIX.length)
    const parsed = cvDetectionSchema.safeParse(candidate)
    if (!parsed.success) continue
    const detection = parsed.data
    if (result[detection]) continue // déjà la plus récente : le journal est trié DESC
    result[detection] = entry
  }
  return result
}
