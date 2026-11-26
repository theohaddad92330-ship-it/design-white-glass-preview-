/**
 * #1678.2 — LA logique de la visite guidée : la séquence d'étapes, et le
 * bornage de l'index courant. Ce fichier ne touche AUCUN DOM — la mesure des
 * positions (`getBoundingClientRect`) vit dans `guided-tour.tsx`, qui utilise
 * `targetSelector` pour retrouver l'élément du rail à entourer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA VISITE RESTE SUR LA PAGE COURANTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rail (`side-rail.tsx`) est monté dans le layout RACINE — il existe sur
 * TOUTE page — mais ses liens sont des `<a href>` (navigation complète, pas
 * `next/link`) : suivre un lien pendant la visite perdrait l'état de la visite
 * elle-même. La visite reste donc une visite DU RAIL (elle entoure chaque
 * section à l'écran, sans y naviguer), pas une visite DES ÉCRANS.
 */

/** Un sous-ensemble volontairement ÉTROIT des clés de `lib/i18n.ts` — celles
 *  que cette visite peut afficher. Une clé hors de cette liste ne compile pas. */
export type TourTextKey =
  | 'gtWelcomeTitle'
  | 'gtWelcomeBody'
  | 'gtCockpitTitle'
  | 'gtCockpitBody'
  | 'gtSectionRevenusTitle'
  | 'gtSectionRevenusBody'
  | 'gtSectionProduitTitle'
  | 'gtSectionProduitBody'
  | 'gtSectionTechniqueTitle'
  | 'gtSectionTechniqueBody'
  | 'gtSectionAdministrationTitle'
  | 'gtSectionAdministrationBody'
  | 'gtSectionConfigurationTitle'
  | 'gtSectionConfigurationBody'
  | 'gtClosingTitle'
  | 'gtClosingBody'

type TourStep = {
  id: string
  titleKey: TourTextKey
  bodyKey: TourTextKey
  /** Sélecteur CSS de l'élément du rail que cette étape entoure. `null` pour
   *  une étape sans ancre (bienvenue, clôture). */
  targetSelector: string | null
}

export type TourSectionLike = { id: string; label: string }

/** Une entrée par `id` de `NAV_SECTIONS` (#1644). Une section future dont
 *  l'`id` n'a pas encore de clés se voit ignorée par `buildTourSteps` — jamais
 *  une étape au titre vide. */
const SECTION_KEYS: Record<string, { titleKey: TourTextKey; bodyKey: TourTextKey }> = {
  revenus: { titleKey: 'gtSectionRevenusTitle', bodyKey: 'gtSectionRevenusBody' },
  produit: { titleKey: 'gtSectionProduitTitle', bodyKey: 'gtSectionProduitBody' },
  technique: { titleKey: 'gtSectionTechniqueTitle', bodyKey: 'gtSectionTechniqueBody' },
  administration: { titleKey: 'gtSectionAdministrationTitle', bodyKey: 'gtSectionAdministrationBody' },
  configuration: { titleKey: 'gtSectionConfigurationTitle', bodyKey: 'gtSectionConfigurationBody' },
}

/** Bienvenue → Cockpit → une étape par section du rail (dans l'ordre du
 *  rail) → clôture. */
export function buildTourSteps(sections: TourSectionLike[]): TourStep[] {
  const steps: TourStep[] = [
    { id: 'welcome', titleKey: 'gtWelcomeTitle', bodyKey: 'gtWelcomeBody', targetSelector: null },
    { id: 'cockpit', titleKey: 'gtCockpitTitle', bodyKey: 'gtCockpitBody', targetSelector: '[data-tour="cockpit"]' },
  ]
  for (const section of sections) {
    const known = SECTION_KEYS[section.id]
    if (!known) continue
    steps.push({
      id: `section-${section.id}`,
      titleKey: known.titleKey,
      bodyKey: known.bodyKey,
      targetSelector: `[data-tour="section-${section.id}"]`,
    })
  }
  steps.push({ id: 'closing', titleKey: 'gtClosingTitle', bodyKey: 'gtClosingBody', targetSelector: null })
  return steps
}

/** Jamais avant la première étape, jamais après la dernière — et zéro étape
 *  rend toujours 0, pas un index négatif. */
export function clampStepIndex(index: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.max(index, 0), total - 1)
}
