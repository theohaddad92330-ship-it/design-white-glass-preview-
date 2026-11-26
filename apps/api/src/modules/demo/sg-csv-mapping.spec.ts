import { SG_COMPTE_COMPLET_CSV } from './data/sg-compte-complet.generated'
import { parseCompteCsvRows, type CompteCsvRow } from './compte-csv-parser'
import {
  buildSgFamilyRoleSeats,
  mapSgAiApplications,
  mapSgDataReliabilityNotes,
  mapSgDecisionChainSteps,
  mapSgDetectedTechStack,
  mapSgEcosystemThirdParties,
  mapSgEntities,
  mapSgFinancialIndicators,
  mapSgGovernanceContacts,
  mapSgOpportunityDomains,
  mapSgOrgUnits,
  mapSgProgramNames,
  mapSgSitesFrance,
  mapSgStructuralReadingAxes,
  sgCsvBlocCounts,
} from './sg-csv-mapping'

const rows: CompteCsvRow[] = parseCompteCsvRows(SG_COMPTE_COMPLET_CSV)

describe('sgCsvBlocCounts', () => {
  it('lit les 17 blocs réels sans perdre de ligne — sait dire NON si un bloc disparaît', () => {
    const counts = sgCsvBlocCounts(rows)
    expect(Object.keys(counts)).toHaveLength(17)
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2289)
    expect(counts['06_CONTACTS_OPERATIONNELS']).toBe(1781)
  })
})

describe('mapSgEntities — bloc 09_ENTITES_ET_PERIMETRE', () => {
  const entities = mapSgEntities(rows)

  it('sème une ligne réelle du CSV (Treezor SAS, entité juridique actuelle)', () => {
    const treezor = entities.find(entity => entity.name === 'Treezor SAS')
    expect(treezor).toBeDefined()
    expect(treezor?.region).toBe('France')
    expect(treezor?.type).toBe('filiale')
    expect(treezor?.is_active).toBe(true)
    expect(treezor?.relevanceReason).toContain('Classé détenu en vue de la vente')
  })

  it('marque une correspondance historique comme inactive, sans lui inventer un type', () => {
    const historique = entities.find(
      entity => entity.name === 'SGEF — Financement d’équipement' || entity.name?.startsWith('SGEF'),
    )
    // au moins une ligne « Correspondance historique » est bien is_active: false
    const anyHistorical = entities.filter(entity => entity.is_active === false)
    expect(anyHistorical.length).toBeGreaterThan(0)
    expect(anyHistorical.every(entity => entity.type == null)).toBe(true)
    void historique
  })

  it('ne perd aucune des 55 lignes du bloc', () => {
    expect(entities).toHaveLength(55)
  })

  it('dédoublonne contre une entité déjà écrite à la main (comparaison exacte, insensible à la casse)', () => {
    const deduped = mapSgEntities(rows, new Set(['treezor sas']))
    expect(deduped.some(entity => entity.name === 'Treezor SAS')).toBe(false)
    expect(deduped).toHaveLength(54)
  })
})

describe('mapSgSitesFrance — bloc 10_IMPLANTATIONS, France uniquement', () => {
  const sites = mapSgSitesFrance(rows)

  it('sème une implantation française réelle (Nantes — SGSS)', () => {
    expect(sites.some(site => site.city === 'Nantes')).toBe(true)
  })

  it('exclut les implantations hors France — pas de champ d’accueil (SitesFranceCard)', () => {
    expect(sites.some(site => site.city === 'Montréal')).toBe(false)
    expect(sites.some(site => site.city === 'Bangalore')).toBe(false)
  })
})

describe('mapSgProgramNames — bloc 11_PROGRAMMES_TRANSFORMATION', () => {
  it('sème les 5 programmes réels, avec leur constat en description', () => {
    const programs = mapSgProgramNames(rows)
    expect(programs).toHaveLength(5)
    const aiForIt = programs.find(program => program.name === 'AI for IT — efficacité du développement et du support')
    expect(aiForIt?.description).toContain('Cas IA appliqués')
  })
})

