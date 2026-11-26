import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyEntityResolutionCorrections,
  entityResolutionCorrectionRequestSchema,
  entityResolutionSchema,
} from '@bellum/contracts'
import { DEMO_ENTITY_RESOLUTION_COVERAGE, DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_ENTITY_RESOLUTION_CORRECTION } from './demo-dataset'
import { DEMO_PURGE_TABLES } from './demo-reset.service'

/**
 * #2284 — la couverture démo de `entity_resolution` se RECALCULE : chaque bloc
 * semé passe le vrai contrat (un bloc refusé laisserait la carte muette en
 * démonstration — garde verte sur un bloc mort), et les deux états annoncés
 * dans `demo-coverage.ts` sont bien là.
 */
describe('#2284 — couverture démo de entity_resolution', () => {
  const seeded = DEMO_DOSSIERS.map(dossier => dossier.account.raw_analysis['entity_resolution']).filter(
    value => value != null,
  )

  it('est classée seedée', () => {
    expect(DEMO_ENTITY_RESOLUTION_COVERAGE.state).toBe('seede')
  })

  it('chaque bloc semé passe le vrai contrat', () => {
    expect(seeded.length).toBeGreaterThanOrEqual(2)
    for (const block of seeded) {
      const parsed = entityResolutionSchema.safeParse(block)
      expect(parsed.success ? null : parsed.error.issues).toBeNull()
    }
  })

  it('montre une entité résolue ET une non résolue', () => {
    const states = seeded.map(block => entityResolutionSchema.parse(block).state)
    expect(states).toEqual(expect.arrayContaining(['resolved', 'unresolved']))
  })
})

/**
 * #2284.67-.69 (tranche 2) — la correction d'identité de l'espace est SEMÉE :
 * sans elle, la carte ne montrerait jamais « Confirmée par votre espace » en
 * démonstration. Recalculé, pas relu : la correction semée passe par la VRAIE
 * superposition (`applyEntityResolutionCorrections`) sur le VRAI bloc semé.
 */
describe('#2284.67-.69 — couverture démo de entity_resolution_corrections', () => {
  it('la table est semée, et purgée à chaque remise à zéro', () => {
    expect(DEMO_SEEDED_TABLES).toContain('entity_resolution_corrections')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('entity_resolution_corrections')
    expect([...DEMO_PURGE_TABLES]).toContain('entity_resolution_corrections')
  })

  it('la correction semée vise un dossier semé, et le rend « tranché par l’espace »', () => {
    const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_ENTITY_RESOLUTION_CORRECTION.companyName)
    expect(dossier).toBeDefined()
    const computed = entityResolutionSchema.parse(dossier?.account.raw_analysis['entity_resolution'])
    const request = entityResolutionCorrectionRequestSchema.parse(DEMO_ENTITY_RESOLUTION_CORRECTION.request)
    const out = applyEntityResolutionCorrections(computed, [
      {
        version: 1,
        decision: request.decision,
        target_name: request.target_name,
        target_siren: request.target_siren ?? null,
        note: request.note ?? null,
        decided_at: '2026-09-24T09:00:00Z',
      },
    ])
    expect(out?.state).toBe('manual_override')
    expect(out?.sources).toContain('workspace_correction')
  })

  it('le semis ÉCRIT réellement la ligne (une classification n’est pas une preuve)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toMatch(/INSERT INTO entity_resolution_corrections/)
    expect(seed).toContain('DEMO_ENTITY_RESOLUTION_CORRECTION')
  })
})

/**
 * Décision Louis 04/10/2026 (« je ne veux plus d'exemples comme ça ») — les deux
 * comptes FICTIFS qui montraient `kind: 'platform'` (+ les sources `size`,
 * `workspace_data`, `official_site`) et `kind: 'end_client'` (+ une
 * dénomination antérieure) ont quitté la salle. Aucun vrai compte de la salle
 * n'est une plateforme d'intermédiation ni un acheteur public : ces capacités
 * sont VIDES À DESSEIN, raison écrite dans `DEMO_ENTITY_RESOLUTION_COVERAGE`.
 * La garde vérifie que la raison est écrite ET qu'aucun compte fictif ne revient.
 */
describe('décision Louis 04/10/2026 — platform / end_client vides à dessein, aucun compte fictif', () => {
  it('la raison est écrite dans le registre de couverture', () => {
    expect(DEMO_ENTITY_RESOLUTION_COVERAGE.reason).toMatch(/décision Louis 04\/10/)
    expect(DEMO_ENTITY_RESOLUTION_COVERAGE.reason).toMatch(/plateforme d.intermédiation/)
    expect(DEMO_ENTITY_RESOLUTION_COVERAGE.reason).toMatch(/acheteur public/)
  })

  it('aucun dossier de la salle ne porte un nom « exemple » ni un domaine .example', () => {
    for (const dossier of DEMO_DOSSIERS) {
      expect(dossier.account.company_name).not.toMatch(/exemple/i)
      expect(dossier.account.website ?? '').not.toMatch(/\.example\b/)
    }
  })

  it('le semis n’écrit plus de compte plateforme ni de compte client final', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).not.toContain('seedEntityResolutionPlatformAccount')
    expect(seed).not.toContain('seedEntityResolutionEndClientAccount')
  })
})
