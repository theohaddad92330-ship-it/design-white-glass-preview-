import { describe, expect, it } from 'vitest'
import {
  COMPANY_CATEGORIES,
  LEGAL_FORMS,
  REGISTRY_REGIONS,
  parseAmount,
  parseDepartments,
} from './discover-registry-vocab'

describe('parseDepartments', () => {
  it('rend TOUS les départements de la saisie, pas seulement le premier', () => {
    // C'est le défaut : le champ invitait à en coller plusieurs (il accepte
    // virgules et espaces) et n'en honorait qu'un, sans le dire.
    expect(parseDepartments('31, 33, 34')).toEqual(['31', '33', '34'])
  })

  it('complète un chiffre seul', () => {
    expect(parseDepartments('1')).toEqual(['01'])
  })

  it('accepte la Corse et les DOM', () => {
    expect(parseDepartments('2A 2b 974')).toEqual(['2A', '2B', '974'])
  })

  it('écarte ce qui n’est pas un département plutôt que de l’approcher', () => {
    expect(parseDepartments('Rhône-Alpes')).toEqual([])
    expect(parseDepartments('99')).toEqual([])
  })

  it('dédoublonne — deux fois le même département n’est pas deux critères', () => {
    expect(parseDepartments('31,31')).toEqual(['31'])
  })

  it('rend une liste vide sur une saisie vide, jamais une valeur inventée', () => {
    expect(parseDepartments('')).toEqual([])
  })
})

describe('parseAmount', () => {
  it('lit un montant écrit avec des séparateurs', () => {
    expect(parseAmount('50 000 000')).toBe(50000000)
    expect(parseAmount('1.000.000')).toBe(1000000)
  })

  it('rend undefined sur une saisie vide — un montant absent n’est PAS zéro', () => {
    // Zéro euro de chiffre d'affaires est une valeur VRAIE, et différente de
    // « non renseigné ». Les confondre filtrerait sur un seuil que personne
    // n'a posé.
    expect(parseAmount('')).toBeUndefined()
    expect(parseAmount('abc')).toBeUndefined()
  })

  it('lit un vrai zéro comme un zéro', () => {
    expect(parseAmount('0')).toBe(0)
  })
})

describe('vocabulaires du registre', () => {
  it('porte les 18 régions INSEE', () => {
    expect(REGISTRY_REGIONS).toHaveLength(18)
  })

  it('n’a aucun code de région en double', () => {
    const codes = REGISTRY_REGIONS.map(r => r.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('porte les trois catégories INSEE, et RIEN de plus', () => {
    expect(COMPANY_CATEGORIES.map(c => c.code)).toEqual(['PME', 'ETI', 'GE'])
  })

  it('ne porte que des codes de forme juridique à quatre chiffres', () => {
    for (const form of LEGAL_FORMS) expect(form.code).toMatch(/^\d{4}$/)
  })

  it('n’a aucun code de forme juridique en double', () => {
    const codes = LEGAL_FORMS.map(f => f.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('les nouveaux critères partent RÉELLEMENT dans la requête', () => {
  it('sérialise région, CA, catégorie et forme juridique', async () => {
    // Sans cette vérification, on aurait pu poser quatre contrôles à l'écran
    // qui ne changent rien à la requête — le défaut n°1 du dépôt : du code
    // juste que personne n'appelle.
    const { buildRegistryQuery, emptyRegistryFilters } = await import('./discover-query')
    const q = buildRegistryQuery(
      {
        ...emptyRegistryFilters(),
        region: ['76'],
        revenueMin: '50 000 000',
        revenueMax: '',
        companyCategory: ['ETI', 'GE'],
        legalForm: '5710',
      },
      Date.parse('2026-09-04T00:00:00Z'),
    )

    expect(q.filters.region).toBe('76')
    expect(q.filters.revenueMin).toBe(50000000)
    expect(q.filters.revenueMax).toBeUndefined()
    expect(q.filters.companyCategory).toEqual(['ETI', 'GE'])
    expect(q.filters.legalCategory).toBe('5710')
  })

  it('envoie TOUS les départements, et garde le singulier pour la source qui n’en prend qu’un', async () => {
    const { buildRegistryQuery, emptyRegistryFilters } = await import('./discover-query')
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), department: '31, 33' }, Date.now())

    expect(q.filters.departments).toEqual(['31', '33'])
    expect(q.filters.department).toBe('31')
  })

  it('#2642.1 — envoie TOUTES les régions cochées, et garde le singulier pour la source qui n’en prend qu’une', async () => {
    const { buildRegistryQuery, emptyRegistryFilters } = await import('./discover-query')
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), region: ['11', '76'] }, Date.now())

    expect(q.filters.regions).toEqual(['11', '76'])
    expect(q.filters.region).toBe('11')
  })

  it('n’envoie RIEN quand rien n’est posé — un critère vide n’est pas un critère', async () => {
    const { buildRegistryQuery, emptyRegistryFilters } = await import('./discover-query')
    const q = buildRegistryQuery({ ...emptyRegistryFilters(), freetext: 'SAP' }, Date.now())

    expect(q.filters.region).toBeUndefined()
    expect(q.filters.regions).toBeUndefined()
    expect(q.filters.revenueMin).toBeUndefined()
    expect(q.filters.companyCategory).toBeUndefined()
    expect(q.filters.legalCategory).toBeUndefined()
    expect(q.filters.departments).toBeUndefined()
  })

  it('compte chaque nouveau critère dans le badge « Tous les filtres »', async () => {
    const { countActiveFilters, emptyUnifiedFilters } = await import('./discover-filters')
    // Sinon le panneau replié annonce moins de critères qu'il n'en applique, et
    // l'utilisateur ne sait plus expliquer sa liste.
    expect(
      countActiveFilters({
        ...emptyUnifiedFilters(),
        region: ['76'],
        revenueMin: '50000000',
        companyCategory: ['ETI'],
        legalForm: '5710',
      }),
    ).toBe(4)
  })

  it('#2642.1 — plusieurs régions cochées ne comptent qu’UN critère, pas un par région', async () => {
    const { countActiveFilters, emptyUnifiedFilters } = await import('./discover-filters')
    expect(countActiveFilters({ ...emptyUnifiedFilters(), region: ['11', '76'] })).toBe(1)
  })
})
