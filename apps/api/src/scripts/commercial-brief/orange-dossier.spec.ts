import { checkCommercialBrief, commercialBriefSchema } from '@bellum/contracts'

import { convertOrangeDossier, parseSemicolonCsv, publicLabel, type OrangeAccountJson } from './orange-dossier'

/**
 * Convertisseur du dossier de compte Orange (12/10/2026) : ce que le pack du CEO devient en `CommercialBrief`.
 * Entrées MINIMALES écrites ici — le pack lui-même est hors dépôt ; le JSON versionné est tenu par
 * `modules/demo/data/commercial-briefs/orange-brief.spec.ts`.
 */

const HEADER =
  'rang_exploitabilite;nom;fonction;famille_fonction;entite;ville;metropole;emails_domaine_orange;autres_emails;mobile;linkedin;en_poste_export_2024;esn_actuelle;decideur_identifie;origine;score'

const CONTACTS = [
  HEADER,
  '1;Jean Dupont;Responsable SI;Autre;Orange;Paris;Paris & Île-de-France;jean.dupont@orange.com;jdupont@gmail.com | j.dupont@capgemini.com;+33612345678;https:/www.linkedin.com/in/jdupont;Oui;;Oui;Contact nommé;12',
  '2;Marie Martin;Développeuse;Développement;Orange Business;Rennes;Rennes;;marie@hotmail.fr;;;Oui;Apside;Non;Consultant observé;5',
  '3;Paul Ancien;Architecte;Cloud / Infra;Orange;;;paul.ancien@orange-business.com;;mauvais;https://www.linkedin.com/in/paul;Non;;Non;Consultant observé;1',
].join('\n')

const SOURCES = [
  'source;url;date_consultation;utilise_pour;fiabilite',
  'Résultats S1 2026 Orange (28/07/2026);https://example.org/resultats.pdf;2026-10-12;CA;fort (lu par extraction automatique)',
  'Étude de cas Ivalua x Orange;https://example.org/ivalua;2026-10-12;Ivalua;moyen',
  'Light Reading - plan;https://example.org/lr;2026-10-12;CA 2025;moyen',
  'BELLUM MARKET MEMORY v2.1b;base interne, compte BM-A-001109;2026-10-12;Entités, faits ORION/DataForge;issu des fichiers',
].join('\n')

