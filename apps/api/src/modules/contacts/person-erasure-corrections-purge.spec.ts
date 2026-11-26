import { correctionNamesErasedPerson } from './person-erasure-corrections-purge'

const NODE_IDS = new Set(['p-7', 'c-1'])

describe('correctionNamesErasedPerson — #2297.51 org_graph_corrections purgée', () => {
  it('une correction PERSON dont l’objectId est son nœud la nomme', () => {
    expect(correctionNamesErasedPerson({ objectId: 'p-7', oldValue: 'DSI', newValue: 'DAF' }, NODE_IDS)).toBe(true)
  })

  it('sait dire NON : une correction sur le nœud d’un AUTRE ne la nomme pas', () => {
    expect(correctionNamesErasedPerson({ objectId: 'p-8', oldValue: 'DSI', newValue: 'DAF' }, NODE_IDS)).toBe(false)
  })

  it('une correction EDGE dont un bout du lien est son nœud la nomme (from)', () => {
    expect(
      correctionNamesErasedPerson({ objectId: 'p-7|reports_to|p-8', oldValue: null, newValue: 'present' }, NODE_IDS),
    ).toBe(true)
  })

  it('une correction EDGE dont un bout du lien est son nœud la nomme (to)', () => {
    expect(
      correctionNamesErasedPerson({ objectId: 'p-8|reports_to|p-7', oldValue: null, newValue: 'present' }, NODE_IDS),
    ).toBe(true)
  })

  it('sait dire NON : une correction EDGE entre deux AUTRES personnes ne la nomme pas', () => {
    expect(
      correctionNamesErasedPerson({ objectId: 'p-8|reports_to|p-9', oldValue: null, newValue: 'present' }, NODE_IDS),
    ).toBe(false)
  })

  it('un N+1 (reportsTo) qui VISE son nœud la nomme, même sur la fiche d’un AUTRE', () => {
    // objectId = le node d'un AUTRE (p-8) ; la VALEUR pointe vers elle (p-7).
    expect(correctionNamesErasedPerson({ objectId: 'p-8', oldValue: null, newValue: 'p-7' }, NODE_IDS)).toBe(true)
  })

  it('une valeur en LISTE (decisionRoles) qui la cite la nomme', () => {
    expect(
      correctionNamesErasedPerson({ objectId: 'p-8', oldValue: [], newValue: ['p-7', 'techLead'] }, NODE_IDS),
    ).toBe(true)
  })

  it('sait dire NON : un ancien texte libre (title) qui ne cite aucun identifiant ne la nomme pas', () => {
    expect(correctionNamesErasedPerson({ objectId: 'p-8', oldValue: 'RSSI', newValue: 'DSI adjoint' }, NODE_IDS)).toBe(
      false,
    )
  })

  it('sait dire NON : aucun identifiant de graphe connu (dossier jamais analysé) ne nomme jamais personne', () => {
    expect(correctionNamesErasedPerson({ objectId: 'p-7', oldValue: null, newValue: null }, new Set())).toBe(false)
  })
})
