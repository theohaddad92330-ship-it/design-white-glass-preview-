import { describe, expect, it } from 'vitest'
import { assessCvTextQuality, repairLetterSpacing } from './cv-text-quality.js'

// #3935 (12/10) — miroir TS de `apps/ia/app/services/text_quality.py` : MÊMES cas, MÊMES verdicts.
// Données fictives uniquement.
const CLEAN = [
  'Jean DUPONT',
  'Ingénieur cybersécurité',
  'Paris, France',
  'Compétences : Python, Docker, Kubernetes, Terraform, Ansible.',
  "Expériences professionnelles : huit ans de missions chez des clients du secteur bancaire, dont trois à la tête d'une équipe de six personnes.",
  "Formation : diplôme d'ingénieur en informatique, spécialité sécurité des systèmes d'information, suivi d'une certification professionnelle en tests d'intrusion.",
].join('\n')

const spaced = (line: string): string =>
  line
    .split(/\s+/)
    .map(word => [...word].join(' '))
    .join('   ')
const SPACED = ['J e a n', 'D U P O N T', ...CLEAN.split('\n').slice(1).map(spaced)].join('\n')

describe('assessCvTextQuality', () => {
  it('juge mauvais un texte espacé lettre à lettre', () => {
    expect(assessCvTextQuality(SPACED).reasons).toContain('lettre_a_lettre')
  })
  it('un texte propre ne nomme aucune raison', () => {
    expect(assessCvTextQuality(CLEAN, 1).reasons).toEqual([])
  })
  it('un PDF quasi vide sur plusieurs pages est juste quasi vide', () => {
    expect(assessCvTextQuality('Jean DUPONT\nIngénieur', 4).reasons).toContain('quasi_vide')
  })
  it('des caractères illisibles sont nommés', () => {
    expect(assessCvTextQuality('Jean ���� DUPONT ��� ingénieur ���� '.repeat(8)).reasons).toContain('illisible')
  })
})

describe('repairLetterSpacing', () => {
  it('recolle : un espace = un mot, 2+ espaces = séparation de mots', () => {
    const repaired = repairLetterSpacing(SPACED)
    expect(repaired).toContain('Jean\nDUPONT')
    expect(repaired).toContain('Ingénieur cybersécurité')
    expect(assessCvTextQuality(repaired, 1).reasons).toEqual([])
  })
  it('rend un texte propre byte-identique', () => {
    expect(repairLetterSpacing(CLEAN)).toBe(CLEAN)
  })
})