const ACCOUNT: OrangeAccountJson = {
  meta: { account: 'Orange', as_of: '2026-10-12', siren: '380129866' },
  kpis: {
    comptes_rattaches: 9,
    comptes_orange_non_rattaches: 27,
    consultants_observes_groupe: 450,
    consultants_observes_avec_non_rattaches: 476,
    consultants_en_poste_export_2024: 173,
    esn_vues_en_poste: 59,
    esn_anciennes: 20,
    esn_rang2_ouvert: 43,
    esn_referencement_confirme: 0,
    besoins_en_base: 3,
  },
  marche: {
    ca_2025_md_eur: 40.4,
    ebitdaal_2025_md_eur: 12.4,
    ca_s1_2026_md_eur: 20.9,
    ebitdaal_s1_2026_md_eur: 6.1,
    objectif_2026: 'EBITDAaL > +4 %',
    orange_business_ca_s1_2026_m_eur: 3503,
    orange_business_evolution_pct: -3.1,
    cyberdefense_ca_evolution_pct: 10.6,
    cyberdefense_commandes_evolution_pct: 15,
    dette_nette_s1_2026_md_eur: 35.7,
  },
  legal: {
    denomination: 'Orange (SA)',
    siren: '380129866',
    secteur: 'Télécommunications',
    taille: 'CAC 40 ; 10 001+',
    effectif_public: '~127 000 salariés (source éditeur)',
    siege: { base: 'Paris', hypothese: 'Issy-les-Moulineaux', statut: 'à vérifier' },
    forme_capital_naf_bilans: 'non trouvé',
    dirigeants_publics: ['Christel Heydemann (DG)'],
  },
  structure: [
    { entite: 'Orange', role: 'Maison mère', confiance: 'probable' },
    { entite: 'Orange Business', role: 'Filiale ESN/intégrateur', confiance: 'confirmé' },
  ],
  sites: {
    villes_consultants: [
      { metropole: 'Paris & Île-de-France', consultants: 241, en_poste_2024: 88, avec_email: 228 },
      { metropole: '(non renseignée)', consultants: 39, en_poste_2024: 14, avec_email: 32 },
      { metropole: 'Rennes', consultants: 31, en_poste_2024: 17, avec_email: 29 },
    ],
    note: 'Ville du consultant, pas site Orange confirmé',
    sites_confirmes: ['Datacenters Chevilly-Larue, Aubervilliers (fort)'],
    sites_indice_faible: ['Lannion', 'Cesson-Sévigné (titres d’articles non lus)'],
  },
  esn_sur_place: [
    { esn: 'Capgemini', consultants: 8, confiance: 'probable' },
    { esn: 'Ausy', consultants: 1, confiance: 'indice faible' },
  ],
  achats: {
    plateformes: [
      { outil: 'Ivalua', detail: 'Plateforme achats', url: 'https://example.org/ivalua', confiance: 'moyen' },
      {
        outil: 'OFusion Supplier portal',
        detail: 'Portail fournisseurs',
        url: 'https://example.org/of',
        confiance: 'fort (officiel)',
      },
    ],
    base_accessibilite: 'Verrouillé-structuré (ORION 27/08/2026)',
    non_trouve: ['panel ESN', 'grille tarifaire'],
    corrections_base: ['« tous modules S2P » inexact'],
  },
  besoins: [
    {
      titre: 'Data Engineer',
      date: '2026-08-10',
      statut: 'Présentation en cours',
      tjm_annonce_eur: 900,
      contact: null,
      origine: 'CRM',
    },
    { titre: 'Mobile #1', date: null, statut: 'Mission terminée', contact: 'Audrey Prevost', origine: 'Master' },
  ],
  projets: [
    {
      date: '2026-S2',
      projet: 'Signature du rachat d’une part de SFR',
      detail: 'Examen en cours',
      source: 'Résultats S1 2026',
      url: 'https://example.org/resultats.pdf',
      confiance: 'fort',
    },
    {
      date: '2026-fin',
      projet: 'Coentreprise datacenters souverains avec Morrison',
      detail: '400 MW',
      source: 'Résultats S1 2026',
      url: 'https://example.org/resultats.pdf',
      confiance: 'fort',
    },
    {
      date: '2026-07-01',
      projet: 'Orange Business x Tech Mahindra',
      detail: 'Partenariat effectif',
      source: 'Résultats S1 2026',
      url: 'https://example.org/resultats.pdf',
      confiance: 'fort',
    },
    {
      date: '2026-02-19',
      projet: 'Plan Trust the Future (horizon 2028)',
      detail: 'Cloud de confiance',
      source: 'Light Reading',
      url: 'https://example.org/lr',
      confiance: 'moyen',
    },
  ],
  decideurs: [
    { nom: 'Florent Bazin', fonction: 'CIO (cité par Ivalua)' },
    {
      nom: 'Jean Dupont',
      fonction: 'Responsable SI',
      entite: 'Orange',
      emails: ['jean.dupont@orange.com', 'jdupont@gmail.com'],
      mobile: '+33612345678',
    },
  ],
  limites: [
    'Organigramme officiel non trouvé : arbre reconstitué à partir des profils',
    'Aucun signal ni appel d’offres Orange en base ; roadmap DSI et budgets IT non trouvés',
    'Export consultants de 2024 : "en poste" à revalider',
    'PDF résultats S1 lu par extraction automatique',
    'Contacts : base légale RGPD à valider avant exposition client',
  ],
}

const convert = (overrides: Partial<{ account: OrangeAccountJson; contactsCsv: string; sourcesCsv: string }> = {}) =>
  convertOrangeDossier({ account: ACCOUNT, contactsCsv: CONTACTS, sourcesCsv: SOURCES, ...overrides })

describe('parseSemicolonCsv', () => {
  it('lit le BOM, les guillemets doubles et les points-virgules dans un champ guillemeté', () => {
    const rows = parseSemicolonCsv('\uFEFFa;b\n"x;y";"il dit ""oui"""\n\n')
    expect(rows).toEqual([{ a: 'x;y', b: 'il dit "oui"' }])
  })
})

