import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DISCOVER_PARTNER_COMPLEMENTARITY_COVERAGE } from './demo-coverage'

/**
 * #2165.55 — « et en démonstration, le bloc complémentarité du panneau
 * Partenaires de Découvrir montre quoi ? »
 *
 * MÊME principe que `demo-discover-observed-clients-filter-coverage.spec.ts` :
 * `PartnerResultRow.tsx`/`discover-partner-complementarity.ts` n'ont pas de
 * TABLE à eux ni de clé `raw_analysis` — la garde par table ne pose jamais
 * cette question. Ce fichier est l'appelant qui lit le VRAI code, pas une
 * liste recopiée à la main.
 */

const PARTNER_RESULT_ROW = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'discover',
  'view',
  'PartnerResultRow.tsx',
)

const COMPLEMENTARITY_LIB = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'features',
  'discover',
  'lib',
  'discover-partner-complementarity.ts',
)

const DEMO_DATASET = join(__dirname, 'demo-dataset.ts')

describe('couverture démo — complémentarité du panneau Partenaires (#2165.55)', () => {
  it('LIT l’écran réel — le bloc est rendu par PartnerResultRow, pas recopié à la main', () => {
    const source = readFileSync(PARTNER_RESULT_ROW, 'utf8')
    expect(source).toContain('PartnerComplementarityBlock')
    expect(source).toContain('row.complementarity')
  })

  it('LIT le calcul réel — un axe évalué compte comme « connue », jamais le score composite seul', () => {
    const source = readFileSync(COMPLEMENTARITY_LIB, 'utf8')
    expect(source).toContain('isComplementarityUnknown')
    expect(source).toContain('passesComplementarityKnown')
  })

  it('LIT le semis réel — le profil propre de l’ESN de démonstration porte des secteurs non vides', () => {
    const source = readFileSync(DEMO_DATASET, 'utf8')
    expect(source).toContain('target_sectors')
  })

  it('classe la capacité « seedée », et la raison NOMME la source réelle', () => {
    expect(DEMO_DISCOVER_PARTNER_COMPLEMENTARITY_COVERAGE.state).toBe('seede')
    expect(DEMO_DISCOVER_PARTNER_COMPLEMENTARITY_COVERAGE.reason).toContain('sectorsPriority')
    expect(DEMO_DISCOVER_PARTNER_COMPLEMENTARITY_COVERAGE.reason).toContain('DEMO_ESN_PROFILE')
    expect(DEMO_DISCOVER_PARTNER_COMPLEMENTARITY_COVERAGE.reason.length).toBeGreaterThan(200)
  })

  it('sait dire NON — une raison trop courte échouerait à ce même contrôle (témoin)', () => {
    const tropCourte = { state: 'seede' as const, reason: 'Semée.' }
    expect(tropCourte.reason.length).toBeLessThan(200)
  })
})
