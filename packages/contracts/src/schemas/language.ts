import { z } from 'zod'

/**
 * Les langues parlées et les habilitations (PDF 4, axes 6 et 12).
 *
 * Ni l'une ni l'autre n'existait en base. Deux des douze axes et deux des onze
 * motifs d'exclusion en dépendaient : les laisser vides aurait donné un moteur
 * qui déclare douze axes et n'en calcule que dix, et deux codes de motif qui ne
 * peuvent jamais se produire. Une case à cocher qui ne fait rien est pire qu'une
 * case absente, parce qu'on croit l'avoir cochée.
 *
 * L'échelle est celle du Cadre européen, plus « natif ». Elle est ORDONNÉE, et
 * c'est tout ce qu'on lui demande : comparer un niveau tenu à un niveau exigé.
 * On ne devine jamais un niveau depuis un CV — « anglais » écrit sans niveau
 * reste une langue déclarée dont le niveau est une QUESTION à poser.
 */
export const LANGUAGE_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'natif'] as const
export const languageLevelSchema = z.enum(LANGUAGE_LEVELS)
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]

export const spokenLanguageSchema = z.object({
  /** Code court (« fr », « en », « de »). Libre : les besoins réels sortent vite d'une liste fermée. */
  code: z.string().trim().min(2).max(8),
  /** `null` = la langue est déclarée, son niveau ne l'est pas. Jamais « a1 » par défaut. */
  level: languageLevelSchema.nullable(),
})
export type SpokenLanguage = z.infer<typeof spokenLanguageSchema>

/**
 * Une habilitation — « Secret Défense », « Confidentiel Défense », une
 * certification client, un agrément.
 *
 * Texte libre et non enum : chaque donneur d'ordre a les siennes, et une liste
 * fermée obligerait à refuser la seule qui compte pour un client donné.
 */
export const clearanceSchema = z.string().trim().min(1).max(120)

/** L'ordre d'un niveau, ou `null` s'il n'est pas comparable. */
export function languageLevelRank(level: string | null | undefined): number | null {
  if (!level) return null
  const index = (LANGUAGE_LEVELS as readonly string[]).indexOf(level.trim().toLowerCase())
  return index === -1 ? null : index
}

/* ------------------------------------------------------------------ */
/* La convention de SAISIE — écrite une fois, lue par les deux écrans  */
/* ------------------------------------------------------------------ */

/**
 * « fr:natif, en:b2, de » → la liste structurée.
 *
 * ⚠️ Cette convention vit ICI, à côté de l'échelle, et non dans l'écran qui
 * l'emploie : la fiche d'un CONSULTANT et la fiche d'un BESOIN la saisissent
 * toutes les deux, et deux analyseurs recopiés divergeraient sans bruit — un
 * recruteur taperait la même chose sur les deux écrans et obtiendrait deux
 * résultats. C'est la loi « un réglage vit à un seul endroit » appliquée à une
 * grammaire de saisie.
 *
 * Un niveau NON RECONNU est ignoré plutôt que rapproché du plus proche : écrire
 * « en:courant » ne doit pas devenir « en:c1 », qui serait une évaluation que
 * personne n'a faite. La langue reste déclarée, son niveau reste `null`, et le
 * rapprochement en fait une QUESTION au lieu d'une note.
 *
 * Un code en double garde sa PREMIÈRE occurrence : « fr:natif, fr:b1 » est une
 * faute de frappe, et prendre la dernière ferait silencieusement redescendre un
 * niveau que quelqu'un venait d'écrire.
 */
export function parseSpokenLanguages(raw: string): SpokenLanguage[] {
  const seen = new Set<string>()
  const result: SpokenLanguage[] = []
  for (const chunk of raw.split(',')) {
    const [rawCode, rawLevel] = chunk.split(':')
    const code = (rawCode ?? '').trim().toLowerCase()
    if (code.length < 2 || code.length > 8 || seen.has(code)) continue
    seen.add(code)
    const level = (rawLevel ?? '').trim().toLowerCase()
    result.push({
      code,
      level: (LANGUAGE_LEVELS as readonly string[]).includes(level) ? (level as LanguageLevel) : null,
    })
  }
  return result
}

/**
 * Ce qui SORT d'une colonne `jsonb` → des langues sûres.
 *
 * ⚠️ La base ne contraint rien : `project_needs.languages` et
 * `consultants.languages` sont du `jsonb`, et une ligne écrite avant l'échelle
 * — ou par un import — peut porter « en:courant » ou n'importe quoi d'autre. La
 * règle appliquée est la MÊME qu'à la saisie, et c'est tout l'intérêt de la
 * poser une seule fois : un niveau hors échelle devient `null`, jamais le
 * niveau le plus proche. Rapprocher « courant » de « c1 » écrirait une
 * évaluation que personne n'a faite, et le rapprochement la prendrait pour une
 * mesure.
 *
 * Une entrée sans code lisible est SAUTÉE plutôt que rendue vide : une langue
 * sans nom exigée par un besoin bloquerait sans qu'on puisse dire laquelle.
 */
export function normaliseSpokenLanguages(raw: unknown): SpokenLanguage[] {
  if (!Array.isArray(raw)) return []
  const result: SpokenLanguage[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const code = (item as { code?: unknown }).code
    if (typeof code !== 'string' || code.trim().length < 2) continue
    const level = (item as { level?: unknown }).level
    const parsed = typeof level === 'string' ? languageLevelSchema.safeParse(level.trim().toLowerCase()) : null
    result.push({ code: code.trim(), level: parsed?.success === true ? parsed.data : null })
  }
  return result
}

/** Le chemin inverse — ce que le champ de saisie montre à l'ouverture. */
export function formatSpokenLanguages(languages: readonly SpokenLanguage[]): string {
  return languages.map(item => (item.level ? `${item.code}:${item.level}` : item.code)).join(', ')
}

/**
 * « Secret Défense, agrément SNCF » → la liste.
 *
 * Les blancs sont retirés et les vides sautés : une virgule en trop ne crée pas
 * une habilitation sans nom, qui bloquerait TOUT le vivier sans qu'on puisse
 * dire pourquoi.
 */
export function parseClearanceList(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const chunk of raw.split(',')) {
    const value = chunk.trim()
    if (value.length === 0 || value.length > 120) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}
