import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GO_CONDITIONS,
  GO_CONDITION_KEYS,
  NO_GO_CONDITIONS,
  NO_GO_CONDITION_KEYS,
  canGo,
  goConditionSchema,
  noGoConditionSchema,
} from './route-migration-go-no-go.js'
import { GO_2208_CONDITIONS, RECETTE_2208_SPECS } from './route-migration-2208-conditions.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

/**
 * #2154.31/.32 — les conditions NO-GO/GO ne peuvent pas se faire passer pour
 * plus avancées qu'elles ne le sont.
 */
describe('conditions NO-GO/GO — complétude', () => {
  it('décrit les QUATORZE conditions NO-GO (onze #2154.31 + trois #2958.9x), sans doublon', () => {
    expect(NO_GO_CONDITIONS).toHaveLength(NO_GO_CONDITION_KEYS.length)
    expect(new Set(NO_GO_CONDITIONS.map(condition => condition.key)).size).toBe(NO_GO_CONDITION_KEYS.length)
  })

  it('décrit les HUIT conditions GO, sans doublon', () => {
    expect(GO_CONDITIONS).toHaveLength(GO_CONDITION_KEYS.length)
    expect(new Set(GO_CONDITIONS.map(condition => condition.key)).size).toBe(GO_CONDITION_KEYS.length)
  })

  it('chaque entrée respecte son contrat', () => {
    for (const condition of NO_GO_CONDITIONS) expect(noGoConditionSchema.safeParse(condition).success).toBe(true)
    for (const condition of GO_CONDITIONS) expect(goConditionSchema.safeParse(condition).success).toBe(true)
  })
})

