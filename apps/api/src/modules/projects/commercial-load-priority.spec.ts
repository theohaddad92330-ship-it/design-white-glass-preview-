import { sortByCommercialLoad } from './commercial-load-priority'

/**
 * #2035.11 — LA PRIORISATION DES BESOINS PAR LA CHARGE COMMERCIALE.
 *
 * Pure, sans base : un besoin dont le porteur est À CHARGE (son compte de
 * besoins ouverts a atteint le plafond de l'espace) passe APRÈS ceux dont le
 * porteur a encore de la marge — jamais un score, jamais une probabilité,
 * juste une comparaison à un entier déjà connu (`project_needs.owner_id` /
 * `project_needs.status`). Le tri est STABLE : à égalité de charge, l'ordre
 * déjà posé par `OpenNeedsService` (deadline puis création) ne bouge pas.
 */
describe('#2035.11 — sortByCommercialLoad', () => {
  const need = (id: string, owner_id: string | null) => ({ id, owner_id })

  it('fait passer un besoin dont le porteur est à charge APRÈS les autres', () => {
    const rows = [need('a', 'over'), need('b', 'under'), need('c', 'over')]
    const openNeedsByOwner = new Map([
      ['over', 20],
      ['under', 3],
    ])
    const sorted = sortByCommercialLoad(rows, openNeedsByOwner, 15)
    expect(sorted.map(r => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('atteindre EXACTEMENT le plafond compte comme « à charge »', () => {
    const rows = [need('a', 'exact'), need('b', 'under')]
    const openNeedsByOwner = new Map([
      ['exact', 15],
      ['under', 14],
    ])
    expect(sortByCommercialLoad(rows, openNeedsByOwner, 15).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('un besoin sans porteur n’est JAMAIS déprioritisé — personne à qui reprocher la charge', () => {
    const rows = [need('a', 'over'), need('b', null)]
    const openNeedsByOwner = new Map([['over', 99]])
    expect(sortByCommercialLoad(rows, openNeedsByOwner, 15).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('un porteur absent de la carte (0 besoin connu) n’est jamais à charge', () => {
    const rows = [need('a', 'inconnu')]
    expect(sortByCommercialLoad(rows, new Map(), 15).map(r => r.id)).toEqual(['a'])
  })

  it('TRI STABLE : à charge égale, l’ordre déjà posé (deadline/création) ne bouge pas', () => {
    const rows = [need('a', 'over'), need('b', 'over'), need('c', 'under')]
    const openNeedsByOwner = new Map([
      ['over', 20],
      ['under', 1],
    ])
    // 'a' et 'b' sont TOUS DEUX à charge : leur ordre relatif (a avant b) est préservé.
    expect(sortByCommercialLoad(rows, openNeedsByOwner, 15).map(r => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('n’écrit rien dans la liste reçue — retourne un nouveau tableau', () => {
    const rows = [need('a', 'over'), need('b', 'under')]
    const openNeedsByOwner = new Map([
      ['over', 20],
      ['under', 1],
    ])
    const sorted = sortByCommercialLoad(rows, openNeedsByOwner, 15)
    expect(sorted).not.toBe(rows)
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
  })
})
