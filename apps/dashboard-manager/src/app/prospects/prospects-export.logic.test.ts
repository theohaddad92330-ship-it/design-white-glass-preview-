import { describe, expect, it } from 'vitest'
import type { DemoLead } from '@/lib/demo-leads'
import {
  COLONNES_EXPORT_PROSPECTS,
  cellulePourCsv,
  csvDesProspects,
  libelleRoleDeclare,
  nomFichierProspects,
} from './prospects-export.logic'

/**
 * #4387 — Louis, 20/10/2026 : export CSV complet des prospects, sur cette page seule.
 */
const LEAD: DemoLead = {
  id: 'l1',
  firstName: 'Camille',
  lastName: 'Durand',
  email: 'camille@acme.fr',
  jobTitle: 'esn_founder',
  company: 'Acme',
  phone: '+33 6 12 34 56 78',
  firstAccessAt: '2026-10-19T08:30:00.000Z',
  lastAccessAt: '2026-10-20T13:05:00.000Z',
  accessCount: 3,
  source: 'demo',
  utmSource: 'linkedin',
}

describe('cellulePourCsv (#4387) — RFC 4180 + injection de formule', () => {
  it('laisse une valeur simple telle quelle', () => {
    expect(cellulePourCsv('Acme')).toBe('Acme')
  })
  it('entoure de guillemets ce qui contient ; " ou un saut de ligne, et double les guillemets', () => {
    expect(cellulePourCsv('a;b')).toBe('"a;b"')
    expect(cellulePourCsv('il dit "oui"')).toBe('"il dit ""oui"""')
    expect(cellulePourCsv('l1\nl2')).toBe('"l1\nl2"')
  })
  it.each(['=1+1', '+33612345678', '-5', '@SUM(A1)'])('préfixe d’une apostrophe %s', valeur => {
    expect(cellulePourCsv(valeur).startsWith(`'${valeur[0]}`)).toBe(true)
  })
  it('protège aussi une formule qui demande des guillemets', () => {
    expect(cellulePourCsv('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`)
  })
  it('une valeur absente est une cellule vide, jamais « undefined » ni « 0 »', () => {
    expect(cellulePourCsv(undefined)).toBe('')
  })
})

describe('libelleRoleDeclare (#4387)', () => {
  it('rend le libellé lisible quand il existe', () => {
    expect(libelleRoleDeclare('esn_founder')).toBe('Fondateur / Dirigeant d’ESN')
  })
  it('garde la clé brute quand aucun libellé n’existe', () => {
    expect(libelleRoleDeclare('inconnu_x')).toBe('inconnu_x')
  })
})

describe('csvDesProspects (#4387)', () => {
  const csv = csvDesProspects([LEAD])
  it('commence par le BOM UTF-8', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
  it('sépare par point-virgule et termine les lignes par CRLF', () => {
    const lignes = csv.slice(1).split('\r\n')
    expect(lignes[0]).toBe(COLONNES_EXPORT_PROSPECTS.map(c => c.entete).join(';'))
    expect(lignes).toHaveLength(3) // entête + 1 ligne + fin vide
    expect(lignes[2]).toBe('')
  })
  it('porte les colonnes demandées, dans l’ordre', () => {
    expect(COLONNES_EXPORT_PROSPECTS.map(c => c.entete)).toEqual([
      'Prénom',
      'Nom',
      'E-mail',
      'Téléphone',
      'Rôle déclaré',
      'Entreprise',
      'Statut',
      'Premier accès',
      'Dernier accès',
      'Nombre d’accès',
      'Source',
      'UTM source',
      'UTM support',
      'UTM campagne',
      'UTM terme',
      'UTM contenu',
    ])
  })
  it('écrit e-mail et téléphone EN CLAIR, dates à Paris JJ/MM/AAAA HH:MM, rôle lisible', () => {
    const ligne = csv.slice(1).split('\r\n')[1] ?? ''
    expect(ligne).toBe(
      [
        'Camille',
        'Durand',
        'camille@acme.fr',
        `'+33 6 12 34 56 78`,
        'Fondateur / Dirigeant d’ESN',
        'Acme',
        'Démo lancée',
        '19/10/2026 10:30',
        '20/10/2026 15:05',
        '3',
        'demo',
        'linkedin',
        '',
        '',
        '',
        '',
      ].join(';'),
    )
  })
  it('liste vide : l’entête seul', () => {
    expect(csvDesProspects([]).slice(1)).toBe(`${COLONNES_EXPORT_PROSPECTS.map(c => c.entete).join(';')}\r\n`)
  })
})

describe('nomFichierProspects (#4387)', () => {
  it('prospects-AAAA-MM-JJ.csv, jour lu à Paris', () => {
    expect(nomFichierProspects(new Date('2026-10-20T10:00:00Z'))).toBe('prospects-2026-10-20.csv')
    expect(nomFichierProspects(new Date('2026-10-20T23:30:00Z'))).toBe('prospects-2026-10-21.csv')
  })
})
