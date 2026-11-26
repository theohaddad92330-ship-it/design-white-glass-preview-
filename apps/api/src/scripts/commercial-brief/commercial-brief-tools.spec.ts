import { mergeReadme, renderReadme, type AccountReport } from './brief-readme'
import { neutralizeProspectEsn } from './text-rules'

/**
 * Outils du convertisseur ajoutés pour la démo ESN Nantes (04/10/2026) :
 *  - « NGen » (l'ESN prospect) est neutralisé comme « OneSide » l'a été le 01/10 ;
 *  - `--only <slug>` ne réécrit QUE les comptes demandés : le README généré est
 *    FUSIONNÉ, jamais régénéré pour les autres entrées.
 */

describe('neutralizeProspectEsn', () => {
  it('réécrit chaque tournure connue', () => {
    expect(neutralizeProspectEsn('ton expertise nucléaire')).toBe('ton expertise nucléaire')
    expect(neutralizeProspectEsn('Expertise nucléaire de NGen à Nantes')).toBe('Expertise nucléaire à Nantes')
    expect(neutralizeProspectEsn("Le savoir-faire d'NGen sur la sûreté")).toBe('Le savoir-faire sur la sûreté')
  })

  it('échoue sur une tournure sans règle (jamais un « NGen » laissé passer)', () => {
    expect(() => neutralizeProspectEsn('Le profil NGEN est rare')).toThrow(/NGen/)
  })

  // Démo clients 04/10/2026 : Thélio (BPCE Toulouse), Les Pertinents (BPCE), Alpineo (ABB Suisse), OneSide — des ESN
  // PROSPECTS : le brief parle au commercial (« ton cabinet »), il ne les nomme pas.
  it('réécrit la tournure connue de Thélio (en-tête « VERDICT POUR THÉLIO »)', () => {
    expect(neutralizeProspectEsn('VERDICT POUR THÉLIO')).toBe('VERDICT')
    expect(neutralizeProspectEsn('Verdict pour Thelio')).toBe('Verdict')
  })

  it.each([['Thélio'], ['THELIO'], ['Les Pertinents'], ['les pertinents'], ['Alpineo'], ['ALPINEO']])(
    'échoue sur « %s » sans règle (jamais une ESN prospect laissée passer)',
    name => {
      expect(() => neutralizeProspectEsn(`Le brief de ${name} sur le compte`)).toThrow(/non neutralisé/)
    },
  )

  it('ne touche pas « pertinent » employé comme adjectif', () => {
    expect(neutralizeProspectEsn('Un signal pertinent et des contacts pertinents')).toBe(
      'Un signal pertinent et des contacts pertinents',
    )
  })

  it('ne touche pas les mots qui contiennent « gen » (ingénierie, agence, general)', () => {
    expect(neutralizeProspectEsn('Ingénierie, agence et General Electric')).toBe(
      'Ingénierie, agence et General Electric',
    )
  })
})

const report = (name: string, slug: string, people: number): AccountReport =>
  ({
    plan: { name, slug, source: `${slug}.xlsx` },
    conversion: { coverage: [{ sheet: 'COCKPIT', field: 'kpis', rows: 6 }], skipped: {}, anomalies: [] },
    brief: {
      headquarters: { label: 'Paris', city: 'Paris' },
      people: Array.from({ length: people }, () => ({ name: 'x', role: 'contact' })),
      entities: [],
      sites: [],
      esn: [],
      prices: [],
      sections: [],
    },
    violations: 0,
    json: '{}',
  }) as unknown as AccountReport

describe('mergeReadme (--only)', () => {
  const existing = renderReadme([report('ENGIE', 'engie', 5), report('Alstom', 'alstom', 3)])

  it('garde les entrées existantes à l’identique et ajoute les nouvelles', () => {
    const merged = mergeReadme(existing, [report('Naval Group', 'naval-group', 2)])
    expect(merged).toContain('| ENGIE | `engie.json`')
    expect(merged).toContain('| Alstom | `alstom.json`')
    expect(merged).toContain('| Naval Group | `naval-group.json`')
    expect(merged).toContain('## Naval Group — `naval-group.xlsx`')
    expect(merged).toContain('## ENGIE — `engie.xlsx`')
    expect(merged.indexOf('| Naval Group |')).toBeGreaterThan(merged.indexOf('| Alstom |'))
  })

  it('remplace (jamais ne double) une entrée déjà présente', () => {
    const once = mergeReadme(existing, [report('Alstom', 'alstom', 9)])
    expect(once.match(/\| Alstom \|/g)).toHaveLength(1)
    expect(once.match(/## Alstom —/g)).toHaveLength(1)
    expect(once).toContain('| Alstom | `alstom.json` | 0 Ko | 9 |')
  })

  it('est idempotent', () => {
    const a = mergeReadme(existing, [report('Naval Group', 'naval-group', 2)])
    expect(mergeReadme(a, [report('Naval Group', 'naval-group', 2)])).toBe(a)
  })
})
