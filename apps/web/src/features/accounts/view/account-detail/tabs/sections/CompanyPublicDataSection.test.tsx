import { SEGMENT_CAPABILITY_EPOCH, type AccountAnalysis } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompanyPublicDataSection } from './CompanyPublicDataSection'

// #1607.2 — la section lit désormais l'environnement technologique OBSERVÉ. Ces
// tests-ci portent sur les blocs PUBLICS : le corpus est neutralisé pour qu'ils
// mesurent exactement ce qu'ils mesuraient avant.
// #3916.b — la carte « Annonces légales » lit aussi la veille des registres.
vi.mock('@/features/accounts/hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))

// #2291.2 (lot R) — signaux collectés APRÈS l'epoch de capacité
// (SEGMENT_CAPABILITY_EPOCH.signals, segment-catchup.ts) : les assertions
// « rien collecté → rien affiché » ci-dessous portent sur les AUTRES blocs
// (present-only) ; sans cette date fraîche, le nouveau bloc « Modèle de
// contrat » se lirait « collecte antérieure » (non mesuré ≠ à jour) et
// romprait l'hypothèse « analyse vide » que ces deux tests vérifient — le
// modèle de contrat lui-même est couvert par sa propre section plus bas.
//
// ⚠️ #2284.17/.33/.26 (#2978, lot SRC2 28/09/2026) ont ajouté trois capacités
// `signals` plus RÉCENTES que #2291.2 : `SEGMENT_CAPABILITY_EPOCH.signals`
// (la PLUS RÉCENTE des capacités déclarées) est passée du 19/09 11:20 au
// 28/09 18:39. Cette date doit rester APRÈS la plus récente des deux.
// ⚠️ #3504 (01/10/2026) l'a encore avancée (11:31Z) : la date fraîche est donc
// DÉRIVÉE de l'epoch (+1 jour), jamais écrite en dur — une date en dur devient
// périmée à chaque nouvelle capacité `signals`.
const FRESH_SIGNALS_COLLECTED_AT = new Date(
  new Date(SEGMENT_CAPABILITY_EPOCH.signals as string).getTime() + 24 * 3_600_000,
).toISOString()

describe('CompanyPublicDataSection', () => {
  // Recette 13/10 (fiche EDF) — « On n'affiche pas ce qu'on n'a pas » : une colonne
  // « Effectif » sans aucune valeur sur les années ne s'affiche pas.
  it('hides the headcount column when no year carries a headcount', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          financials_history: [
            { year: 2025, revenue: 1, net_result: 2 },
            { year: 2024, revenue: 3, net_result: 4 },
          ],
        }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.queryByText('Effectif')).toBeNull()
    expect(screen.getByText('CA')).toBeTruthy()
  })

  it('keeps the headcount column when at least one year has a headcount', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          financials_history: [
            { year: 2025, revenue: 1, net_result: 2 },
            { year: 2024, revenue: 3, net_result: 4, headcount: 12 },
          ],
        }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.getByText('Effectif')).toBeTruthy()
  })

  it('renders nothing when no public data was collected', () => {
    const { container } = render(
      <CompanyPublicDataSection analysis={{}} signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('surfaces financials, tech stack, officers, tenders, jobs and github (present-only)', () => {
    const analysis: AccountAnalysis = {
      legal_form: 'SA',
      capital: 1500000,
      pappers_url: 'https://pappers.fr/entreprise/x',
      financials_history: [{ year: 2023, revenue: 1200000, net_result: 90000, headcount: 12 }],
      c_level: [{ first_name: 'Jean', last_name: 'Dupont', role: 'Président', is_c_level: true }],
      beneficial_owners: [{ name: 'Marie Martin', detention_part: 55, detention_vote: 55 }],
      detected_tech_stack: ['React', 'AWS'],
      github_signals: {
        org: 'acme',
        url: 'https://github.com/acme',
        public_repos: 40,
        top_languages: ['Go', 'TypeScript'],
      },
      public_tenders: [{ title: 'Refonte SI', buyer: 'Ville de X', url: 'https://boamp.example/x' }],
      awarded_contracts: [{ title: 'TMA', buyer: 'Région Y', winner: 'Capgemini', amount: 500000 }],
      it_job_signals: [{ title: 'Dev Java', company: 'Acme', contract_type: 'CDI', source: 'apec' }],
    }

    render(<CompanyPublicDataSection analysis={analysis} apolloEnrichment={{ technologies: ['Salesforce', 'aws'] }} />)

    // Card titles (FR default in tests).
    expect(screen.getByText('Données financières')).toBeInTheDocument()
    expect(screen.getByText('Stack technique')).toBeInTheDocument()
    expect(screen.getByText('Dirigeants & bénéficiaires')).toBeInTheDocument()
    expect(screen.getByText("Appels d'offres & marchés")).toBeInTheDocument()
    expect(screen.getByText("Offres d'emploi IT")).toBeInTheDocument()
    expect(screen.getByText('Signal ingénierie GitHub')).toBeInTheDocument()

    // Real values.
    expect(screen.getByText('SA')).toBeInTheDocument()
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    expect(screen.getByText('Marie Martin')).toBeInTheDocument()
    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
    // Winner + amount share one line ("Titulaire : Capgemini · 500 k€") → partial match.
    expect(screen.getByText(/Titulaire : Capgemini/)).toBeInTheDocument()
    expect(screen.getByText('Dev Java')).toBeInTheDocument()

    // Tech union deduped (Apollo 'aws' collapses into detected 'AWS').
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
    expect(screen.getByText('Salesforce')).toBeInTheDocument()
    expect(screen.queryByText('aws')).not.toBeInTheDocument()

    // Pappers link.
    expect(screen.getByRole('link', { name: 'Voir la fiche au registre' })).toHaveAttribute(
      'href',
      'https://pappers.fr/entreprise/x',
    )
  })

  it('#4805 — une carte sans donnée (financier, technologies, dirigeants) se NOMME au lieu de disparaître', () => {
    const analysis: AccountAnalysis = {
      github_signals: { org: 'acme', url: 'https://github.com/acme', public_repos: 40 },
    }
    render(<CompanyPublicDataSection analysis={analysis} />)
    expect(screen.getByTestId('public-data-financials-absence')).toHaveTextContent('Données financières')
    expect(screen.getByTestId('public-data-tech-absence')).toHaveTextContent('Stack technique')
    expect(screen.getByTestId('public-data-leadership-absence')).toHaveTextContent('Dirigeants & bénéficiaires')
  })

  it('#2322.70 — une offre que la source signale en tension le dit ; les autres ne portent rien', () => {
    const analysis: AccountAnalysis = {
      it_job_signals: [
        { title: 'Architecte cloud', source: 'France Travail', tension: true },
        { title: 'Dev Java', source: 'apec' },
      ],
    }

    render(<CompanyPublicDataSection analysis={analysis} signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT} />)

    // Une seule mention, sur la seule offre signalée — jamais une étiquette par défaut.
    expect(screen.getAllByText('Poste en tension')).toHaveLength(1)
    const tensionBadge = screen.getByText('Poste en tension')
    expect(tensionBadge.closest('div')?.textContent).toContain('Architecte cloud')
  })

  it('#2322.70 — la carte d’offre montre rôle, équipe, compétences et la RAISON de la tension ; un champ absent ne fait aucune ligne', () => {
    const analysis: AccountAnalysis = {
      it_job_signals: [
        {
          title: 'Data Engineer',
          source: 'apec',
          role: 'data_ia',
          team: 'plateforme data',
          skills: ['Python', 'Kafka'],
          tension: true,
          tension_reason: 'online_long',
          tension_days: 75,
        },
        { title: 'Dev Go', source: 'apec' },
      ],
    }

    render(<CompanyPublicDataSection analysis={analysis} signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT} />)

    expect(screen.getByText('Data / IA')).toBeInTheDocument()
    expect(screen.getByText('Équipe : plateforme data')).toBeInTheDocument()
    expect(screen.getByText('Python · Kafka')).toBeInTheDocument()
    expect(screen.getByText('Poste en tension').getAttribute('title')).toContain('75')
    // La seconde offre n'a rien de tout cela : aucune ligne, aucun « 0 », aucun libellé vide.
    expect(screen.getAllByTestId('job-role')).toHaveLength(1)
    expect(screen.getAllByTestId('job-team')).toHaveLength(1)
    expect(screen.getAllByTestId('job-skills')).toHaveLength(1)
  })

  it('#3499 mobile — une pastille de technologie ne force jamais la largeur du conteneur', () => {
    render(<CompanyPublicDataSection analysis={{ detected_tech_stack: ['Une technologie au nom interminable'] }} />)
    const pill = screen.getByText('Une technologie au nom interminable')
    expect(pill.className).toContain('max-w-full')
    expect(pill.parentElement?.className).toContain('min-w-0')
  })

  it('#3499 — la date d’une offre se lit formatée, jamais en ISO brut', () => {
    const analysis: AccountAnalysis = {
      it_job_signals: [
        { title: 'Dev Java', source: 'apec', contract_type: 'CDI', date: '2026-09-25T14:32:52.000+0000' },
        { title: 'Dev Go', source: 'apec', date: 'illisible' },
      ],
    }

    render(<CompanyPublicDataSection analysis={analysis} signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT} />)

    expect(screen.queryByText(/2026-09-25T/)).not.toBeInTheDocument()
    expect(screen.getByText(/CDI · 25 sept\.? 2026/)).toBeInTheDocument()
    // Une date illisible n'est PAS recopiée telle quelle.
    expect(screen.queryByText(/illisible/)).not.toBeInTheDocument()
  })

  it('#3097 — la séniorité (expérience affichée) et le salaire/TJM se lisent quand la source les affiche', () => {
    const analysis: AccountAnalysis = {
      it_job_signals: [
        {
          title: 'Ingénieur Senior Cloud',
          source: 'France Travail',
          experience: 'Expérience exigée de 6 An(s)',
          salary: 'Mensuel de 3500.00 Euros à 4200.00 Euros',
        },
        { title: 'Dev Java', source: 'apec' },
      ],
    }

    render(<CompanyPublicDataSection analysis={analysis} signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT} />)

    expect(screen.getByText(/Expérience exigée de 6 An\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/Mensuel de 3500.00 Euros à 4200.00 Euros/)).toBeInTheDocument()
  })

  // #recette-21-10-K1 — Thales : les comptes SOCIAUX de l'entité du SIREN (holding) ne se
  // lisent pas comme le CA du groupe.
  it('names the registry entity on the financials table and labels the group revenue as consolidated (recette 21/10 K1)', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          legal_name: 'THALES SA',
          financials_history: [{ year: 2024, revenue: 248.4e6, net_result: 1.3e9 }],
        }}
        groupRevenue="20600000000"
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.getByText('Comptes sociaux de THALES SA')).toBeInTheDocument()
    expect(screen.getByText('CA consolidé (groupe)')).toBeInTheDocument()
    expect(screen.getByText(/20,6\s*Md/)).toBeInTheDocument()
    // Résultat net > CA la même année → mention holding.
    expect(screen.getByText(/Société holding/)).toBeInTheDocument()
  })

  it('says nothing about a holding when the net result stays below revenue (recette 21/10 K1)', () => {
    render(
      <CompanyPublicDataSection
        analysis={{ legal_name: 'ACME SAS', financials_history: [{ year: 2024, revenue: 5e6, net_result: 1e5 }] }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.queryByText(/Société holding/)).toBeNull()
    expect(screen.queryByText('CA consolidé (groupe)')).toBeNull()
  })

  // #recette-21-10-K3 — fiche Veolia : deux villes, un intitulé = une ligne.
  it('folds same-title job postings into one line with their places (recette 21/10 K3)', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          it_job_signals: [
            { title: 'Senior Consultant Stratégie DATA / IA', location: 'Toulouse', url: 'https://x.fr/1' },
            { title: 'Senior consultant Stratégie Data et IA', location: 'Aix-en-Provence', url: 'https://x.fr/2' },
            { title: 'Architecte cloud', location: 'Paris', url: 'https://x.fr/3' },
          ],
        }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.getAllByText(/Senior consultant Strat/i)).toHaveLength(1)
    expect(screen.getByText(/2 offres \(Toulouse, Aix-en-Provence\)/)).toBeInTheDocument()
    expect(screen.getByText('Architecte cloud')).toBeInTheDocument()
  })

  it('hides the Pappers source badge from the financials card copy but keeps the proof link (Théo p16 §1)', () => {
    const analysis: AccountAnalysis = {
      legal_form: 'SA',
      capital: 1500000,
      pappers_url: 'https://pappers.fr/entreprise/x',
      financials_history: [{ year: 2023, revenue: 1200000, net_result: 90000, headcount: 12 }],
    }

    render(<CompanyPublicDataSection analysis={analysis} />)

    // The provider badge is no longer part of the client-facing card header…
    expect(screen.queryByText('Source : Pappers')).not.toBeInTheDocument()
    // …but the provenance survives as a proof link in the card footer.
    expect(screen.getByRole('link', { name: 'Voir la fiche au registre' })).toHaveAttribute(
      'href',
      'https://pappers.fr/entreprise/x',
    )
  })

  it('surfaces the SEC/EDGAR (US) financials block for a listed US company', () => {
    const analysis: AccountAnalysis = {
      us_sec_financials: {
        cik: '0001352010',
        filing_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010&type=10-K',
        detail_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001352010',
        revenues: [{ end: '2025-12-31', val: 5457056000, filed: '2026-02-26' }],
        net_income: [{ end: '2025-12-31', val: 377678000, filed: '2026-02-26' }],
        shares_outstanding: { end: '2026-04-30', val: 52244451, filed: '2026-02-26' },
        filings: [
          {
            form: '10-K',
            date: '2026-02-26',
            title: 'SEC 10-K du 2026-02-26',
            url: 'https://www.sec.gov/Archives/edgar/data/1352010/x.htm',
          },
        ],
      },
    }

    render(<CompanyPublicDataSection analysis={analysis} />)

    expect(screen.getByText('Financiers SEC (US)')).toBeInTheDocument()
    // Fiscal-period end + filing date rendered.
    expect(screen.getByText('2026-02-26')).toBeInTheDocument()
    expect(screen.getAllByText('2025-12-31').length).toBeGreaterThan(0)
    // Link to the 10-K filings on EDGAR.
    expect(screen.getByRole('link', { name: 'Voir les dépôts 10-K sur EDGAR' })).toHaveAttribute(
      'href',
      analysis.us_sec_financials?.filing_url,
    )
    // The filing document is linked by its real Archives URL.
    expect(screen.getByRole('link', { name: 'Voir le dépôt' })).toHaveAttribute(
      'href',
      'https://www.sec.gov/Archives/edgar/data/1352010/x.htm',
    )
  })

  it('names the SEC filer on the US financials card (recette 21/10 K1)', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          legal_name: 'ACME INC',
          us_sec_financials: {
            cik: '0001352010',
            filing_url: 'https://www.sec.gov/x',
            detail_url: 'https://www.sec.gov/y',
            revenues: [{ end: '2025-12-31', val: 5457056000, filed: '2026-02-26' }],
            net_income: [{ end: '2025-12-31', val: 377678000, filed: '2026-02-26' }],
            filings: [],
          },
        }}
      />,
    )
    expect(screen.getByText('Comptes publiés par ACME INC (SEC)')).toBeInTheDocument()
  })

  it('hides the SEC (US) block when no SEC financials were collected (FR / private company)', () => {
    const { container } = render(
      <CompanyPublicDataSection
        analysis={{ us_sec_financials: null }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Financiers SEC (US)')).not.toBeInTheDocument()
  })

  /**
   * La régression que ce lot ferme : `raw_analysis.technology_stack[]` était la
   * TROISIÈME source de la stack, et la carte n'en lisait aucune ligne. Un
   * compte dont l'analyse avait relevé la stack, mais dont la détection sur site
   * n'avait rien rendu, n'affichait AUCUNE carte technique.
   */
  it('opens the tech card on the analysis stack alone, with its usage and maturity', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          technology_stack: [
            { name: 'Cloud hybride', usage: 'Modernisation des infrastructures', maturity: 'production' },
          ],
        }}
      />,
    )
    expect(screen.getByText('Stack technique')).toBeInTheDocument()
    expect(screen.getByText('Cloud hybride')).toBeInTheDocument()
    // #3499 — le détail (usage, maturité) se lit derrière « Voir le détail ».
    expect(screen.queryByText(/Modernisation des infrastructures/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voir le détail' }))
    expect(screen.getByText(/Modernisation des infrastructures/)).toBeInTheDocument()
    expect(screen.getByText(/maturité : production/)).toBeInTheDocument()
  })

  /** #3499 — « pondération etc. on sait pas ce que ça veut dire » : un libellé humain, le chiffre en détail. */
  it('rend les technologies en pastilles avec un libellé humain, sans « Pondération » visible', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          technology_stack: [
            { name: 'Java', usage: 'Pondération 90 sur les profils en poste', maturity: null },
            { name: 'COBOL', usage: 'Pondération 10 sur les profils en poste', maturity: null },
          ],
        }}
      />,
    )
    const pills = screen.getByTestId('tech-pills')
    expect(pills.textContent).toContain('très présente')
    expect(pills.textContent).toContain('ponctuelle')
    expect(screen.queryByText(/Pondération/)).not.toBeInTheDocument()
  })

  /** #5 (recette 23/10, Arkéa) — « 1 janv. 1900 » est la date inconnue d'un registre : jamais affichée. */
  it('n’affiche pas une immatriculation sentinelle (1900-01-01)', () => {
    render(<CompanyPublicDataSection analysis={{ legal_form: 'SA', creation_date: '1900-01-01' }} />)
    expect(screen.queryByText('Immatriculation')).not.toBeInTheDocument()
    expect(screen.queryByText(/1900/)).not.toBeInTheDocument()
  })

  /** #3499 — « Immatriculation » ne montre pas la date ISO brute. */
  it('formate la date d’immatriculation, jamais « 1982-01-01 » brut', () => {
    render(<CompanyPublicDataSection analysis={{ legal_form: 'SA', creation_date: '1982-01-01' }} />)
    expect(screen.getByText('Immatriculation')).toBeInTheDocument()
    expect(screen.queryByText('1982-01-01')).not.toBeInTheDocument()
    expect(screen.getByText(/1982/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON — une date d’immatriculation illisible est omise, pas recopiée', () => {
    render(<CompanyPublicDataSection analysis={{ legal_form: 'SA', creation_date: 'n/a' }} />)
    expect(screen.queryByText('Immatriculation')).not.toBeInTheDocument()
    expect(screen.queryByText('n/a')).not.toBeInTheDocument()
  })

  /** #3499 — toute pastille de la stack est un Badge arrondi, y compris sans source ni maturité.
   *  Théo DS §2.3 (22/10/2026) : le Badge n'est plus une pilule mais un rectangle à rayon 6 px (`rounded-badge`). */
  it('rend chaque technologie en vraie pastille (rounded-badge, fond posé), jamais en texte nu', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          technology_stack: [
            { name: 'SQL', usage: 'Pondération 40 sur les profils en poste', maturity: null },
            { name: 'Java', usage: null, maturity: null },
          ],
          detected_tech_stack: ['React'],
        }}
      />,
    )
    const pills = screen.getByTestId('tech-pills').querySelectorAll('li > div')
    expect(pills.length).toBe(3)
    for (const pill of Array.from(pills)) {
      expect(pill.className).toContain('rounded-badge')
      expect(pill.className).toContain('bg-[var(--bellum-surface-2)]')
    }
  })

  /** Un nom nu reste une pastille : on n'invente ni usage ni maturité. */
  it('keeps a bare detected name as a chip, with no invented usage', () => {
    render(<CompanyPublicDataSection analysis={{ detected_tech_stack: ['React'] }} />)
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.queryByText(/maturité/)).not.toBeInTheDocument()
  })

  /**
   * recette 10/09 — mesuré sur BNP Paribas : sous une liste raisonnée de 8
   * technologies (chacune avec sa maturité et sa source), un déversement
   * alphabétique de dizaines de noms bruts (`.GIS`, `/DB`, `3M 360
   * Encompass…`, `ABB Distributed Control Systems`…) — le bruit non filtré du
   * technographe d'Apollo pour une grande entreprise. `detected_tech_stack`
   * (détection sur site) reste une liste curée d'une trentaine de signatures
   * MAX (`tech_detect.py`) : ce n'est jamais lui la source du déversement. Les
   * pastilles SANS usage ni maturité restent utiles en petit nombre (React,
   * AWS…) — le test voisin le vérifie déjà — mais pas en illimité.
   */
  it('borne les pastilles SANS usage/maturité — un technographe bruyant ne noie plus la carte', () => {
    const apolloNoise = Array.from({ length: 40 }, (_, i) => `Techno${i}`)
    render(<CompanyPublicDataSection analysis={{}} apolloEnrichment={{ technologies: apolloNoise }} />)

    const chips = apolloNoise.filter(name => screen.queryByText(name))
    expect(chips.length).toBeLessThanOrEqual(8)
  })
})