describe('mapSgAiApplications — bloc 12_APPLICATIONS_IA', () => {
  it('sème les 15 applications IA réelles', () => {
    const apps = mapSgAiApplications(rows)
    expect(apps).toHaveLength(15)
    const sobot = apps.find(app => app.name === 'SOBOT')
    expect(sobot?.usage).toBe('Assistance aux clients du réseau SG.')
  })
})

describe('mapSgDetectedTechStack — ligne SG-2190', () => {
  it('sème la stack observée réelle, sans doublon avec l’existant', () => {
    const stack = mapSgDetectedTechStack(rows)
    expect(stack).toContain('Kubernetes')
    expect(stack).toContain('Java 17 / Spring Boot 3')
    expect(stack.length).toBeGreaterThanOrEqual(10)
  })
})

describe('mapSgOrgUnits — blocs 02_STRUCTURE_GROUPE + 03_ORGANIGRAMME_SI', () => {
  it('sème une unité réelle de chaque bloc, jamais d’occupant inventé', () => {
    const units = mapSgOrgUnits(rows)
    expect(units).toHaveLength(31 + 87)
    const codeOrga = units.find(unit => unit.entity === 'ITIM/CSR/MRI/LIL')
    expect(codeOrga?.level).toBe("Code d'organisation SI")
    expect(codeOrga?.contacts).toEqual([])
    const subUnit = units.find(unit => unit.entity === 'Office data Groupe')
    expect(subUnit?.level).toBe('Sous-unité')
  })
})

describe('mapSgDecisionChainSteps — bloc 05_CHAINE_ACHATS', () => {
  it('sème les 27 étapes réelles du circuit d’achat', () => {
    const steps = mapSgDecisionChainSteps(rows)
    expect(steps).toHaveLength(27)
    expect(steps.some(step => step.step === 'Plateforme de consultation fournisseurs')).toBe(true)
  })
})

describe('mapSgGovernanceContacts — bloc 04_GOUVERNANCE_ET_ROLES, annonce publique citée', () => {
  it('nomme une personne réelle sourcée par une page de gouvernance publique', () => {
    const contacts = mapSgGovernanceContacts(rows, new Set())
    const kohler = contacts.find(contact => contact.full_name === 'Alexis Kohler')
    expect(kohler).toBeDefined()
    expect(kohler?.decision_role).toBe('champion')
    expect(kohler?.priority).toBe(3)
    expect(kohler?.profile_summary).toContain('governance/executive-committee')
  })

  it('dédoublonne contre les contacts déjà écrits à la main (Pierre Palmieri)', () => {
    const contacts = mapSgGovernanceContacts(rows, new Set(['pierre palmieri']))
    expect(contacts.some(contact => contact.full_name === 'Pierre Palmieri')).toBe(false)
  })

  it('ne sème jamais de coordonnée — aucun champ email/linkedin_url sur ce type', () => {
    const contacts = mapSgGovernanceContacts(rows, new Set())
    for (const contact of contacts) {
      expect(contact).not.toHaveProperty('email')
      expect(contact).not.toHaveProperty('linkedin_url')
    }
  })
})

describe('buildSgFamilyRoleSeats — ligne SG-2192, familles réelles agrégées, aucun nom', () => {
  it('sème un siège par famille connue, avec le compte RÉEL cité', () => {
    const seats = buildSgFamilyRoleSeats(rows)
    const dev = seats.find(seat => seat.family === 'Dev')
    expect(dev).toBeDefined()
    expect(dev?.why_contact).toContain('36 profil')
    expect(seats.every(seat => !('full_name' in seat))).toBe(true)
  })

  it('sait dire NON — une famille sans bucket connu (« Autre / à qualifier ») n’a pas de siège', () => {
    const seats = buildSgFamilyRoleSeats(rows)
    expect(seats.some(seat => seat.title.includes('Autre'))).toBe(false)
  })
})

