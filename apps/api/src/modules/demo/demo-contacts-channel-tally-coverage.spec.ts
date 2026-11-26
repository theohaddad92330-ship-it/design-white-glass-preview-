import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MON_CRM_SOURCES } from '@bellum/contracts'
import { DEMO_CRM_ORIGIN_CONTACT_NAMES, DEMO_IMPORTED_CONTACT_NAMES, demoContactSource } from './demo-dataset'
import { DEMO_CONTACTS_CHANNEL_TALLY } from './demo-coverage'

/**
 * « ET EN DÉMONSTRATION, LES TUILES « AVEC E-MAIL · AVEC TÉLÉPHONE · À RATTACHER » ET LA PUCE « MON CRM » ? »
 * (#4527.5, #4526.4) — SEEDÉES. Les chiffres sont comptés par l'API sur les contacts de l'espace de démonstration :
 * aucune table ni clé de `raw_analysis` neuve. La puce « Mon CRM » exige des contacts d'origine CRM, semés ici.
 */
const dataset = readFileSync(join(__dirname, 'demo-dataset.ts'), 'utf8')

describe('couverture démo — tuiles chiffrées et puce Mon CRM', () => {
  it('lit un corpus NON VIDE — des contacts d’origine CRM sont nommés', () => {
    expect(DEMO_CRM_ORIGIN_CONTACT_NAMES.length).toBeGreaterThanOrEqual(3)
  })

  it('chaque nom désigne UN contact du jeu de démonstration (sinon la puce resterait vide)', () => {
    for (const name of DEMO_CRM_ORIGIN_CONTACT_NAMES) {
      const occurrences = dataset.split(`full_name: '${name}'`).length - 1
      expect(occurrences).toBeGreaterThanOrEqual(1)
    }
  })

  it('l’origine CRM est une source que la puce « Mon CRM » compte ; les autres restent `demo`', () => {
    for (const name of DEMO_CRM_ORIGIN_CONTACT_NAMES) {
      expect(MON_CRM_SOURCES).toContain(demoContactSource(name))
    }
    expect(demoContactSource('Quelqu’un d’autre')).toBe('demo')
  })

  // #4597.1 — la puce « Importés » exige des contacts `source = 'import'` ; et « Mon CRM » ne les compte plus.
  it('#4597.1 des contacts nommés portent `import` — jamais `crm` : « Mon CRM » ne compte que le CRM', () => {
    expect(DEMO_IMPORTED_CONTACT_NAMES.length).toBeGreaterThanOrEqual(2)
    for (const name of DEMO_IMPORTED_CONTACT_NAMES) {
      expect(demoContactSource(name)).toBe('import')
      expect(MON_CRM_SOURCES as readonly string[]).not.toContain(demoContactSource(name))
      expect(dataset.split(`full_name: '${name}'`).length - 1).toBeGreaterThanOrEqual(1)
    }
  })

  it('est classée SEEDÉE avec sa raison', () => {
    expect(DEMO_CONTACTS_CHANNEL_TALLY.state).toBe('seede')
    expect(DEMO_CONTACTS_CHANNEL_TALLY.reason.length).toBeGreaterThan(200)
    expect(DEMO_CONTACTS_CHANNEL_TALLY.reason).toContain('#4527')
  })
})
