import { z } from 'zod'

/**
 * Théo A comptes-fiche-reference.N4 — le DOSSIER DE RÉFÉRENCE : une archive
 * figée, lue en lecture seule, jamais réécrite.
 *
 * Aucune colonne, aucune migration : la portée vit dans `raw_analysis`, sous
 * une clé que seul l'import d'une archive pose. Un compte sans cette clé est
 * un dossier ordinaire (le défaut). Une portée mal formée n'est PAS devinée —
 * elle se lit comme « pas une archive », jamais comme une archive à moitié.
 *
 * Décision Louis 22/10 (A2) : l'archive est figée ; pour travailler le compte
 * aujourd'hui on crée une COPIE DE TRAVAIL à côté, qui hérite des notes et
 * garde l'archive intacte (`working_copy_of` nomme l'archive d'origine).
 */
export const REFERENCE_ARCHIVE_KEY = 'reference_archive'
export const WORKING_COPY_OF_KEY = 'working_copy_of'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const referenceArchiveSchema = z.object({
  /** « Archive du dépôt fourni » — la nature de la source, jamais un outil. */
  label: z.string().min(1),
  period_from: isoDate,
  period_to: isoDate,
  /** « périmètre France » — ce que l'archive couvre, dit une fois par dossier. */
  scope_note: z.string().min(1),
  /** `false` : aucun recoupement en ligne n'a eu lieu ; l'écran le dit. */
  verified_online: z.boolean(),
})

export type ReferenceArchive = z.infer<typeof referenceArchiveSchema>

export function readReferenceArchive(raw: Record<string, unknown> | null | undefined): ReferenceArchive | null {
  const parsed = referenceArchiveSchema.safeParse(raw?.[REFERENCE_ARCHIVE_KEY])
  return parsed.success ? parsed.data : null
}

/** L'identifiant de l'archive dont ce compte est la copie de travail, sinon `null`. */
export function readWorkingCopyOf(raw: Record<string, unknown> | null | undefined): string | null {
  const value = raw?.[WORKING_COPY_OF_KEY]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Théo A comptes-fiche-reference.N5 / R2 — « À revalider » : un contact repris d'une archive dont le
 * poste n'a pas été revérifié. Une ÉTIQUETTE (`contacts.tags`), pas un état du cycle de vie : aucune
 * contrainte SQL à élargir, et la règle « un fait périmé redevient inconnu » reste celle du cycle de vie.
 */
export const TO_REVALIDATE_TAG = 'À revalider'

export function isToRevalidate(tags: readonly string[] | null | undefined): boolean {
  return Array.isArray(tags) && tags.includes(TO_REVALIDATE_TAG)
}
