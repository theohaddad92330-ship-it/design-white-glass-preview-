import { describe, expect, it } from 'vitest'
import { vcardToCsv } from './vcard'

// Théo B c3-imports-sources.N1 — « Carnet d'adresses » : une carte vCard devient une ligne du tableau d'import.
describe('vcardToCsv — Théo B c3.N1', () => {
  const card = (lines: string[]) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n')

  it('lit le nom, la fonction, la société, l’e-mail, le téléphone et le profil LinkedIn', () => {
    const csv = vcardToCsv(
      card([
        'FN:Camille Duval',
        'TITLE:Responsable Data',
        'ORG:Groupe Hélios;Direction Data',
        'EMAIL;TYPE=WORK:camille.duval@groupe-helios.fr',
        'TEL;TYPE=CELL:+33 6 12 34 56 78',
        'URL:https://www.linkedin.com/in/camille-duval',
      ]),
    )
    expect(csv?.split('\n')[0]).toBe('Nom;Fonction;Entreprise;Email;Téléphone;linkedin')
    expect(csv?.split('\n')[1]).toBe(
      'Camille Duval;Responsable Data;Groupe Hélios;camille.duval@groupe-helios.fr;+33 6 12 34 56 78;https://www.linkedin.com/in/camille-duval',
    )
  })

  it('lit plusieurs cartes et reprend les lignes pliées (RFC 6350)', () => {
    const csv = vcardToCsv(
      `${card(['FN:Claire', ' Vasseur', 'EMAIL:claire@exemple.test'])}\r\n${card(['FN:Alex Martin'])}`,
    )
    const lines = csv?.trim().split('\n') ?? []
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('ClaireVasseur')
    expect(lines[2]).toMatch(/^Alex Martin;/)
  })

  it('compose le nom depuis N quand FN manque, et ne devine rien d’autre', () => {
    const csv = vcardToCsv(card(['N:Garcia;Inès;;;']))
    expect(csv?.split('\n')[1]).toMatch(/^Inès Garcia;/)
  })

  it('protège les points-virgules et guillemets d’une valeur', () => {
    const csv = vcardToCsv(card(['FN:Ana "A" B', 'TITLE:Chef; adjoint']))
    expect(csv?.split('\n')[1]).toContain('"Ana ""A"" B"')
    expect(csv?.split('\n')[1]).toContain('"Chef; adjoint"')
  })

  it('rend null quand le texte ne contient aucune carte', () => {
    expect(vcardToCsv('rien ici')).toBeNull()
  })
})