describe('convertOrangeDossier — le brief est valide', () => {
  const { brief } = convert()

  it('passe le schéma du contrat ET les contrôles métier', () => {
    const parsed = commercialBriefSchema.safeParse(brief)
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([])
    expect(checkCommercialBrief(brief)).toEqual([])
  })

  it('le siège n’est pas affirmé : libellé « non confirmé », aucun site siège', () => {
    expect(brief.headquarters).toEqual({ label: 'Siège non confirmé', city: 'Paris' })
    expect(brief.sites.filter(site => site.kind === 'headquarters')).toEqual([])
  })

  it('« non trouvé » reste « non trouvé » (jamais 0, jamais deviné)', () => {
    const fiche = brief.sections.find(section => section.key === 'fiche-compte')
    expect(fiche?.rows).toContainEqual(
      expect.objectContaining({
        champ: 'Forme juridique, capital, NAF, bilans',
        valeur: 'non trouvé',
        fiabilite: 'non trouvé',
      }),
    )
    const needs = brief.sections.find(section => section.key === 'besoins-en-base')
    expect(needs?.rows[1]).toMatchObject({ date: 'non trouvé', tjm_annonce: 'non trouvé', contact: 'Audrey Prevost' })
  })

  it('« Aucun confirmé » plutôt que 0 pour le référencement ESN', () => {
    expect(brief.kpis.find(kpi => kpi.label === 'RÉFÉRENCEMENT ESN')?.value).toBe('Aucun confirmé')
    expect(brief.kpis.length).toBeLessThanOrEqual(6)
  })

  it('chaque chiffre de marché porte sa source, son lien et sa date de consultation', () => {
    const market = brief.sections.find(section => section.key === 'marche')
    expect(market?.rows.length).toBe(10)
    for (const row of market?.rows ?? []) {
      expect(row['source']).toEqual(expect.any(String))
      expect(String(row['url'])).toMatch(/^https:/)
      expect(row['consulte_le']).toBe('2026-10-12')
    }
    expect(market?.rows[0]).toMatchObject({ indicateur: 'Chiffre d’affaires 2025', source: 'Light Reading - plan' })
  })
})

