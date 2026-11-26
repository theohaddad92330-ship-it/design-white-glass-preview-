import { describe, expect, it } from 'vitest'
import { readExperienceKeys } from './talent-duplicates.js'

/**
 * #3811.5 — le MÊME CV sans nom, déposé en PDF puis en docx, ne crée pas un
 * second consultant. Les deux extracteurs rendent le même contenu avec des
 * retours à la ligne différents ; l'employeur et la période doivent donc se
 * lire comme UNE expérience, que la période soit sur sa ligne ou à côté du nom.
 * Fixtures ANONYMISÉES.
 */
const PDF = `Compétences
Expériences

ACME CORP
Depuis Mai 2022
Développeur FullStack
Missions
Globex Retail
De Février 2024 à octobre 2026
Développeur fullstack
`

const DOCX = `Expériences
ACME CORP
Depuis Mai 2022
Développeur FullStack
Globex Retail
De Février 2024 à octobre 2026
Développeur fullstack
Compétences
Spring NestJS
`

const ONE_LINE = `Expériences
ACME CORP - Depuis Mai 2022 - Développeur FullStack
`

describe('readExperienceKeys — période seule sur sa ligne', () => {
  it('#3811.5 — l’employeur au-dessus de la période fait une expérience lisible', () => {
    const keys = readExperienceKeys(PDF)
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(keys.some(key => key.includes('acme') && key.includes('2022'))).toBe(true)
  })

  it('#3811.5 — PDF et docx du même CV partagent leurs expériences', () => {
    const fromPdf = readExperienceKeys(PDF)
    const shared = readExperienceKeys(DOCX).filter(key => fromPdf.includes(key))
    expect(shared.length).toBeGreaterThanOrEqual(2)
  })

  it('#3811.5 — une ligne de date isolée sans employeur au-dessus ne fait pas une expérience', () => {
    expect(readExperienceKeys('Mis à jour le 12 mars 2024\nDepuis 2019\n')).toEqual([])
  })

  it('#3811.5 — contrôle : une expérience déjà sur une ligne reste lue comme avant', () => {
    expect(readExperienceKeys(ONE_LINE)).toEqual(['acme corp depuis mai 2022 developpeur fullstack'])
  })
})
