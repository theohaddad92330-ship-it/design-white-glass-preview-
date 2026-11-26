import { describe, expect, it } from 'vitest'
import { libelleCohorteDUsage, REPERES_DUSAGE } from './usage-cohortes.logic'

const mesuree = (value: number, observed: number) => ({
  value,
  measurability: { measurable: true, observed, required: 10, missing: 0 },
})
const sousLeSeuil = (observed: number) => ({
  value: null,
  measurability: { measurable: false, observed, required: 10, missing: 10 - observed },
})

describe('#1946.14 — usage à J+7 et J+30', () => {
  it('nomme les DEUX repères que l’issue demande, et rien d’autre', () => {
    expect(REPERES_DUSAGE.map(r => r.cle)).toEqual(['activeCohortAtDay7', 'activeCohortAtDay30'])
    expect(REPERES_DUSAGE.map(r => r.titre)).toEqual(['Usage à J+7', 'Usage à J+30'])
  })

  it('rend le taux avec son dénominateur quand il est mesuré', () => {
    const libelle = libelleCohorteDUsage(mesuree(0.375, 24))
    expect(libelle.valeur).toBe('38 %')
    expect(libelle.pied).toBe('sur 24 inscrits')
  })

  // ⚠️ Le test qui compte : sous le seuil, la valeur n'est JAMAIS « 0 % ».
  it('sous le seuil, dit « non mesuré » et COMBIEN il manque — jamais 0 %', () => {
    const libelle = libelleCohorteDUsage(sousLeSeuil(6))
    expect(libelle.valeur).toBe('non mesuré')
    expect(libelle.pied).toBe('6 inscrits sur 10 nécessaires')
    expect(libelle.valeur).not.toContain('0')
  })

  it('une cohorte VIDE se distingue d’une cohorte trop petite', () => {
    expect(libelleCohorteDUsage(sousLeSeuil(0)).pied).toBe('aucun inscrit dans la fenêtre')
  })

  it('une mesure ILLISIBLE dit qu’elle est illisible, jamais zéro', () => {
    const libelle = libelleCohorteDUsage(null)
    expect(libelle.valeur).toBe('non lu')
    expect(libelle.pied).toBe('indicateur indisponible')
  })

  it('un pied de tuile tient dans sa tuile (≤ 44 caractères)', () => {
    const pieds = [
      libelleCohorteDUsage(mesuree(1, 1234)).pied,
      libelleCohorteDUsage(sousLeSeuil(0)).pied,
      libelleCohorteDUsage(sousLeSeuil(9)).pied,
      libelleCohorteDUsage(null).pied,
    ]
    expect(pieds.every(p => p.length > 0 && p.length <= 44)).toBe(true)
  })
})
