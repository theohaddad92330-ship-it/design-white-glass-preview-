import { describe, expect, it } from 'vitest'
import consultantsFr from '@/i18n/locales/fr/consultants.json'
import consultantsEn from '@/i18n/locales/en/consultants.json'
import missionsFr from '@/i18n/locales/fr/missions.json'
import missionsEn from '@/i18n/locales/en/missions.json'

// #5021.1 (recette 01/11) — le lien « N consultants en intercontrat → » de Missions › Planning mène à la page
// titrée « Vivier » : le lien emploie le MÊME mot que le titre de la page (fr et en).
function findKey(tree: unknown, key: string): string | null {
  if (typeof tree !== 'object' || tree === null) return null
  for (const [k, v] of Object.entries(tree)) {
    if (k === key && typeof v === 'string') return v
    const found = findKey(v, key)
    if (found) return found
  }
  return null
}

describe('#5021.1 — le mot du lien d’accès est le titre de la page', () => {
  it('fr : le lien commence par le titre de la page Vivier', () => {
    expect(findKey(missionsFr, 'intercontract_other')).toContain(consultantsFr.page.title)
  })
  it('en : le lien commence par le titre de la page Talent pool', () => {
    expect(findKey(missionsEn, 'intercontract_other')).toContain(consultantsEn.page.title)
  })
})