/**
 * #2291.2 (lot R, 19/09/2026) — L'OBSERVATION SURVIT à la recherche : la seule
 * carte de cette section qui n'est pas present-only (voir `hasContractModel`).
 * Trois états, jamais un silence : collecte antérieure à la capacité (rattrapage
 * ciblé, `SEGMENT_CAPABILITY_EPOCH.signals`), cherché mais non observé, observé.
 */
describe('CompanyPublicDataSection — contract model observed (#2291.2)', () => {
  // #2284.17/.33/.26 (#2978, lot SRC2 28/09/2026) ont fait avancer
  // SEGMENT_CAPABILITY_EPOCH.signals au 28/09 18:39:46Z (voir le commentaire
  // au sommet du fichier) — cette date doit rester APRÈS elle.
  const AFTER_EPOCH = FRESH_SIGNALS_COLLECTED_AT
  const BEFORE_EPOCH = '2026-09-10T00:00:00.000Z'

  it('#4 — dossier antérieur à la capacité : le dit, sans afficher « non observé »', () => {
    render(<CompanyPublicDataSection analysis={{}} signalsCollectedAt={BEFORE_EPOCH} />)
    expect(screen.getByText('Modèle de contrat observé')).toBeInTheDocument()
    expect(screen.getByText('Modèle de contrat : collecte antérieure à cette capacité.')).toBeInTheDocument()
    expect(screen.queryByText(/non observé sur ses offres/)).not.toBeInTheDocument()
  })

  it('#4 — une date de collecte jamais mesurée (null) est traitée comme antérieure, jamais présumée à jour', () => {
    render(<CompanyPublicDataSection analysis={{}} signalsCollectedAt={null} />)
    expect(screen.getByText('Modèle de contrat : collecte antérieure à cette capacité.')).toBeInTheDocument()
  })

  it('#3 — signaux à jour, cherché, rien d’attribuable : « non observé », jamais un silence', () => {
    render(<CompanyPublicDataSection analysis={{ contract_model: null }} signalsCollectedAt={AFTER_EPOCH} />)
    expect(
      screen.getByText("Modèle de contrat : non observé sur ses offres d'emploi ni ses avis de marchés publics."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/collecte antérieure/)).not.toBeInTheDocument()
  })

  it('#3 — observé : source, période et volume, avec la répartition par nature de contrat', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          contract_model: {
            observed_at: '2026-09-19',
            job_offers: {
              source: 'France Travail',
              total: 3,
              counts: { permanent: 2, fixed_term: 0, interim: 0, freelance: 1, other: 0 },
              since: '2026-08-01',
              until: '2026-09-15',
            },
            public_contracts: {
              source: 'BOAMP',
              total: 1,
              regie: 1,
              fixed_price: 0,
              since: '2026-08-10',
              until: '2026-08-10',
            },
          },
        }}
        signalsCollectedAt={AFTER_EPOCH}
      />,
    )
    expect(screen.getByText(/3 offres publiées/)).toBeInTheDocument()
    // #2291.2 D — « Profession libérale » s'affiche tel quel, jamais renommé « freelance ».
    expect(screen.getByText(/1 indépendant \(profession libérale\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 avis de marché passé/)).toBeInTheDocument()
    expect(screen.getByText(/1 dit régie ou assistance technique/)).toBeInTheDocument()
  })
})

