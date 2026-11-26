import { readPlanEntryRoute } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildPlanSections } from './planSectionsData'
import { buildPlanViewData } from './planViewData'

// #3423.8 — « Par où j'ouvre ce compte ? » (Laura) et la section « Voie d'entrée » de l'onglet Plan
// lisent la MÊME voie : la lecture de Laura vit dans les contrats (`readPlanEntryRoute`), celle de
// l'écran dans `buildPlanSections`. Ce test échoue si l'une dérive.
const FIXTURES: Record<string, unknown>[] = [
  { angles: [{ title: 'A', strategy: 's', entry_contact_persona: 'DSI' }] },
  {
    angles: [
      { title: 'A', strategy: 's', entry_contact_persona: 'DSI' },
      { title: 'B', strategy: 's', is_recommended: true, entry_point: 'Directeur Data' },
    ],
  },
  {
    user_attack_angles: [{ title: 'Mien', entry_point: 'Achats IT' }],
    angles: [{ title: 'G', strategy: 's', is_recommended: true, entry_contact_persona: 'DSI' }],
  },
  { angles: [{ title: 'Sans voie', strategy: 's' }] },
  {},
]

describe('voie d’entrée : écran Plan et Laura lisent la même chose (#3423.8)', () => {
  it.each(FIXTURES.map((raw, index) => [index, raw] as const))('fixture %i', (_index, raw) => {
    const voie = buildPlanSections(buildPlanViewData(raw)).find(section => section.key === 'voieDentree')
    const onScreen = voie && voie.measured ? voie.lines[0]?.value : null
    expect(onScreen ?? null).toBe(readPlanEntryRoute(raw))
  })
})
