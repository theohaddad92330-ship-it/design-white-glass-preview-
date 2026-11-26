import { demoPdf, demoStorageObjectId } from './demo-stored-files'

/**
 * LES FICHIERS DE LA SALLE.
 *
 * Ce que ces tests protègent : un PDF dont la table `xref` porte de FAUX
 * décalages s'ouvre quand même chez la moitié des lecteurs — ceux qui le
 * réparent en silence — et se découvre donc en réunion, sur la machine de
 * quelqu'un d'autre. Les décalages sont donc RELUS ici, octet par octet.
 */
describe('demoPdf', () => {
  const pdf = demoPdf('Justificatif de demonstration', ['Note de frais 2026-05-004', 'Document FICTIF.'])
  const text = pdf.toString('latin1')

  it('produit un PDF que sa propre entête déclare', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('porte les VRAIS décalages d’octets dans sa table `xref`', () => {
    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1])
    // `startxref` doit tomber exactement sur le mot-clé `xref`.
    expect(text.slice(startxref, startxref + 4)).toBe('xref')

    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map(match => Number(match[1]))
    expect(entries).toHaveLength(5)
    entries.forEach((offset, index) => {
      // Chaque décalage tombe sur la déclaration de SON objet — c'est
      // exactement ce qu'un lecteur suit pour lire le document.
      expect(text.slice(offset, offset + 10)).toContain(`${index + 1} 0 obj`)
    })
  })

  it('déclare la longueur RÉELLE de son flux de contenu', () => {
    const declared = Number(/\/Length (\d+) >>\nstream\n/.exec(text)?.[1])
    const stream = /stream\n([\s\S]*?)\nendstream/.exec(text)?.[1] ?? ''
    expect(Buffer.byteLength(stream, 'latin1')).toBe(declared)
  })

  it('translittère les accents plutôt que d’émettre des octets qu’Helvetica ne sait pas rendre', () => {
    const accented = demoPdf('Pièce d’affaire', ['Créé le 31/08']).toString('latin1')
    expect(accented).toContain('(Piece d affaire)')
    expect(accented).toContain('(Cree le 31/08)')
  })

  it('échappe les parenthèses — sans quoi un libellé casse le flux entier', () => {
    const tricky = demoPdf('Devis (v2)', []).toString('latin1')
    expect(tricky).toContain('(Devis \\(v2\\))')
  })

  it('la garde LIT quelque chose — un fichier vide passerait tous les tests ci-dessus', () => {
    expect(pdf.byteLength).toBeGreaterThan(400)
  })
})

describe('demoStorageObjectId', () => {
  const WORKSPACE = '11111111-1111-4111-8111-111111111111'

  it('rend le MÊME identifiant pour le même espace et le même fichier', () => {
    // C'est toute la raison d'être de cette dérivation : re-semer la salle
    // réécrit le même objet au lieu d'en accumuler un par visiteur.
    expect(demoStorageObjectId(WORKSPACE, 'expense/F-1/a.pdf')).toBe(
      demoStorageObjectId(WORKSPACE, 'expense/F-1/a.pdf'),
    )
  })

  it('rend un identifiant DIFFÉRENT dans un autre espace', () => {
    expect(demoStorageObjectId(WORKSPACE, 'expense/F-1/a.pdf')).not.toBe(
      demoStorageObjectId('22222222-2222-4222-8222-222222222222', 'expense/F-1/a.pdf'),
    )
  })

  it('rend un identifiant DIFFÉRENT pour un autre fichier du même espace', () => {
    expect(demoStorageObjectId(WORKSPACE, 'expense/F-1/a.pdf')).not.toBe(
      demoStorageObjectId(WORKSPACE, 'expense/F-1/b.pdf'),
    )
  })

  it('a la FORME d’un UUID — la colonne est de type `uuid`, elle refuse le reste', () => {
    expect(demoStorageObjectId(WORKSPACE, 'need/x/y.pdf')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
