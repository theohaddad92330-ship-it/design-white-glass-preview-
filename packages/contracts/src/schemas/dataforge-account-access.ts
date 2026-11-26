import { z } from 'zod'

/**
 * Lot 776 — « Accès au compte · Base commune » : comment ENTRER chez un compte, tel que la base commune le dit.
 *
 * Décisions Louis 02/11/2026 : « on utilise tout » et « tout ce qui rend identifiable on le montre pas ». Ce bloc ne porte donc
 * que des ÉNUMÉRATIONS métier — jamais le code brut du fichier, jamais un score nu, jamais une probabilité, jamais un nom,
 * un e-mail, un téléphone ou un lien de personne. Une valeur inconnue reste `null` (l'écran n'en fait pas de ligne).
 */
export const DATAFORGE_ACCESSIBILITY_LEVELS = ['high', 'medium', 'low'] as const
export const DATAFORGE_ACCESS_BARRIERS = ['platform', 'public_procurement', 'referencing'] as const
export const DATAFORGE_ACCESS_ROUTES = ['platform', 'tender', 'referencing', 'supplier_portal'] as const
export const DATAFORGE_ACCESS_PRIORITIES = ['high', 'medium', 'low'] as const

export const dataforgeAccountAccessSchema = z.object({
  accessibility: z.enum(DATAFORGE_ACCESSIBILITY_LEVELS).nullable(),
  barriers: z.array(z.enum(DATAFORGE_ACCESS_BARRIERS)),
  route: z.enum(DATAFORGE_ACCESS_ROUTES).nullable(),
  priority: z.enum(DATAFORGE_ACCESS_PRIORITIES).nullable(),
  /** La date de la fiche qui porte ces statuts (ISO), pour dater le bloc. */
  observedAt: z.string().nullable(),
})
export type DataforgeAccountAccess = z.infer<typeof dataforgeAccountAccessSchema>

/** Les champs bruts d'une fiche de statut dont ce bloc se nourrit — et rien d'autre. */
export type DataforgeAccessSource = {
  salesAccessibilityLevel: string | null
  barrierePlateforme: boolean
  barrierePublique: boolean
  referencingProcessFound: string | null
  supplierPortal: string | null
  priorityLevel: string | null
  observedAt: string | null
}

const fold = (value: string | null): string => (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()

const HIGH = new Set(['HAUTE', 'HAUT', 'ELEVE', 'ELEVEE', 'HIGH', 'A', 'P1', '1'])
const MEDIUM = new Set(['MOYENNE', 'MOYEN', 'MEDIUM', 'B', 'P2', '2'])
const LOW = new Set(['FAIBLE', 'BAS', 'BASSE', 'LOW', 'C', 'D', 'P3', 'P4', '3', '4'])

function level(value: string | null): 'high' | 'medium' | 'low' | null {
  const key = fold(value)
  if (HIGH.has(key)) return 'high'
  if (MEDIUM.has(key)) return 'medium'
  if (LOW.has(key)) return 'low'
  return null
}

const AFFIRMATIVE = new Set(['OUI', 'YES', 'TRUE', 'VRAI', '1', 'OUI_CONFIRME', 'CONFIRME'])
const filled = (value: string | null): boolean =>
  fold(value) !== '' && !['NON', 'NO', 'FALSE', 'FAUX', '0'].includes(fold(value))

/**
 * La vue métier d'une fiche de statut. `null` quand aucun des quatre axes n'est établi : pas de bloc, jamais « 0 ».
 * La route d'achat est DÉRIVÉE des barrières posées (plateforme > appel d'offres > référencement > portail fournisseur).
 */
export function dataforgeAccountAccessView(source: DataforgeAccessSource): DataforgeAccountAccess | null {
  const referencing = AFFIRMATIVE.has(fold(source.referencingProcessFound))
  const barriers: DataforgeAccountAccess['barriers'] = [
    ...(source.barrierePlateforme ? (['platform'] as const) : []),
    ...(source.barrierePublique ? (['public_procurement'] as const) : []),
    ...(referencing ? (['referencing'] as const) : []),
  ]
  const route: DataforgeAccountAccess['route'] = source.barrierePlateforme
    ? 'platform'
    : source.barrierePublique
      ? 'tender'
      : referencing
        ? 'referencing'
        : filled(source.supplierPortal)
          ? 'supplier_portal'
          : null
  const view: DataforgeAccountAccess = {
    accessibility: level(source.salesAccessibilityLevel),
    barriers,
    route,
    priority: level(source.priorityLevel),
    observedAt: source.observedAt,
  }
  const established = view.accessibility !== null || barriers.length > 0 || route !== null || view.priority !== null
  return established ? view : null
}
