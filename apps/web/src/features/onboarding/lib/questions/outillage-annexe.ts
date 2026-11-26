import { TOOLING_PRESENCE_SCALE } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'
import { resolveToolingChoices } from './tooling-resolve-choices'

/**
 * Sous-étape `outillage-annexe` du stage `company_info` — #2054.7 à #2054.11.
 *
 * La deuxième moitié de la chaîne : ce qui n'est pas un système central mais où
 * l'information commerciale finit quand même par vivre. Séparée d'`outillage`
 * parce que onze questions sur un écran ne se répondent pas — même échelle,
 * même contrat, un autre écran.
 *
 * ⚠️ `tooling_enrichment` (#2054.8) est le point le plus exposé du lot : nos
 * propres fournisseurs d'enrichissement ne se nomment JAMAIS, nulle part. La
 * question nomme la CAPACITÉ — « un outil pour retrouver des coordonnées ».
 */
const presence = choice(...TOOLING_PRESENCE_SCALE)

export const outillageAnnexeStep: SubStep = {
  slug: 'outillage-annexe',
  questions: [
    // #2054.7 — les tableurs.
    {
      key: 'tooling_spreadsheet',
      kind: 'single',
      label: 'questions.toolingSpreadsheet.label',
      subtitle: 'questions.toolingSpreadsheet.subtitle',
      choices: presence,
    },
    // #2054.8 — la CAPACITÉ de retrouver des coordonnées, jamais un éditeur.
    {
      key: 'tooling_enrichment',
      kind: 'single',
      label: 'questions.toolingEnrichment.label',
      subtitle: 'questions.toolingEnrichment.subtitle',
      choices: presence,
    },
    // #2054.9 — les plateformes où l'ESN reçoit ou publie des besoins.
    // #2054.19 : une connexion `jobs` du registre retire « pas cet outil ».
    {
      key: 'tooling_sourcing_platform',
      kind: 'single',
      label: 'questions.toolingSourcingPlatform.label',
      subtitle: 'questions.toolingSourcingPlatform.subtitle',
      choices: presence,
      resolveChoices: resolveToolingChoices('tooling_sourcing_platform', presence),
    },
    // #2054.10 — le pilotage et le reporting.
    {
      key: 'tooling_bi',
      kind: 'single',
      label: 'questions.toolingBi.label',
      subtitle: 'questions.toolingBi.subtitle',
      choices: presence,
    },
    // #2054.11 — les notes personnelles. La question porte sur QUI y accède :
    // une note qui ne vit que dans un carnet personnel n'est pas de la mémoire
    // d'équipe, et le dire est le premier constat de l'audit.
    {
      key: 'tooling_personal_notes',
      kind: 'single',
      label: 'questions.toolingPersonalNotes.label',
      subtitle: 'questions.toolingPersonalNotes.subtitle',
      choices: presence,
    },
  ],
}