describe('convertOrangeDossier — les personnes', () => {
  const { brief, skipped, anomalies } = convert()
  const person = (name: string) => brief.people.find(p => p.name === name)

  it('seule l’adresse du groupe Orange est reprise ; les autres sont comptées, jamais semées', () => {
    expect(person('Jean Dupont')?.email).toBe('jean.dupont@orange.com')
    expect(person('Marie Martin')?.email).toBeUndefined()
    expect(JSON.stringify(brief)).not.toMatch(/gmail|hotmail|capgemini\.com/)
    expect(skipped['adresse personnelle (webmail) : non reprise']).toBe(2)
    expect(skipped['adresse d’un employeur tiers ou d’un domaine personnel : non reprise']).toBe(1)
  })

  it('le mobile illisible est écarté, le lien LinkedIn réparé', () => {
    expect(person('Jean Dupont')?.mobile).toBe('+33612345678')
    expect(person('Paul Ancien')?.mobile).toBeUndefined()
    expect(skipped['mobile : valeur qui n’est pas un numéro']).toBe(1)
    expect(person('Jean Dupont')?.linkedin).toBe('https://www.linkedin.com/in/jdupont')
  })

  it('le rôle suit le décideur identifié, l’export 2024 et l’ESN actuelle', () => {
    expect(person('Jean Dupont')?.role).toBe('decision_maker')
    expect(person('Marie Martin')?.role).toBe('external')
    expect(person('Paul Ancien')?.role).toBe('alumni')
  })

  it('un décideur cité hors CSV est ajouté SANS coordonnée, et l’écart est signalé', () => {
    const bazin = person('Florent Bazin')
    expect(bazin).toMatchObject({ role: 'decision_maker', function: 'CIO (cité par Ivalua)' })
    expect(bazin?.email).toBeUndefined()
    expect(bazin?.mobile).toBeUndefined()
    expect(anomalies.join(' ')).toMatch(/Florent Bazin/)
  })

  it('les décideurs remontent en tête', () => {
    expect(brief.people.slice(0, 2).map(p => p.role)).toEqual(['decision_maker', 'decision_maker'])
    expect(brief.people.map(p => p.name)).toEqual(['Jean Dupont', 'Florent Bazin', 'Marie Martin', 'Paul Ancien'])
  })

  it('« en poste » dit que c’est l’export 2024', () => {
    expect(person('Jean Dupont')?.hook).toContain('export 2024')
    expect(person('Paul Ancien')?.hook).toContain('Non listé en poste dans l’export 2024')
  })

  it('une adresse Orange hors du domaine attendu dans la colonne Orange fait ÉCHOUER la conversion', () => {
    const bad = CONTACTS.replace('jean.dupont@orange.com', 'jean.dupont@gmail.com')
    expect(() => convert({ contactsCsv: bad })).toThrow(/n'est pas une adresse du groupe Orange/)
  })
})

describe('convertOrangeDossier — niveaux de confiance et sources', () => {
  it('ESN : probable → observée, indice faible → indice ; jamais « confirmée »', () => {
    const { brief } = convert()
    expect(brief.esn.map(esn => [esn.name, esn.evidence_level, esn.reliability])).toEqual([
      ['Capgemini', 'observed', 'probable'],
      ['Ausy', 'hint', 'indice faible'],
    ])
    expect(brief.esn[0]?.proof).toContain('aucun référencement confirmé')
  })

  it('une confiance ESN inconnue fait échouer la conversion', () => {
    const account = { ...ACCOUNT, esn_sur_place: [{ esn: 'X', consultants: 1, confiance: 'certain' }] }
    expect(() => convert({ account })).toThrow(/confiance inconnue/)
  })

  it('entités : confiance recopiée telle quelle', () => {
    const { brief } = convert()
    expect(brief.entities.map(entity => [entity.name, entity.reliability])).toEqual([
      ['Orange', 'probable'],
      ['Orange Business', 'confirmé'],
    ])
  })

  it('aucun nom de source interne ne se lit à l’écran', () => {
    const { brief } = convert()
    expect(JSON.stringify(brief)).not.toMatch(/market\s*memory|orion|dataforge/i)
    expect(publicLabel('Verrouillé-structuré (ORION 27/08/2026)')).toBe('Verrouillé-structuré (relevé du 27/08/2026)')
    const achats = brief.sections.find(section => section.key === 'achats-avant-d-appeler')
    expect(achats?.rows).toContainEqual(expect.objectContaining({ nom: 'Verrouillé-structuré (relevé du 27/08/2026)' }))
  })

  it('sait dire NON : un nom interne résiduel fait échouer la conversion', () => {
    const account = { ...ACCOUNT, legal: { ...ACCOUNT.legal, secteur: 'Télécoms (via DataForge)' } }
    expect(() => convert({ account })).toThrow(/nom interne/)
  })

  it('la note interne « base légale RGPD » n’est pas un garde-fou : écartée et comptée', () => {
    const { brief, skipped } = convert()
    expect(JSON.stringify(brief)).not.toMatch(/RGPD|base légale/i)
    expect(brief.guardrails).toHaveLength(7)
    expect(skipped['limite « base légale des contacts » : note interne de l’équipe, pas un garde-fou commercial']).toBe(
      1,
    )
  })

  it('une limite inconnue fait échouer la conversion (rien n’est recopié au mieux)', () => {
    const account = { ...ACCOUNT, limites: [...ACCOUNT.limites.slice(0, 4), 'Autre chose'] }
    expect(() => convert({ account })).toThrow(/forme inconnue/)
  })

  it('projets : horizon et confiance recopiés, aucune « offre à monter » inventée', () => {
    const { brief } = convert()
    const projets = brief.sections.find(section => section.key === 'projets-2026-2027')
    expect(projets?.columns.map(c => c.key)).not.toContain('offre_a_monter')
    expect(projets?.rows[0]).toMatchObject({ horizon: '2026-S2' })
    expect(String(projets?.rows[0]?.['ce_qui_est_public'])).toContain('Confiance : fort')
  })

  it('sites : datacenters confirmés (fort) et sites en indice faible, hors siège', () => {
    const { brief } = convert()
    expect(brief.sites.map(site => [site.city, site.kind, site.reliability])).toEqual([
      ['Chevilly-Larue', 'industrial', 'fort'],
      ['Aubervilliers', 'industrial', 'fort'],
      ['Lannion', 'other', 'indice faible'],
      ['Cesson-Sévigné', 'other', 'indice faible'],
    ])
  })
})
