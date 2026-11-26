import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  consentState,
  consultantAvailabilitySchema,
  consultantSenioritySchema,
  ENRICHED_MIN_AXES,
  talentCompleteness,
} from '@bellum/contracts'
import { DEMO_TALENT_FILTER_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LE TIROIR DE FILTRES DU VIVIER — `availability` ET `seniority` (30/08/2026,
 * `TalentFilterDrawer.tsx`, `GET /talents?availability=…&seniority=…`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÉRIFIÉ, PAS SEMÉ — ET C'EST LA CONCLUSION, PAS UNE ESQUIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement aux trois autres manques de ce lot, celui-ci n'a demandé
 * AUCUNE ligne nouvelle : les sept profils de `DEMO_CONSULTANTS` portaient
 * déjà `availability` et `seniority`, avec des valeurs RÉELLES et VARIÉES,
 * depuis le chantier du matching (PDF 4) — bien avant que ce tiroir existe. Un
 * filtre livré sans données à filtrer se découvre en réunion ; ici la
 * découverte est l'inverse : la démonstration savait déjà répondre à la
 * question avant qu'elle soit posée.
 *
 * Cette garde verrouille la conclusion pour qu'elle ne redevienne pas fausse
 * en silence — un profil ajouté demain sans ces deux champs viderait le
 * tiroir sans que personne ne le remarque avant la démonstration suivante.
 */
describe('couverture du tiroir de filtres du vivier — les preuves du 26/09 (#2182.55)', () => {
  // ⚠️ RENVERSEMENT PARTIEL, daté du 22/10/2026 (Théo C talents-vivier, intégration PR11) : le 26/09 le semis n'écrivait
  // AUCUNE compétence `mission`. Les profils de la salle portent désormais des compétences PROUVÉES
  // (`proven_skill_count` de `demo-dataset.ts`, l'axe « Compétences prouvées » du score) : `mission` n'est écrit que pour
  // elles, jamais par défaut. `interview` reste vide à dessein — aucun entretien réel derrière.
  it('le semis n’écrit `mission` QUE pour une compétence prouvée, et jamais `interview`', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const match = source.match(/source: proven \? 'mission'[^,]*,\n\s*inferred:/)
    expect(match).not.toBeNull()
    expect(match?.[0]).not.toContain("'interview'")
    expect(source).toMatch(/const proven = index < \(provenByName\.get\(/)
  })
})
