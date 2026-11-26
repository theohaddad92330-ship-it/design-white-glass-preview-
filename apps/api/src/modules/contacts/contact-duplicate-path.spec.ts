import { duplicateIdsToHideFromPath, type PathDuplicateRow } from './contact-duplicate-path'

const row = (id: string, full_name: string, extra: Partial<PathDuplicateRow> = {}): PathDuplicateRow => ({
  id,
  account_id: 'acc-1',
  full_name,
  email: null,
  email_verified: null,
  phone: null,
  linkedin_url: null,
  title: null,
  decision_role: null,
  ...extra,
})

describe('duplicateIdsToHideFromPath', () => {
  it('garde UNE carte pour « Prénom NOM » (décideur) et « Prénom N. » (champion) : la fiche la plus complète', () => {
    const hidden = duplicateIdsToHideFromPath([
      row('full', 'Claire Fontaine', { decision_role: 'economic_buyer', title: 'PDG', email: 'c@x.fr' }),
      row('short', 'Claire F.', { decision_role: 'champion' }),
    ])
    expect([...hidden]).toEqual(['short'])
  })
  it('à complétude égale, la persona la plus haute gagne', () => {
    const hidden = duplicateIdsToHideFromPath([
      row('a', 'Claire Fontaine', { decision_role: 'champion' }),
      row('b', 'Claire Fontaine', { decision_role: 'economic_buyer', title: null }),
    ])
    expect([...hidden]).toEqual(['a'])
  })
  it('ne cache personne quand ce sont deux personnes différentes', () => {
    expect(duplicateIdsToHideFromPath([row('a', 'Claire Fontaine'), row('b', 'Claire M.')]).size).toBe(0)
    expect(
      duplicateIdsToHideFromPath([row('a', 'Claire Fontaine'), row('b', 'Claire F.', { account_id: 'acc-2' })]).size,
    ).toBe(0)
  })
  it("respecte le refus humain : une paire refusée n'est jamais regroupée", () => {
    const hidden = duplicateIdsToHideFromPath([row('a', 'Claire Fontaine'), row('b', 'Claire F.')], new Set(['a|b']))
    expect(hidden.size).toBe(0)
  })
})