describe('conditions NO-GO/GO — honnêteté', () => {
  it('les trois recettes (Hervé, Antoine, manager) restent `unknown` — jamais `met` par une garde', () => {
    const recipes = GO_CONDITIONS.filter(condition => condition.key.startsWith('recette_'))
    expect(recipes).toHaveLength(3)
    expect(recipes.every(condition => condition.status === 'unknown')).toBe(true)
  })

  it("aucune condition GO n'est `met` — la migration de #2154 n'a pas commencé", () => {
    // Un GO vrai aujourd'hui serait la preuve que ce fichier ment : aucune des
    // huit conditions n'a de preuve de satisfaction dans ce lot.
    expect(GO_CONDITIONS.some(condition => condition.status === 'met')).toBe(false)
  })

  it('`canGo()` retourne `false` — un `true` aujourd’hui prouverait que la fonction ment', () => {
    expect(canGo()).toBe(false)
  })

  it('les CINQ conditions NO-GO déclarées `clear` le sont sur une portée NOMMÉE, pas sur tout le produit', () => {
    const clear = NO_GO_CONDITIONS.filter(condition => condition.status === 'clear')
    expect(clear.map(condition => condition.key).sort()).toEqual(
      [
        'capacite_sans_destination',
        'utilisateur_doit_connaitre_anciennes_pages',
        'objet_duplique',
        'statut_sans_preuve',
        'source_indisponible_zero',
      ].sort(),
    )
    for (const condition of clear) {
      expect(condition.evidence).toMatch(/14 routes|registre #2154\.3/)
    }
  })

  it('aucune condition NO-GO/GO n’a une preuve vide', () => {
    expect(NO_GO_CONDITIONS.every(condition => condition.evidence.trim().length > 0)).toBe(true)
    expect(GO_CONDITIONS.every(condition => condition.evidence.trim().length > 0)).toBe(true)
  })
})

describe('#2958.95/.101/.102 — les trois conditions du lot #2208 citent une preuve RÉELLE', () => {
  it('objet_duplique cite des fichiers qui existent et portent bien la discipline « propose, ne fusionne jamais »', () => {
    const talentDuplicates = readFileSync(
      join(REPO_ROOT, 'packages/contracts/src/schemas/talent-duplicates.ts'),
      'utf8',
    )
    const opportunityDuplicate = readFileSync(
      join(REPO_ROOT, 'packages/contracts/src/schemas/opportunity-duplicate.ts'),
      'utf8',
    )
    expect(talentDuplicates).toMatch(/PROPOSE/)
    expect(opportunityDuplicate).toMatch(/ne fusionne JAMAIS/)
    expect(existsSync(join(REPO_ROOT, 'apps/api/src/modules/consultants/talent-identity.service.ts'))).toBe(true)
    expect(existsSync(join(REPO_ROOT, 'apps/api/src/modules/projects/project-pipeline.service.ts'))).toBe(true)
  })

  it('statut_sans_preuve cite le registre de migration ET le pattern Provenance, tous deux réels', () => {
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/route-migration-registry.test.ts'))).toBe(true)
    const provenance = readFileSync(join(REPO_ROOT, 'packages/contracts/src/schemas/provenance.ts'), 'utf8')
    expect(provenance).toMatch(/decideFieldWrite/)
    expect(existsSync(join(REPO_ROOT, 'apps/api/src/modules/crm/crm-import.service.ts'))).toBe(true)
  })

  it('source_indisponible_zero cite les gaps du registre de non-régression ET `UnknownValue`, tous deux réels', () => {
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/route-migration-nonregression.ts'))).toBe(true)
    const unknownValue = readFileSync(join(REPO_ROOT, 'apps/web/src/components/primitives/UnknownValue.tsx'), 'utf8')
    expect(unknownValue).toMatch(/export function UnknownValue/)
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/architecture/display-primitives.test.ts'))).toBe(true)
  })
})

/**
 * #2958 — décision Louis 11/10 : les cousines #2154.32 (mêmes clés Antoine,
 * Hervé, manager) suivent la décision du 09/10 qui a basculé #2958.106-.109 —
 * signées par LE MÊME scénario e2e (vert en CI = signé), `humanOnly: false`,
 * statut `unknown` (le verdict est celui du job e2e), preuve citant le spec.
 */
describe('conditions GO #2154.32 — recettes signées par leur scénario (décision Louis 11/10)', () => {
  const urlsTyped = (source: string) => (source.match(/page\.goto\(/g) ?? []).length
  const signedKeys = GO_CONDITIONS.map(condition => condition.key).filter(key => key in RECETTE_2208_SPECS)

  it('les trois cousines Antoine/Hervé/manager ont un scénario — le même que leur recette #2208', () => {
    expect([...signedKeys].sort()).toEqual(['recette_antoine', 'recette_herve', 'recette_manager'])
  })

  it.each(signedKeys)('%s : `humanOnly: false`, `unknown`, preuve citant le scénario de #2208', key => {
    const spec = RECETTE_2208_SPECS[key as keyof typeof RECETTE_2208_SPECS]
    const file = join(REPO_ROOT, spec)
    expect(existsSync(file), spec).toBe(true)
    expect(urlsTyped(readFileSync(file, 'utf8'))).toBe(1)
    const condition = GO_CONDITIONS.find(entry => entry.key === key)
    const cousin = GO_2208_CONDITIONS.find(entry => entry.key === key)
    expect(condition?.humanOnly).toBe(false)
    expect(condition?.status).toBe('unknown')
    expect(condition?.evidence).toContain(spec)
    // Même personne, même geste : la cousine dit la même chose que sa recette #2208.
    expect(condition?.humanOnly).toBe(cousin?.humanOnly)
    expect(condition?.status).toBe(cousin?.status)
  })

  it('sait dire NON : une recette sans scénario reste humaine', () => {
    const unsigned = GO_CONDITIONS.filter(
      condition => condition.key.startsWith('recette_') && !(condition.key in RECETTE_2208_SPECS),
    )
    expect(unsigned.every(condition => condition.humanOnly)).toBe(true)
  })
})
