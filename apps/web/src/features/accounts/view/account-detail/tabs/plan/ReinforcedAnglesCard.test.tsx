import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ReinforcedAnglesCard } from './ReinforcedAnglesCard'

let observedStack: string[] | undefined = []
let observedDetail: { techno: string; persons: number }[] | undefined
let expertises: string[] = []

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({
    data:
      observedStack === undefined
        ? null
        : {
            paths_observed: 41,
            esn_observed: 2,
            observed_stack: observedStack,
            ...(observedDetail ? { observed_stack_detail: observedDetail } : {}),
          },
  }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: { expertise_areas: expertises } }),
}))

beforeEach(() => {
  observedStack = []
  observedDetail = undefined
  expertises = []
})

/**
 * #1611 — LA MÉMOIRE MARCHÉ NE PEUT JAMAIS PRODUIRE UN NO-GO PAR ABSENCE.
 *
 * C'est la correction que le retour apporte, et elle commande tout : cette carte
 * ne sait que RENFORCER. Une expertise absente de la liste ne dit rien du tout.
 */
describe('ReinforcedAnglesCard (#1611)', () => {
  it('nomme les expertises que l’environnement observé corrobore', async () => {
    observedStack = ['java', 'aws', 'kafka']
    expertises = ['Java', 'AWS']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-1" />)

    expect(await screen.findByText(/Angles renforcés/)).toBeInTheDocument()
    expect(screen.getByText('Java')).toBeInTheDocument()
    expect(screen.getByText('AWS')).toBeInTheDocument()
  })

  it('n’écarte JAMAIS une expertise non corroborée — pas de NO-GO par absence', async () => {
    observedStack = ['java']
    expertises = ['Java', 'PHP']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-2" />)

    expect(await screen.findByText('Java')).toBeInTheDocument()
    // PHP n'est ni nommé, ni écarté, ni commenté : l'absence dans un échantillon
    // ne prouve rien, donc l'écran n'en dit rien.
    expect(screen.queryByText('PHP')).not.toBeInTheDocument()
    expect(screen.queryByText(/ne fait pas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/absent/i)).not.toBeInTheDocument()
  })

  it('propose une action de VÉRIFICATION, jamais une action commerciale', async () => {
    observedStack = ['java']
    expertises = ['Java']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-3" />)

    expect(await screen.findByText(/À vérifier/)).toBeInTheDocument()
    // La corroboration est structurelle : elle ne prouve aucune intervention.
    expect(screen.getByText(/pas une preuve d’intervention actuelle/)).toBeInTheDocument()
  })

  it('ne conclut RIEN sans corroboration', async () => {
    observedStack = ['cobol']
    expertises = ['Java']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-4" />)

    expect(screen.queryByText(/Angles renforcés/)).not.toBeInTheDocument()
  })

  it('ne conclut RIEN sans profil déclaré — le cas de l’espace de démonstration', async () => {
    observedStack = ['java', 'aws']
    expertises = []
    renderWithRouter(<ReinforcedAnglesCard accountId="a-5" />)

    expect(screen.queryByText(/Angles renforcés/)).not.toBeInTheDocument()
  })

  it('ne conclut RIEN quand le corpus ne couvre pas le compte', async () => {
    observedStack = undefined
    expertises = ['Java']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-6" />)

    expect(screen.queryByText(/Angles renforcés/)).not.toBeInTheDocument()
  })

  it('borne à trois — au-delà ce n’est plus un angle, c’est le catalogue', async () => {
    observedStack = ['java', 'python', 'aws', 'kafka', 'react']
    expertises = ['Java', 'Python', 'AWS', 'Kafka', 'React']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-7" />)

    await screen.findByText('Java')
    expect(screen.queryByText('Kafka')).not.toBeInTheDocument()
    expect(screen.queryByText('React')).not.toBeInTheDocument()
  })
})

/**
 * #1611.3 — LE TROISIÈME ÉTAT, QUI N'AVAIT AUCUN INGRÉDIENT.
 *
 * La corroboration était BINAIRE : soit le renforcement plein, soit le silence.
 * La cause n'était pas ici — c'était la façade de l'API, qui appliquait
 * `.map(entry => entry.techno)` et JETAIT le comptage que `coverageFor` calcule.
 * Le champ `observed_stack_detail` le rend maintenant, et il est AJOUTÉ à côté :
 * `observed_stack` ne bouge pas, un onglet ancien le lit comme avant.
 *
 * ⚠️ Le seuil n'est pas inventé pour l'occasion : `MARKET_OBSERVATION_MIN_PERSONS`
 * est le PLANCHER d'existence d'une observation. Une expertise vue au plancher
 * exact est la corroboration la plus faible qui puisse exister — au-dessus, elle
 * renforce. Aucun nombre nouveau n'entre dans le produit.
 */
describe('ReinforcedAnglesCard — faible corroboration (#1611.3)', () => {
  it('DIT « peu de corroboration » quand tout est au plancher du corpus', async () => {
    observedStack = ['java', 'aws']
    observedDetail = [
      { techno: 'java', persons: 2 },
      { techno: 'aws', persons: 2 },
    ]
    expertises = ['Java', 'AWS']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-weak" />)

    expect(await screen.findByText(/Peu de corroboration/)).toBeInTheDocument()
    // Le renforcement plein ne s'affiche PAS : deux messages contradictoires sur
    // la même donnée valent moins que le silence d'avant.
    expect(screen.queryByText(/Angles renforcés/)).not.toBeInTheDocument()
  })

  it('ne conclut RIEN contre l’expertise — jamais un NO-GO déguisé', async () => {
    observedStack = ['java']
    observedDetail = [{ techno: 'java', persons: 2 }]
    expertises = ['Java', 'PHP']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-weak-2" />)

    expect(await screen.findByText(/Peu de corroboration/)).toBeInTheDocument()
    expect(screen.queryByText(/PHP/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ne fait pas|absent|écarté|ne propose pas/i)).not.toBeInTheDocument()
  })

  it('AU-DESSUS du plancher, c’est le renforcement plein — pas la phrase faible', async () => {
    observedStack = ['java']
    observedDetail = [{ techno: 'java', persons: 3 }]
    expertises = ['Java']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-strong" />)

    expect(await screen.findByText(/Angles renforcés/)).toBeInTheDocument()
    expect(screen.queryByText(/Peu de corroboration/)).not.toBeInTheDocument()
  })

  it('sans le champ NEUF, l’écran retombe sur le comportement d’avant', async () => {
    // La fenêtre « front neuf, API ancienne » : `observed_stack_detail` est
    // `undefined`. Le renforcement plein reste, la phrase faible ne s'invente pas.
    observedStack = ['java']
    observedDetail = undefined
    expertises = ['Java']
    renderWithRouter(<ReinforcedAnglesCard accountId="a-old-api" />)

    expect(await screen.findByText(/Angles renforcés/)).toBeInTheDocument()
    expect(screen.queryByText(/Peu de corroboration/)).not.toBeInTheDocument()
  })

  it('aucune corroboration du tout reste un SILENCE, pas une phrase faible', async () => {
    observedStack = ['php']
    observedDetail = [{ techno: 'php', persons: 2 }]
    expertises = ['Java']
    const { container } = renderWithRouter(<ReinforcedAnglesCard accountId="a-silent" />)

    expect(container.querySelector('[data-slot="card"]')).toBeNull()
    expect(screen.queryByText(/Peu de corroboration/)).not.toBeInTheDocument()
  })
})
