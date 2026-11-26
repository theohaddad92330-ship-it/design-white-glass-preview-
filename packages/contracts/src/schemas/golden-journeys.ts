/**
 * LE REGISTRE DES GOLDEN JOURNEYS de #2208 (« GOLDEN JOURNEYS » 1 à 40) —
 * #2958.32-.71.
 *
 * Un parcours est « couvert » quand un fichier de test nommé l'exerce de bout
 * en bout ; `golden-journeys.test.ts` relit chaque fichier (il existe, il porte
 * le numéro du parcours dans son en-tête) — jamais une case cochée à la main.
 * `route-migration-2208-conditions.ts` lit CE registre pour décider quelles
 * conditions NO-GO sont devenues ÉVALUABLES, et pour compter le GO « tests E2E ».
 *
 * ⚠️ Ce que « couvert » veut dire, et ne veut pas dire : une spec Playwright de
 * `e2e/tests/web/` simule l'API (aucune donnée réelle) et prouve le CLIENT —
 * l'écran, le geste, ce qui part vers le serveur. Elle ne prouve pas le contrat
 * serveur, ni la recette sur données réelles (qui reste humaine). Un parcours
 * qui échoue en CI est un parcours rouge : ce registre dit qu'il EXISTE.
 *
 * Numérotation : le numéro est celui de la liste de #2208 ; `issue` est le
 * point `#2958.<k>` qui le porte (`k = numéro + 31`, convention des bilans).
 */

// 40 numéros dans la liste de #2208, moins les parcours 25 et 26 retirés (#3656 : écran supprimé, numéros non réattribués).
export const GOLDEN_JOURNEYS_TOTAL = 38

type GoldenJourneyKind = 'playwright' | 'vitest'

type GoldenJourney = {
  number: number
  title: string
  /** Le point `#2958.<k>` qui porte ce parcours. */
  issue: string
  /** Chemin depuis la racine du dépôt. */
  file: string
  kind: GoldenJourneyKind
}

const E2E = 'e2e/tests/web'

function journey(number: number, title: string, file: string, kind: GoldenJourneyKind = 'playwright'): GoldenJourney {
  return { number, title, issue: `#2958.${number + 31}`, file: kind === 'playwright' ? `${E2E}/${file}` : file, kind }
}

export const GOLDEN_JOURNEYS: readonly GoldenJourney[] = [
  journey(1, 'Importer 800 CV', 'golden-journey-import-800-cv.spec.ts'),
  journey(2, 'Créer les fiches automatiquement', 'golden-journey-cv-auto-profiles.spec.ts'),
  journey(3, 'Traiter uniquement les exceptions', 'golden-journey-cv-exceptions-only.spec.ts'),
  journey(4, 'Importer 1 000 contacts et 7 besoins', 'golden-journey-import-contacts-and-needs.spec.ts'),
  journey(5, 'Ouvrir le Vivier', 'golden-journey-open-vivier.spec.ts'),
  journey(6, 'Consulter un consultant', 'golden-journey-consult-talent.spec.ts'),
  journey(7, 'Valider sa disponibilité', 'golden-journey-consult-talent.spec.ts'),
  journey(8, 'Trouver les comptes compatibles', 'golden-journey-find-compatible-accounts.spec.ts'),
  journey(9, 'Créer une cible', 'golden-journey-create-target.spec.ts'),
  journey(10, 'Créer une opportunité', 'golden-journey-create-opportunity.spec.ts'),
  journey(11, 'Créer un besoin sans analyse préalable', 'golden-journey-create-need-without-analysis.spec.ts'),
  journey(12, 'Lancer le matching', 'golden-journey-launch-matching.spec.ts'),
  journey(13, 'Comparer les profils', 'golden-journey-compare-profiles.spec.ts'),
  journey(14, 'Préparer un CV ciblé', 'golden-journey-prepare-targeted-cv.spec.ts'),
  journey(15, 'Créer une shortlist', 'golden-journey-create-shortlist.spec.ts'),
  journey(16, 'Présenter un consultant', 'golden-journey-present-consultant.spec.ts'),
  journey(17, 'Suivre le feedback', 'golden-journey-follow-feedback.spec.ts'),
  journey(18, 'Passer en entretien', 'golden-journey-start-interview.spec.ts'),
  journey(19, 'Sécuriser client et consultant', 'golden-journey-secure-both-agreements.spec.ts'),
  journey(20, 'Créer la mission', 'golden-journey-create-mission.spec.ts'),
  journey(33, 'Lire le Pilotage manager', 'golden-journey-pilotage-manager.spec.ts'),
  journey(37, 'Utiliser le mode démo', 'golden-journey-demo-mode.spec.ts'),
  journey(38, 'Tester les permissions', 'golden-journey-consult-talent.spec.ts'),
  journey(39, 'Reprendre un job interrompu', 'golden-journey-resume-interrupted-import.spec.ts'),
  journey(40, 'Ouvrir chaque ancienne URL', 'apps/web/src/lib/legacy-addresses.test.ts', 'vitest'),
]

/** Les numéros couverts, sans doublon, dans l'ordre de la liste de #2208. */
export function coveredGoldenJourneyNumbers(): number[] {
  return [...new Set(GOLDEN_JOURNEYS.map(entry => entry.number))].sort((a, b) => a - b)
}

/** Vrai seulement si CHAQUE parcours demandé a son fichier — un parcours inconnu du registre n'est pas couvert. */
export function goldenJourneysCovered(numbers: readonly number[]): boolean {
  const covered = new Set(coveredGoldenJourneyNumbers())
  return numbers.length > 0 && numbers.every(number => covered.has(number))
}