describe('mapSgStructuralReadingAxes — bloc 01_LECTURE_STRUCTURELLE (FINIR-V2-27-09)', () => {
  it('sème les 14 axes de lecture réels, avec leur constat/interprétation/implication/fiabilité', () => {
    const axes = mapSgStructuralReadingAxes(rows)
    expect(axes).toHaveLength(14)
    const codeAxis = axes.find(axis => axis.label === 'Un organigramme SI codifié à quatre niveaux')
    expect(codeAxis?.constat).toContain('Quatre-vingt-sept codes distincts')
    expect(codeAxis?.interpretation).toContain('équipe réelle')
    expect(codeAxis?.implication).toContain('budget')
    expect(codeAxis?.reliability).toBe('Confirmé')
  })

  it('ne porte jamais de chiffre — amount/currency/period restent null sur ce bloc', () => {
    const axes = mapSgStructuralReadingAxes(rows)
    expect(axes.every(axis => axis.amount === null && axis.currency === null && axis.period === null)).toBe(true)
  })
})

describe('mapSgEcosystemThirdParties — bloc 14_ECOSYSTEME (FINIR-V2-27-09)', () => {
  it('sème les 15 acteurs tiers réels, jamais un accès de sous-traitance affirmé', () => {
    const parties = mapSgEcosystemThirdParties(rows)
    expect(parties).toHaveLength(15)
    const anthropic = parties.find(party => party.label === 'Anthropic')
    expect(anthropic?.constat).toContain('Partenaire stratégique IA')
    expect(anthropic?.implication).toContain('Ne vaut ni accès à un panel ni preuve de sous-traitance')
    expect(anthropic?.reliability).toBe('Confirmé')
  })
})

describe('mapSgOpportunityDomains — bloc 15_DOMAINES_OPPORTUNITE (FINIR-V2-27-09)', () => {
  it('sème les 14 domaines réels, sans reprendre le score ni les personas du CSV', () => {
    const domains = mapSgOpportunityDomains(rows)
    expect(domains).toHaveLength(14)
    const cyber = domains.find(domain => domain.label === 'Cybersécurité, IAM, GRC & sécurité')
    expect(cyber?.constat).toContain('Demande évaluée à 98 sur 100')
    expect(cyber?.implication).toContain('RSSI/CISO')
    expect(cyber?.reliability).toBe('Analytique — à revalider terrain')
    expect(cyber).not.toHaveProperty('score')
    expect(cyber).not.toHaveProperty('personas')
  })
})

describe('mapSgDataReliabilityNotes — bloc 17_GARDE_FOUS (FINIR-V2-27-09)', () => {
  it('sème les 20 mises en garde réelles sur la fiabilité des données', () => {
    const notes = mapSgDataReliabilityNotes(rows)
    expect(notes).toHaveLength(20)
    const guardrail = notes.find(note => note.label === 'Programme de réduction des dépenses externes')
    expect(guardrail?.constat).toContain('réduction du recours aux consultants')
    expect(guardrail?.implication).toContain('Ne pas affirmer au-delà en rendez-vous')
    expect(guardrail?.reliability).toBe('Garde-fou')
  })
})

describe('mapSgFinancialIndicators — bloc 16_INDICATEURS (FINIR-V2-27-09)', () => {
  const indicators = mapSgFinancialIndicators(rows)

  it('sème les 48 indicateurs réels, chiffre daté compris', () => {
    expect(indicators).toHaveLength(48)
    const pnbGroupe = indicators.find(indicator => indicator.label === 'Produit net bancaire Groupe — H1 2026')
    expect(pnbGroupe?.amount).toBe(14202)
    expect(pnbGroupe?.currency).toBe('EUR')
    expect(pnbGroupe?.period).toBe('H1 2026')
    expect(pnbGroupe?.reliability).toBe('Confirmé — non additionnable')
  })

  it('sait dire NON — un repère sans chiffre publié (« Clients BoursoBank ») garde amount à null, jamais 0', () => {
    const clients = indicators.find(indicator => indicator.label === 'Clients BoursoBank')
    expect(clients).toBeDefined()
    expect(clients?.amount).toBeNull()
    expect(clients?.constat).toContain('ne représente pas une enveloppe disponible pour une ESN')
  })
})
