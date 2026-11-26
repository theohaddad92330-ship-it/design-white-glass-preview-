import { checkCommercialBrief, commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'
import {
  COMMERCIAL_BRIEF_BY_COMPANY,
  COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY,
  DEMO_REAL_CONTACTS_COMPANIES,
  briefContactSeeds,
  briefPartners,
  briefRecentSignals,
  briefScoreFactors,
  normalizePersonName,
} from './commercial-brief-seed'
import { DEMO_COMMERCIAL_BRIEF_COVERAGE, DEMO_COMMERCIAL_BRIEF_SNCF_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * Briefs commerciaux (01/10/2026) — ce que le JEU DE DONNÉES de la salle porte
 * pour chacun des cinq comptes qui ont un classeur. Le semis qui écrit ces lignes
 * en base est tenu par `demo-seed.service.spec.ts` (« briefs commerciaux »).
 */

type SiteRow = { city?: string | null; is_headquarters?: boolean | null }

function dossierOf(company: string) {
  const dossier = DEMO_DOSSIERS.find(candidate => candidate.account.company_name === company)
  expect(dossier).toBeDefined()
  return dossier!
}

/**
 * Par compte : le siège attendu (le brief le dit), la ville du site qui le porte
 * sur la carte, un plancher de personnes semées, et si le brief cite des ESN.
 */
const ACCOUNTS: readonly {
  company: string
  hq: string
  hqSite: string
  minContacts: number
  withEsn: boolean
  withEmail?: boolean
}[] = [
  { company: 'ENGIE', hq: 'Paris La Défense', hqSite: 'Paris La Défense', minContacts: 400, withEsn: true },
  { company: 'TotalEnergies', hq: 'Courbevoie', hqSite: 'Courbevoie', minContacts: 100, withEsn: true },
  // Le brief Alstom ne cite AUCUNE ESN (`esn: []`) : une ligne partenaire serait inventée.
  { company: 'Alstom', hq: 'Saint-Ouen-sur-Seine', hqSite: 'Saint-Ouen-sur-Seine', minContacts: 25, withEsn: false },
  { company: 'Société Générale', hq: 'Puteaux', hqSite: 'Puteaux', minContacts: 1700, withEsn: true },
  { company: 'Groupe BPCE', hq: 'Paris', hqSite: 'Paris 13e', minContacts: 400, withEsn: true },
  // Démos clients du 06/10 (QuickSort) et du 07/10 (Meedz). Seuls BNP Paribas et Sanofi ont un onglet d'ESN dans leur
  // classeur : Bpifrance, ADEO et Kiabi n'en citent aucune (`esn: []`) — une ligne partenaire serait inventée.
  { company: 'BNP Paribas', hq: 'Paris', hqSite: 'Paris', minContacts: 300, withEsn: true },
  { company: 'Bpifrance', hq: 'Maisons-Alfort', hqSite: 'Maisons-Alfort', minContacts: 150, withEsn: false },
  { company: 'Sanofi', hq: 'Paris', hqSite: 'Paris', minContacts: 140, withEsn: true },
  { company: 'ADEO - Leroy Merlin', hq: 'Ronchin', hqSite: 'Ronchin', minContacts: 170, withEsn: false },
  { company: 'Kiabi', hq: 'Lezennes', hqSite: 'Lezennes', minContacts: 30, withEsn: false },
  // Démo ESN Nantes (05/10/2026) : aucune ESN citée par les deux briefs ; Chantiers de l'Atlantique est un compte VIERGE
  // (3 personnes nommées, aucune coordonnée au classeur : pas d'e-mail inventé).
  { company: 'Naval Group', hq: 'Paris', hqSite: 'Paris', minContacts: 20, withEsn: false },
  {
    company: "Chantiers de l'Atlantique",
    hq: 'Saint-Nazaire',
    hqSite: 'Saint-Nazaire',
    minContacts: 3,
    withEsn: false,
    withEmail: false,
  },
  // Démo Alpineo (08/10/2026) : ABB Suisse, périmètre suisse — 77 cibles dont aucune n'a d'e-mail au classeur (« Pas de
  // coordonnées personnelles inventées »), aucune ESN prouvée (les acteurs du marché suisse sont en section seulement).
  { company: 'ABB Suisse', hq: 'Zurich', hqSite: 'Zurich', minContacts: 77, withEsn: false, withEmail: false },
]

describe('briefs commerciaux — les comptes de la salle', () => {
  it('lit un corpus NON VIDE — sans lui, chaque garde ci-dessous passerait au vert sur du vide', () => {
    // 5 briefs du 01/10 (SG, BPCE, ENGIE, TotalEnergies, Alstom) + 2 de la démo ESN Nantes + 6 de la démo clients du 04/10 (dont ABB Suisse) ; SNCF n'en a pas.
    expect(Object.keys(COMMERCIAL_BRIEF_BY_COMPANY)).toHaveLength(13)
    expect(DEMO_DOSSIERS).toHaveLength(14)
  })

  for (const account of ACCOUNTS) {
    describe(account.company, () => {
      const dossier = dossierOf(account.company)
      const raw = dossier.account.raw_analysis as Record<string, unknown>
      const brief = COMMERCIAL_BRIEF_BY_COMPANY[account.company] as CommercialBrief

      it('est semé, avec le brief dans raw_analysis.commercial_brief — valide pour le schéma ET les contrôles métier', () => {
        const parsed = commercialBriefSchema.safeParse(raw['commercial_brief'])
        expect(parsed.success).toBe(true)
        if (!parsed.success) return
        expect(checkCommercialBrief(parsed.data)).toHaveLength(0)
        expect(parsed.data.account_name).toBe(brief.account_name)
      })

      it('porte le siège que dit le brief — colonne, blob et site de la carte', () => {
        expect(dossier.account.headquarters).toContain(account.hq)
        expect(raw['headquarters'] ?? dossier.account.headquarters).toContain(account.hq)
        const sites = (raw['sites_france'] ?? []) as SiteRow[]
        const headquarters = sites.filter(site => site.is_headquarters)
        // Un seul siège sur la carte, et c'est celui du brief — jamais « Strasbourg »
        // pour BPCE, jamais le boulevard Haussmann pour SG.
        expect(headquarters.map(site => site.city)).toEqual([account.hqSite])
      })

      it(`sème au moins ${account.minContacts} personnes, sans doublon de nom, coordonnées du classeur`, () => {
        expect(dossier.contacts.length).toBeGreaterThanOrEqual(account.minContacts)
        const names = dossier.contacts.map(contact => normalizePersonName(contact.full_name))
        expect(new Set(names).size).toBe(names.length)
        // Le brief porte ses coordonnées en clair (décision Louis 01/10/2026) :
        // au moins une personne semée en a — jamais une adresse inventée.
        const emails = new Set(brief.people.map(person => person.email?.toLowerCase()).filter(Boolean))
        const seededWithEmail = dossier.contacts.filter(
          contact => contact.email && emails.has(contact.email.toLowerCase()),
        )
        if (account.withEmail === false) {
          // compte vierge : le classeur ne porte AUCUNE adresse, aucune n'est semée
          expect(emails.size).toBe(0)
          expect(dossier.contacts.every(contact => !contact.email)).toBe(true)
        } else {
          expect(seededWithEmail.length).toBeGreaterThan(0)
        }
        expect(DEMO_REAL_CONTACTS_COMPANIES.has(account.company)).toBe(true)
      })

      it('aucune personne SORTIE du périmètre n’est semée comme contact du compte', () => {
        const seeded = new Set(dossier.contacts.map(contact => normalizePersonName(contact.full_name)))
        const exitedOnly = brief.people
          .filter(person => person.exited === true)
          .map(person => normalizePersonName(person.name))
          // …sauf si le même nom figure aussi, non sorti, ailleurs dans le brief.
          .filter(
            name => !brief.people.some(person => person.exited !== true && normalizePersonName(person.name) === name),
          )
        for (const name of exitedOnly) expect(seeded.has(name)).toBe(false)
      })

      it('met au moins un projet ou un poste ouvert du brief dans la Veille (recent_signals)', () => {
        const fromBrief = briefRecentSignals(brief)
        expect(fromBrief.length).toBeGreaterThan(0)
        const labels = new Set(dossier.account.recent_signals.map(signal => normalizePersonName(signal.signal ?? '')))
        expect(fromBrief.some(signal => labels.has(normalizePersonName(signal.signal ?? '')))).toBe(true)
        // Ce que lit l'écran : un libellé, un type, et jamais une date inventée.
        for (const signal of dossier.account.recent_signals) expect(signal.signal).toBeTruthy()
        expect(
          dossier.account.recent_signals.filter(signal => signal.source?.includes('Brief commercial')),
        ).not.toHaveLength(0)
        // La colonne que lit la Veille et la clé du blob restent les mêmes.
        expect(raw['recent_signals']).toEqual(dossier.account.recent_signals)
      })

      it(
        account.withEsn
          ? 'cite au moins une ESN présente, niveau de preuve conservé'
          : 'ne cite aucune ESN — rien n’est inventé',
        () => {
          const partners = briefPartners(brief)
          if (account.withEsn) {
            expect(partners.length).toBeGreaterThan(0)
            for (const partner of partners) {
              expect(partner.note).toContain('Niveau de preuve')
              expect(['forte', 'moyenne', 'faible']).toContain(partner.certainty)
            }
          } else {
            expect(brief.esn).toHaveLength(0)
            expect(partners).toEqual([])
          }
        },
      )
    })
  }

  describe('dédoublonnage et existant — Société Générale et Groupe BPCE', () => {
    it('SG : les personnes déjà semées sont gardées, une seule fois', () => {
      const names = dossierOf('Société Générale').contacts.map(contact => normalizePersonName(contact.full_name))
      expect(names).toContain('lorenzo bini smaghi')
      expect(names.filter(name => name === 'lorenzo bini smaghi')).toHaveLength(1)
    })

    it('BPCE : les contacts du relevé CSV sont gardés, les personnes du brief s’y ajoutent sans doublon', () => {
      const dossier = dossierOf('Groupe BPCE')
      const brief = COMMERCIAL_BRIEF_BY_COMPANY['Groupe BPCE'] as CommercialBrief
      const existing = new Set(
        dossier.contacts
          .filter(contact => contact.tags?.includes('Gouvernance'))
          .map(contact => normalizePersonName(contact.full_name)),
      )
      expect(existing.size).toBeGreaterThan(40)
      // Rejouer le brief sur le dossier fini ne ressème personne : tout y est déjà.
      const all = new Set(dossier.contacts.map(contact => normalizePersonName(contact.full_name)))
      expect(briefContactSeeds(brief, all)).toEqual([])
    })

    it('le siège semé ne contredit PAS le brief — SG : Puteaux (Haussmann = direction historique) ; BPCE : Tours Duo, Paris 13e', () => {
      const sg = dossierOf('Société Générale')
      expect(sg.account.headquarters).toContain('Puteaux')
      expect(sg.account.headquarters).not.toContain('Haussmann')
      const sgSites = (sg.account.raw_analysis['sites_france'] ?? []) as SiteRow[]
      expect(sgSites.find(site => site.city === 'Paris')?.is_headquarters).toBe(false)

      const bpce = dossierOf('Groupe BPCE')
      expect(bpce.account.headquarters).toContain('75013 Paris')
      const bpceSites = (bpce.account.raw_analysis['sites_france'] ?? []) as SiteRow[]
      expect(bpceSites.find(site => site.city === 'Strasbourg')?.is_headquarters).toBe(false)
      expect(bpceSites.filter(site => site.is_headquarters)).toHaveLength(1)
    })
  })

  // Louis 16/10/2026 — à rôle égal, une personne joignable (e-mail ou téléphone) passe avant celle sans coordonnée.
  // L'ordre change, jamais le contenu : rien n'est filtré.
  it('VINCI : à rôle égal, les contacts joignables d’abord, personne écarté', () => {
    const vinci = COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY['VINCI'] as CommercialBrief
    const seeds = briefContactSeeds(vinci, new Set())
    expect(seeds).toHaveLength(new Set(vinci.people.map(person => normalizePersonName(person.name))).size)
    const deciders = seeds.filter(seed => seed.decision_role === 'economic')
    const reachable = deciders.map(seed => Boolean(seed.email || seed.phone))
    expect(reachable.some(Boolean)).toBe(true)
    expect(reachable.lastIndexOf(true)).toBeLessThan(reachable.indexOf(false))
  })

  // Recette du 01/10/2026 (ENGIE) — « 196 mobiles » au brief, 0 « coordonnées trouvées » à l'écran
  // Contacts : le semis posait `lifecycle_state: 'detecte'` (l'état persisté bat le calcul, donc
  // l'entonnoir comptait 0 « enrichi ») et préférait le fixe au mobile pour `phone`.
  describe('mobiles du brief — le champ que la liste Contacts lit', () => {
    const engie = COMMERCIAL_BRIEF_BY_COMPANY['ENGIE'] as CommercialBrief
    const seeds = briefContactSeeds(engie, new Set())
    const digitsOf = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '')

    it('lit un corpus non vide : des personnes ENGIE portent un mobile', () => {
      expect(engie.people.filter(person => person.mobile && person.exited !== true).length).toBeGreaterThan(100)
    })

    it('chaque personne avec un mobile est semée avec ce mobile en `phone`', () => {
      const byName = new Map(seeds.map(seed => [normalizePersonName(seed.full_name), seed]))
      let checked = 0
      for (const person of engie.people) {
        if (!person.mobile || person.exited === true) continue
        const seed = byName.get(normalizePersonName(person.name))
        if (!seed) continue
        const firstMobile = digitsOf(person.mobile.split(/[\n;/]/)[0])
        expect(digitsOf(seed.phone).endsWith(firstMobile.slice(-9))).toBe(true)
        checked += 1
      }
      expect(checked).toBeGreaterThan(100)
    })

    it('une personne avec une coordonnée n’est jamais semée « detecte » (l’entonnoir compte « coordonnées trouvées »)', () => {
      const withCoordinate = seeds.filter(seed => seed.phone || seed.email)
      expect(withCoordinate.length).toBeGreaterThan(100)
      expect(withCoordinate.every(seed => seed.lifecycle_state !== 'detecte')).toBe(true)
      const contacts = dossierOf('ENGIE').contacts
      expect(contacts.filter(contact => contact.phone).length).toBeGreaterThan(100)
    })
  })

  describe('démo ESN Nantes — programmes (Naval Group, Chantiers de l’Atlantique) → Veille', () => {
    it.each(['Naval Group', "Chantiers de l'Atlantique"])(
      '%s : un programme garde son horizon, son segment et le besoin d’ingénierie du classeur',
      company => {
        const brief = COMMERCIAL_BRIEF_BY_COMPANY[company] as CommercialBrief
        const section = brief.sections.find(candidate => candidate.key === 'programmes')
        expect(section?.rows.length).toBeGreaterThan(0)
        const signals = briefRecentSignals(brief)
        expect(signals).toHaveLength(section?.rows.length ?? -1)
        const first = section?.rows[0] as Record<string, string>
        expect(signals[0]?.signal).toBe(first['programme'])
        expect(signals[0]?.impact).toContain(`Horizon : ${first['horizon']}.`)
        expect(signals[0]?.impact).toContain(first['segment'])
        expect(signals[0]?.sales_implication).toBe(first['besoin_d_ingenierie_sous_jacent'])
      },
    )

    it.each(['Naval Group', "Chantiers de l'Atlantique"])(
      '%s : sans onglet « besoins et tendances », les enjeux sont les besoins d’ingénierie des programmes',
      company => {
        const brief = COMMERCIAL_BRIEF_BY_COMPANY[company] as CommercialBrief
        expect(brief.sections.some(section => section.key === 'besoins-et-tendances')).toBe(false)
        const challenges = dossierOf(company).account.it_challenges
        const programmes = brief.sections.find(section => section.key === 'programmes')
        expect(challenges).toHaveLength(programmes?.rows.length ?? -1)
        expect(challenges.every(challenge => (challenge.description ?? '').includes('Besoin d’ingénierie'))).toBe(true)
      },
    )

    it('le site d’Indret est sur la carte, à côté du siège groupe (Paris)', () => {
      const sites = (dossierOf('Naval Group').account.raw_analysis['sites_france'] ?? []) as SiteRow[]
      expect(sites.map(site => [site.city, site.is_headquarters])).toEqual([
        ['Paris', true],
        ['La Montagne', false],
      ])
    })
  })

  describe('SNCF — aucun classeur, aucun brief', () => {
    it('raw_analysis.commercial_brief est absent : l’onglet « Ce que je sais » n’apparaît pas', () => {
      const sncf = dossierOf('SNCF')
      expect(sncf.account.raw_analysis['commercial_brief']).toBeUndefined()
      expect(COMMERCIAL_BRIEF_BY_COMPANY['SNCF']).toBeUndefined()
      expect(DEMO_REAL_CONTACTS_COMPANIES.has('SNCF')).toBe(false)
    })
  })

  describe('Veille des comptes des démos clients (04/10/2026) — chantiers et programmes lus dans leur classeur', () => {
    // BNP Paribas et Bpifrance : « Dynamique » (colonne CHANTIER) ; ADEO et Kiabi : « Projets » (CHANTIER) ; Sanofi :
    // « Projets 2026-2027 » (PROGRAMME) + 4 postes ouverts.
    it.each([
      ['BNP Paribas', 17],
      ['Bpifrance', 7],
      ['Sanofi', 52 + 4],
      ['ADEO - Leroy Merlin', 6],
      ['Kiabi', 5],
    ])('%s : %i signaux, un par ligne du classeur', (company, count) => {
      const signals = briefRecentSignals(COMMERCIAL_BRIEF_BY_COMPANY[company]!)
      expect(signals).toHaveLength(count)
      expect(signals.every(signal => signal.signal && signal.date === null)).toBe(true)
    })

    // Enjeux du compte (`it_challenges`) : Sanofi lit « IT SI DATA », les quatre autres leurs chantiers.
    it.each([
      ['BNP Paribas', 17],
      ['Bpifrance', 7],
      ['Sanofi', 19],
      ['ADEO - Leroy Merlin', 6],
      ['Kiabi', 5],
    ])('%s : %i enjeux lus dans le classeur (jamais un enjeu inventé)', (company, count) => {
      expect(dossierOf(company).account.it_challenges).toHaveLength(count)
      for (const challenge of dossierOf(company).account.it_challenges) expect(challenge.title).toBeTruthy()
    })

    it('un chantier de BNP Paribas porte son horizon et ce qui est public', () => {
      const plan = briefRecentSignals(COMMERCIAL_BRIEF_BY_COMPANY['BNP Paribas']!).find(s =>
        s.signal?.startsWith('Plan stratégique 2027-2030'),
      )
      expect(plan?.impact).toContain('Horizon : Présentation le 2 février 2027.')
      expect(plan?.impact).toContain("L'IA au cœur")
    })
  })

  describe('classification de couverture (demo-coverage.ts)', () => {
    it('raw_analysis.commercial_brief est classée SEEDÉE — et c’est vrai sur dix comptes', () => {
      expect(DEMO_COMMERCIAL_BRIEF_COVERAGE.state).toBe('seede')
      const carrying = DEMO_DOSSIERS.filter(dossier => dossier.account.raw_analysis['commercial_brief'] != null)
      expect(carrying.map(dossier => dossier.account.company_name).sort()).toEqual(
        [
          'ENGIE',
          'Alstom',
          'Groupe BPCE',
          'Société Générale',
          'TotalEnergies',
          'BNP Paribas',
          'Bpifrance',
          'Sanofi',
          'ADEO - Leroy Merlin',
          'Kiabi',
          'ABB Suisse',
          'Naval Group',
          "Chantiers de l'Atlantique",
        ].sort(),
      )
    })

    it('SNCF est classée vide à dessein, avec une raison vraie (aucun classeur)', () => {
      expect(DEMO_COMMERCIAL_BRIEF_SNCF_COVERAGE.state).toBe('vide_a_dessein')
      expect(DEMO_COMMERCIAL_BRIEF_SNCF_COVERAGE.reason).toContain('aucun classeur pour SNCF')
    })
  })

  describe('un score n’est jamais nu — les dossiers construits depuis leur brief', () => {
    it.each([
      'ENGIE',
      'TotalEnergies',
      'Alstom',
      'Naval Group',
      "Chantiers de l'Atlantique",
      'BNP Paribas',
      'Bpifrance',
      'Sanofi',
      'ADEO - Leroy Merlin',
      'Kiabi',
      'ABB Suisse',
    ])('%s porte ses quatre axes nommés', company => {
      const factors = (dossierOf(company).account.raw_analysis as { score_factors?: { label: string }[] }).score_factors
      expect(factors?.map(f => f.label.split(' — ')[0])).toEqual(['Fit', 'Timing', 'Accessibilité', 'Concurrence'])
    })

    it('un axe que le brief ne documente pas le DIT, il ne prend pas de chiffre (Alstom : aucune ESN citée)', () => {
      const concurrence = briefScoreFactors(COMMERCIAL_BRIEF_BY_COMPANY['Alstom']!).find(f =>
        f.label.startsWith('Concurrence'),
      )
      expect(concurrence?.label).toBe('Concurrence — aucun prestataire cité par le brief')
    })

    it('les axes comptent ce que le brief porte (ENGIE : 13 ESN)', () => {
      const labels = briefScoreFactors(COMMERCIAL_BRIEF_BY_COMPANY['ENGIE']!).map(f => f.label)
      expect(labels).toContain('Concurrence — 13 prestataires en place')
    })
  })

  // Démos clients (04/10/2026) : ABB Suisse, périmètre suisse (décision Louis D4).
  describe('ABB Suisse — périmètre suisse', () => {
    const dossier = dossierOf('ABB Suisse')
    const raw = dossier.account.raw_analysis as Record<string, unknown>

    it('pose les enjeux du compte depuis l’onglet DOMAINES (onze axes), tels que le classeur les écrit', () => {
      expect(dossier.account.it_challenges).toHaveLength(11)
      expect(dossier.account.it_challenges.every(challenge => challenge.title && challenge.description)).toBe(true)
    })

    it('situe les sites sur leur canton, siège compris, sans coordonnée devinée pour un lieu qui n’en est pas un', () => {
      const sites = (raw['sites_france'] ?? []) as SiteRow[]
      expect(sites.length).toBeGreaterThanOrEqual(10)
      expect(sites.find(site => site.is_headquarters)?.city).toBe('Zurich')
      expect(sites.map(site => site.city)).toEqual(expect.arrayContaining(['Turgi', 'Baden', 'Quartino']))
    })

    it('met les postes ouverts suisses du brief dans la Veille', () => {
      expect(dossier.account.recent_signals.some(signal => signal.type === 'recrutement')).toBe(true)
    })

    it('le pays du registre est la Suisse, jamais la France', () => {
      expect(dossier.account.registry_country).toBe('CH')
    })
  })
})
