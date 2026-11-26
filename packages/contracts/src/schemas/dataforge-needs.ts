import { z } from 'zod'

/**
 * #4281.1 / #4282.5 — les BESOINS HISTORIQUES du référentiel DataForge
 * (pack ORION V12, `2_RELATIONNEL/24_MISSIONS_BESOINS.csv` — 1 336 lignes —
 * et `25_PIPELINE_CRM_*.csv`), structurés à l'ingestion (décision Louis 19/10
 * n°17 : « toutes les données ont de la valeur »).
 *
 * Avant ce lot, statut / date / prescripteur d'un besoin n'existaient que dans
 * le TEXTE des extraits RAG ; `dataforge_account_domains` ne porte qu'un TJM
 * médian par compte × domaine. Un besoin daté ne peut pas se lire dans un
 * extrait sans risque de fait inventé (question 2 du découpage, option a).
 *
 * Défini ICI pour la garde GA-12 (`check-constraints-cover-enums.spec.ts`) :
 * la contrainte `dataforge_needs_status_check` couvre cette liste.
 */

/**
 * Le statut NORMALISÉ d'un besoin. Le libellé brut du pack reste dans
 * `status_raw` — on normalise, on ne réécrit pas. GA-08 : n'en retire jamais
 * une, n'en insère jamais une au milieu ; ajouter seulement à la fin.
 */
export const DATAFORGE_NEED_STATUSES = ['GAGNE', 'PERDU', 'ABANDONNE', 'TERMINE', 'EN_COURS', 'INCONNU'] as const
export const dataforgeNeedStatusSchema = z.enum(DATAFORGE_NEED_STATUSES)
export type DataforgeNeedStatus = z.infer<typeof dataforgeNeedStatusSchema>

/** Le fichier du pack dont vient la ligne — un besoin garde sa provenance (jamais montrée à l'écran). */
export const DATAFORGE_NEED_SOURCE_FILES = ['24_MISSIONS_BESOINS', '25_PIPELINE_CRM'] as const
export type DataforgeNeedSourceFile = (typeof DATAFORGE_NEED_SOURCE_FILES)[number]

/** L'ordre compte : « clos gagné » est gagné, « closed lost » est perdu, avant « clos » = terminé. */
const STATUS_PATTERNS: readonly (readonly [DataforgeNeedStatus, RegExp])[] = [
  ['GAGNE', /\b(gagne|won|win|signe|remporte)/],
  ['PERDU', /\b(perdu|lost|refuse|echec)/],
  ['ABANDONNE', /\b(abandon|annul|cancel|sans suite)/],
  ['TERMINE', /\b(termine|achev|fini|clos|closed|complete|done)/],
  ['EN_COURS', /\b(en cours|ouvert|open|actif|active|in progress|a pourvoir)/],
]

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Le libellé brut → la liste fermée. Un libellé qu'aucun motif ne reconnaît,
 * vide ou marque-place (`[à compléter]`) donne `INCONNU` — jamais un statut
 * deviné.
 */
export function normalizeDataforgeNeedStatus(raw: string | null | undefined): DataforgeNeedStatus {
  const folded = fold(raw ?? '')
  if (folded.length === 0 || /^\[.*\]$/.test(folded)) return 'INCONNU'
  for (const [status, pattern] of STATUS_PATTERNS) {
    if (pattern.test(folded)) return status
  }
  return 'INCONNU'
}

/**
 * #4282.6 / #4281.3 — un prescripteur vu il y a plus d'un an se REVALIDE
 * avant d'être cité comme relais : les postes changent (#4272). Même seuil
 * côté IA (`apps/ia/app/services/dataforge_needs.py`, fixture partagée).
 */
export const PRESCRIBER_REVALIDATE_AFTER_DAYS = 365

export type PrescriberFreshness = { kind: 'dated'; date: string } | { kind: 'to_revalidate'; date: string | null }

export function prescriberFreshness(lastSeen: string | null | undefined, today: Date): PrescriberFreshness {
  const date = (lastSeen ?? '').trim().slice(0, 10)
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN
  if (Number.isNaN(parsed)) return { kind: 'to_revalidate', date: null }
  const ageDays = (today.getTime() - parsed) / 86_400_000
  return ageDays > PRESCRIBER_REVALIDATE_AFTER_DAYS ? { kind: 'to_revalidate', date } : { kind: 'dated', date }
}