// #4116 — les avis sans clôture (TED démo) montrent leur date de publication ;
// une date absente ne fait rien apparaître.
describe('CompanyPublicDataSection — date de publication des avis (#4116)', () => {
  it('affiche « Publié le … » quand published_date est connue, rien quand elle manque', () => {
    const analysis: AccountAnalysis = {
      public_tenders: [
        { title: 'Avis daté', buyer: 'EDF', published_date: '2026-05-01', deadline: null },
        { title: 'Avis sans date', buyer: 'Ville de X', published_date: null, deadline: null },
      ],
    }
    render(<CompanyPublicDataSection analysis={analysis} signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT} />)
    expect(screen.getByText(/EDF · Publié le 1 mai 2026/)).toBeInTheDocument()
    expect(screen.getByText('Ville de X')).toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
  })

  // #4396.1 (recette prod 23/10, fiche Guerbet) — « Offres d'emploi IT » : les offres hors du métier de l'ESN
  // sont rangées à part et nommées, jamais mêlées aux signaux ; sans profil, rien n'est deviné hors métier.
  it('#4396.1 — range les offres hors métier à part, nommées, et garde celles du métier', () => {
    render(
      <CompanyPublicDataSection
        analysis={{
          it_job_signals: [
            { title: 'Développeur Java confirmé', url: 'https://x/1' },
            { title: 'Auditeur interne', url: 'https://x/2' },
            { title: 'Acheteur projets', url: 'https://x/3' },
          ],
        }}
        hiringProfile={{ placedRoles: ['Développeur Java'], noGoSectors: [], recruitsForClients: false }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.getByText('Développeur Java confirmé')).toBeTruthy()
    expect(screen.getByText('Hors de ton métier (2)')).toBeTruthy()
    expect(screen.getByTestId('jobs-off-trade').textContent).toContain('Auditeur interne')
  })

  it('#4396.1 — SAIT DIRE NON : aucune offre hors métier, aucune ligne « hors de ton métier »', () => {
    render(
      <CompanyPublicDataSection
        analysis={{ it_job_signals: [{ title: 'Développeur Java confirmé', url: 'https://x/1' }] }}
        hiringProfile={{ placedRoles: ['Développeur Java'], noGoSectors: [], recruitsForClients: false }}
        signalsCollectedAt={FRESH_SIGNALS_COLLECTED_AT}
      />,
    )
    expect(screen.queryByTestId('jobs-off-trade')).toBeNull()
  })
})
