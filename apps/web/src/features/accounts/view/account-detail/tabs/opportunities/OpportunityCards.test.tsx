import type { Contact } from '@bellum/contracts'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { OpportunityCard, TeamNeedCard } from './opportunity-cards'
import { RecruitmentSection, TeamNeedsSection, VisionSection } from './OpportunityCards'

/**
 * #4022 / #4020 (Louis 11/10) — UNE carte par fait : le fait, sa source datée, son lieu (un poste),
 * qui contacter (en clair) et « Préparer le message » ; sans personne liée, la carte reste SANS
 * aucun bouton (Louis 12/10 soir, #4044 : « Trouver qui contacter » sous chaque signal = aucune
 * valeur ; une absence ne fait aucune ligne). Les recrutements : 5 d'abord, puis « Voir plus ».
 * (Porte aussi les preuves de #3823 : le bloc Missions est fondu dans ces cartes.)
 */

const openEngagement = vi.hoisted(() => vi.fn())
vi.mock('../../components/contact-engagement/ContactEngagementContext', () => ({
  useOptionalContactEngagement: () => ({ openEngagement }),
}))

const CLAIRE = {
  id: 'c-1',
  full_name: 'Claire Morel',
  title: 'Directrice data',
  email: 'claire.morel@arquus.example',
  phone: '+33 6 12 34 56 78',
} as Contact

function card(over: Partial<OpportunityCard> & Pick<OpportunityCard, 'key' | 'title'>): OpportunityCard {
  return {
    basis: {
      label: over.title,
      source: 'Offre d’emploi publiée',
      date: '2026-10-01',
      sourceUrl: null,
      sourceKind: null,
    },
    place: { rank: 'france', place: 'Lyon' },
    role: null,
    contacts: [],
    contactsMatch: 'none',
    origin: 'signal',
    signal: null,
    implication: null,
    derivedNeeds: [],
    ...over,
  }
}

beforeEach(() => openEngagement.mockReset())

describe('① Recrutements — #4022', () => {
  it('OFFRES-VEILLE (16/10) — les besoins déduits se lisent SOUS la carte de l’offre ; sans besoin, aucune rubrique', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[
          card({ key: 'k1', title: 'Data marketing', derivedNeeds: ['Pilotage de la donnée marketing'] }),
          card({ key: 'k2', title: 'Comptable' }),
        ]}
        contacts={[]}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Recrutements' })
    expect(within(section).getByText('Pilotage de la donnée marketing')).toBeInTheDocument()
    expect(within(section).getAllByText('Besoins déduits de cette offre')).toHaveLength(1)
  })

  it('une carte dit le fait, sa source, sa date et son lieu ; qui contacter en clair, et « Préparer le message »', async () => {
    const user = userEvent.setup()
    renderWithRouter(
      <RecruitmentSection
        cards={[card({ key: 'k1', title: 'Data engineer', contacts: [CLAIRE], contactsMatch: 'role' })]}
        contacts={[CLAIRE]}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Recrutements' })
    expect(within(section).getByText('Data engineer', { selector: 'h4' })).toBeInTheDocument()
    expect(within(section).getByText(/Offre d’emploi publiée · 01\/10\/2026 · Lyon/)).toBeInTheDocument()
    expect(within(section).getByText('Claire Morel')).toBeInTheDocument()
    expect(within(section).getByText('claire.morel@arquus.example · +33 6 12 34 56 78')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Préparer le message à Claire Morel' }))
    expect(openEngagement).toHaveBeenCalledWith([CLAIRE], 'email')
  })

  it('#4092 — le contact affiché porte « Voir la fiche » vers /contacts/<id> ; sans id, aucun bouton', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[
          card({
            key: 'k1',
            title: 'Data engineer',
            contacts: [CLAIRE, { ...CLAIRE, id: '', full_name: 'Sans Identifiant' } as Contact],
            contactsMatch: 'role',
          }),
        ]}
        contacts={[CLAIRE]}
      />,
    )
    const link = await screen.findByRole('link', { name: 'Voir la fiche de Claire Morel' })
    expect(link).toHaveAttribute('href', '/contacts/c-1')
    expect(screen.getAllByRole('link', { name: /Voir la fiche/ })).toHaveLength(1)
  })

  it('#4020 — un poste hors France et un lieu inconnu se DISENT, ils ne disparaissent pas', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[
          card({ key: 'k1', title: 'Juriste', place: { rank: 'unknown', place: null } }),
          card({ key: 'k2', title: 'Comptable', place: { rank: 'abroad', place: 'Berlin' } }),
        ]}
        contacts={[]}
      />,
    )
    expect(await screen.findByText(/lieu non précisé/)).toBeInTheDocument()
    expect(screen.getByText(/hors France \(Berlin\)/)).toBeInTheDocument()
  })

  it('#4044 (Louis 12/10 soir) — sans personne liée : la carte reste, sans AUCUN bouton « Trouver qui contacter »', async () => {
    renderWithRouter(<RecruitmentSection cards={[card({ key: 'k1', title: 'Juriste' })]} contacts={[]} />)
    expect(await screen.findByText('Juriste')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Trouver qui contacter/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Préparer le message/ })).toBeNull()
  })

  it('5 cartes d’abord, puis « Voir plus »', async () => {
    const user = userEvent.setup()
    const cards = Array.from({ length: 7 }, (_, index) => card({ key: `k${index}`, title: `Poste ${index}` }))
    renderWithRouter(<RecruitmentSection cards={cards} contacts={[]} />)
    const section = await screen.findByRole('region', { name: 'Recrutements' })
    expect(within(section).getAllByRole('heading', { level: 4 })).toHaveLength(5)
    await user.click(within(section).getByRole('button', { name: 'Voir 2 recrutements de plus' }))
    expect(within(section).getAllByRole('heading', { level: 4 })).toHaveLength(7)
  })

  // #4016.DECATHLON (recette prod 11/10 nuit) — « Jobs IT » promis par #4031 vivait dans le journal des
  // signaux, REPLIÉ depuis la refonte #4022 : introuvable sur l'onglet. Il se lit en tête de Recrutements.
  it('#4016 — le compteur « Jobs IT » est visible en tête, TOUTES les offres comptées (pas les 5 premières)', async () => {
    const cards = Array.from({ length: 13 }, (_, index) => card({ key: `k${index}`, title: `Poste ${index}` }))
    renderWithRouter(<RecruitmentSection cards={cards} contacts={[]} />)
    const counter = await screen.findByTestId('recruitment-jobs-count')
    expect(counter).toHaveTextContent('Offres d’emploi')
    expect(counter).toHaveTextContent('13')
  })

  it('NON : sans recrutement, la section ne s’affiche pas', async () => {
    renderWithRouter(
      <>
        <p>rendu</p>
        <RecruitmentSection cards={[]} contacts={[]} />
      </>,
    )
    expect(await screen.findByText('rendu')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recrutements' })).toBeNull()
  })
})

describe('② Besoins d’équipe et ③ Vision — #4022', () => {
  const TEAM: TeamNeedCard = {
    key: 'team-data',
    teamKey: 'data',
    postings: [card({ key: 'k1', title: 'Data engineer' }), card({ key: 'k2', title: 'Data analyst' })],
    contacts: [],
    contactsMatch: 'none',
  }

  // #4399 (Louis 21/10, recette) RENVERSE #4022.7 (12/10) : le bloc d'équipe est DÉPLIÉ par défaut et LISTE ses
  // postes ; l'offre apparaît donc aussi sur sa carte de ① — la décision du 21/10 prime sur « une occurrence visible ».
  it('#4399 — plusieurs postes d’une équipe : le bloc est DÉPLIÉ et liste ses postes', async () => {
    renderWithRouter(<TeamNeedsSection teams={[TEAM]} onJump={vi.fn()} />)
    const section = await screen.findByRole('region', { name: 'Besoins d’équipe' })
    expect(within(section).getByText('Équipe data / IA — 2 postes ouverts')).toBeInTheDocument()
    const group = within(section).getByTestId('team-need-group')
    expect(group).toHaveAttribute('open')
    const postings = within(group).getAllByTestId('team-need-posting')
    expect(postings.map(item => item.textContent)).toEqual(['Data engineer', 'Data analyst'])
    expect(within(section).getByRole('button', { name: 'Voir les 2 postes' })).toBeInTheDocument()
    // Pas de duplication de la carte entière : ni source datée, ni « Trouver qui contacter ».
    expect(within(section).queryByText(/Offre d’emploi publiée/)).toBeNull()
    expect(within(section).queryByRole('button', { name: 'Trouver qui contacter' })).toBeNull()
  })

  it('#4399.2 — « Autres besoins » sous les équipes : famille, nombre et lien vers les offres ; rien d’autre ⇒ aucun bloc', async () => {
    const onJump = vi.fn()
    const others = [
      { key: 'other-erp', family: 'erp' as const, postings: [card({ key: 'e1', title: 'Consultant ERP' })] },
      { key: 'other-other', family: 'other' as const, postings: [card({ key: 'o1', title: 'Comptable' })] },
    ]
    const { rerender } = renderWithRouter(<TeamNeedsSection teams={[TEAM]} others={others} onJump={onJump} />)
    const block = await screen.findByTestId('other-needs')
    expect(within(block).getByText('Autres besoins')).toBeInTheDocument()
    expect(within(block).getByText('Équipe ERP — 1 poste ouvert')).toBeInTheDocument()
    expect(within(block).getByText('Autres métiers — 1 poste ouvert')).toBeInTheDocument()
    expect(
      within(block)
        .getAllByTestId('other-need-posting')
        .map(item => item.textContent),
    ).toEqual(['Consultant ERP', 'Comptable'])
    await userEvent.click(within(block).getAllByRole('button', { name: 'Voir le poste' })[0]!)
    expect(onJump).toHaveBeenCalledWith(['e1'])
    rerender(<TeamNeedsSection teams={[TEAM]} others={[]} onJump={onJump} />)
    expect(screen.queryByTestId('other-needs')).toBeNull()
  })

  it('#4399 — trois familles ⇒ trois blocs dépliés', async () => {
    const mk = (teamKey: TeamNeedCard['teamKey'], n: number): TeamNeedCard => ({
      key: `team-${teamKey}`,
      teamKey,
      postings: [
        card({ key: `${teamKey}1`, title: `${teamKey} A` }),
        card({ key: `${teamKey}2`, title: `${teamKey} B` }),
      ],
      contacts: [],
      contactsMatch: 'none',
      ...(n ? {} : {}),
    })
    renderWithRouter(<TeamNeedsSection teams={[mk('data', 0), mk('cloud', 0), mk('java', 0)]} onJump={vi.fn()} />)
    const groups = await screen.findAllByTestId('team-need-group')
    expect(groups).toHaveLength(3)
    for (const group of groups) expect(group).toHaveAttribute('open')
  })

  // #5005.1 — REVIENT sur #4399 (« premier poste seulement ») : le bouton met en évidence TOUS les postes annoncés.
  it('#5005 — « Voir les postes » renvoie vers TOUS les postes de l’équipe (onJump avec leurs clés)', async () => {
    const user = userEvent.setup()
    const onJump = vi.fn()
    renderWithRouter(<TeamNeedsSection teams={[TEAM]} onJump={onJump} />)
    await user.click(await screen.findByRole('button', { name: 'Voir les 2 postes' }))
    expect(onJump).toHaveBeenCalledWith(['k1', 'k2'])
  })

  it('#4022 — le renvoi déplie « Voir plus » quand le poste visé est au-delà des 5 premiers', async () => {
    const cards = Array.from({ length: 7 }, (_, index) => card({ key: `k${index}`, title: `Poste ${index}` }))
    renderWithRouter(<RecruitmentSection cards={cards} contacts={[]} focusKeys={['k6']} />)
    const section = await screen.findByRole('region', { name: 'Recrutements' })
    expect(within(section).getAllByRole('heading', { level: 4 })).toHaveLength(7)
  })

  it('#5005 — tous les postes visés sont surlignés, pas seulement le premier', async () => {
    const cards = Array.from({ length: 4 }, (_, index) => card({ key: `k${index}`, title: `Poste ${index}` }))
    renderWithRouter(<RecruitmentSection cards={cards} contacts={[]} focusKeys={['k1', 'k3']} />)
    const section = await screen.findByRole('region', { name: 'Recrutements' })
    const highlighted = within(section)
      .getAllByRole('listitem')
      .filter(item => item.getAttribute('data-focused') === 'true')
    expect(highlighted.map(item => item.id)).toEqual(['posting-k1', 'posting-k3'])
  })

  it('#4022 — NON : sans regroupement, la section ② ne s’affiche pas', async () => {
    renderWithRouter(
      <>
        <p>rendu</p>
        <TeamNeedsSection teams={[]} onJump={vi.fn()} />
      </>,
    )
    expect(await screen.findByText('rendu')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Besoins d’équipe' })).toBeNull()
  })

  it('NON : sans carte de vision, aucun titre — les programmes publics passés restent rendus', async () => {
    renderWithRouter(
      <VisionSection cards={[]} contacts={[]}>
        <p>programmes</p>
      </VisionSection>,
    )
    expect(await screen.findByText('programmes')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Vision / transformation' })).toBeNull()
  })
})

describe('#4022 recette prod 12/10 — la hauteur de page', () => {
  it('#4022.2 — Vision / transformation : 5 cartes d’abord, puis « Voir N de plus »', async () => {
    const user = userEvent.setup()
    const cards = Array.from({ length: 61 }, (_, index) =>
      card({ key: `v${index}`, title: `Fait ${index}`, place: null }),
    )
    renderWithRouter(<VisionSection cards={cards} contacts={[]} />)
    const section = await screen.findByRole('region', { name: 'Vision / transformation' })
    expect(within(section).getAllByRole('heading', { level: 4 })).toHaveLength(5)
    await user.click(within(section).getByRole('button', { name: 'Voir 56 signaux de plus' }))
    expect(within(section).getAllByRole('heading', { level: 4 })).toHaveLength(61)
  })

  it('#4044.1 — le contact recoupé s’affiche SUR sa carte ; aucun bloc « Contacts connus » répété', async () => {
    const cards = [
      card({ key: 'v0', title: 'Fait 0', place: null, contacts: [CLAIRE], contactsMatch: 'known' }),
      card({ key: 'v1', title: 'Fait 1', place: null, contacts: [], contactsMatch: 'none' }),
    ]
    renderWithRouter(<VisionSection cards={cards} contacts={[CLAIRE]} />)
    const section = await screen.findByRole('region', { name: 'Vision / transformation' })
    expect(within(section).getAllByText('Claire Morel')).toHaveLength(1)
    expect(within(section).queryByText(/Contacts connus du compte/)).toBeNull()
    expect(within(section).queryByRole('button', { name: /Trouver qui contacter/ })).toBeNull()
  })

  it('#4022.5 — avec 61 faits de vision, 20 postes, la page rend ≤ 10 cartes par défaut (≈ 9 000 px)', async () => {
    const vision = Array.from({ length: 61 }, (_, index) =>
      card({ key: `v${index}`, title: `Fait ${index}`, place: null }),
    )
    const jobs = Array.from({ length: 20 }, (_, index) => card({ key: `j${index}`, title: `Poste ${index}` }))
    renderWithRouter(
      <>
        <RecruitmentSection cards={jobs} contacts={[CLAIRE]} />
        <VisionSection cards={vision} contacts={[CLAIRE]} />
      </>,
    )
    await screen.findByRole('region', { name: 'Recrutements' })
    // ~ 200 px par carte + 2 en-têtes : 10 cartes ≈ 2 000 px au lieu de 81 ≈ 16 000 px.
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(10)
    expect(screen.queryByText(/Contacts connus du compte/)).toBeNull()
  })
})

describe('#3901.6 — « autres recrutements » sous les postes visés', () => {
  it('les cartes hors poste visé sont dessous, repliées, nommées et comptées', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[card({ key: 'v1', title: 'Data engineer' })]}
        others={[card({ key: 'o1', title: 'Comptable' })]}
        contacts={[]}
      />,
    )
    const others = await screen.findByTestId('recruitment-others')
    expect(others).toHaveTextContent('Autres recrutements (1)')
    expect(others.querySelector('#posting-o1')).not.toBeNull()
    expect(screen.getByText('Data engineer').closest('[data-testid="recruitment-others"]')).toBeNull()
  })

  it('SAIT DIRE NON — sans autre recrutement, aucun bloc « autres »', async () => {
    renderWithRouter(<RecruitmentSection cards={[card({ key: 'v1', title: 'Data engineer' })]} contacts={[]} />)
    await screen.findByTestId('recruitment-jobs-count')
    expect(screen.queryByTestId('recruitment-others')).toBeNull()
  })
})

describe('#3917.r42 — la date de chaque actualité se voit (ou se dit inconnue)', () => {
  const signalOf = { id: 's' } as unknown as NonNullable<OpportunityCard['signal']>

  it('une actualité datée porte sa date à côté de sa source ; sans date : « Date de publication inconnue »', async () => {
    renderWithRouter(
      <VisionSection
        cards={[
          card({
            key: 'dated',
            title: 'Base au Japon',
            signal: signalOf,
            basis: {
              label: 'Base au Japon',
              source: 'Boursorama',
              date: '2026-10-12',
              sourceUrl: null,
              sourceKind: 'press',
            },
          }),
          card({
            key: 'undated',
            title: 'Nomination',
            signal: signalOf,
            basis: { label: 'Nomination', source: 'VIPress.net', date: null, sourceUrl: null, sourceKind: 'press' },
          }),
        ]}
        contacts={[]}
      />,
    )
    expect(await screen.findByText(/Boursorama · 12\/10\/2026/)).toBeInTheDocument()
    expect(screen.getAllByTestId('opportunity-card-date-unknown')).toHaveLength(1)
    expect(screen.getByText('Date de publication inconnue')).toBeInTheDocument()
  })
})

// #4328.1 (call refonte UX 19/10, Théo : « c'est trop moche ») — critère « texte sans débordement ni
// superposition » : un intitulé, une source ou une adresse sans espace (URL, e-mail long) se COUPE dans la
// carte au lieu d'en sortir. `overflow-wrap` s'hérite : posé sur la carte, il couvre tout son texte.
describe('#4328.1 — aucune carte ne déborde', () => {
  const LONG = 'https://www.exemple-de-site-tres-long.example/offres/ingenieur-data-plateforme-cloud-hybride-2026'
  it('la carte de vision et celle d’un recrutement coupent un mot sans espace, et peuvent rétrécir', async () => {
    renderWithRouter(
      <>
        <RecruitmentSection cards={[card({ key: 'r1', title: LONG })]} contacts={[]} />
        <VisionSection cards={[card({ key: 'v1', title: `${LONG}-vision`, place: null })]} contacts={[]} />
      </>,
    )
    for (const title of [LONG, `${LONG}-vision`]) {
      const heading = await screen.findByText(title, { selector: 'h4' })
      const box = heading.closest('[data-testid="opportunity-card"]')
      expect(box).not.toBeNull()
      expect(box?.className).toMatch(/\[overflow-wrap:anywhere\]/)
      expect(box?.className).toMatch(/\bmin-w-0\b/)
    }
  })

  it('le résumé d’équipe aussi', async () => {
    const posting = card({ key: 'p1', title: 'Data engineer' })
    const team: TeamNeedCard = {
      key: 'team-data',
      teamKey: 'data',
      postings: [posting, card({ key: 'p2', title: 'Data analyst' })],
      contacts: [],
      contactsMatch: 'none',
    }
    renderWithRouter(<TeamNeedsSection teams={[team]} onJump={() => {}} />)
    const box = (await screen.findByText(/Équipe data/)).closest('[data-testid="opportunity-card"]')
    expect(box?.className).toMatch(/\[overflow-wrap:anywhere\]/)
  })

  // #4284.10 (recette 21/10, L2b) — « Autres recrutements (N) » : chaque carte porte la marque.
  it('chaque carte de « Autres recrutements » porte « hors de ton métier » quand le profil a un métier', async () => {
    const others = [card({ key: 'o1', title: 'Gérant de magasin' }), card({ key: 'o2', title: 'Chargé de clientèle' })]
    renderWithRouter(
      <RecruitmentSection
        cards={[card({ key: 'k1', title: 'Développeur Java' })]}
        others={others}
        contacts={[]}
        profile={{ placedRoles: ['Développeur'], noGoSectors: [] }}
      />,
    )
    expect(await screen.findAllByTestId('offer-out-of-trade')).toHaveLength(2)
  })

  it('NON : sans profil, aucune carte n’est marquée', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[card({ key: 'k1', title: 'Développeur Java' })]}
        others={[card({ key: 'o1', title: 'Gérant de magasin' })]}
        contacts={[]}
      />,
    )
    await screen.findAllByTestId('opportunity-card')
    expect(screen.queryAllByTestId('offer-out-of-trade')).toHaveLength(0)
  })
  // #4396.1 / #4398.1 (recette 23/10, espace SooIT) — un espace qui place des CDI (`recruitsForClients`) ne marquait
  // rien : « Autres recrutements » est hors métier PAR CONSTRUCTION, chaque carte le dit, et le compteur range le
  // métier d'abord.
  it('#4396.1 — profil placeur en CDI : les « autres recrutements » portent quand même la marque', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[]}
        others={[card({ key: 'o1', title: 'Agent de sécurité' }), card({ key: 'o2', title: 'Chef de chantier' })]}
        contacts={[]}
        profile={{ placedRoles: ['Développeur'], noGoSectors: [], recruitsForClients: true }}
      />,
    )
    expect(await screen.findAllByTestId('offer-out-of-trade')).toHaveLength(2)
  })

  it('#4396.1 — le compteur compte le métier d’abord : « 0 du métier · 2 hors métier »', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[]}
        others={[card({ key: 'o1', title: 'Agent de sécurité' }), card({ key: 'o2', title: 'Chef de chantier' })]}
        contacts={[]}
        profile={{ placedRoles: ['Développeur'], noGoSectors: [] }}
      />,
    )
    expect(await screen.findByTestId('recruitment-jobs-count')).toHaveTextContent('0 du métier · 2 hors métier')
  })

  it('#4396.1 — sans offre hors métier, le compteur reste le total simple', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[card({ key: 'k1', title: 'Développeur Java' })]}
        contacts={[]}
        profile={{ placedRoles: ['Développeur'], noGoSectors: [] }}
      />,
    )
    const counter = await screen.findByTestId('recruitment-jobs-count')
    expect(counter).not.toHaveTextContent('hors métier')
    expect(counter).toHaveTextContent('1')
  })

  it('#4396.1 — aucune offre du métier : « Autres recrutements » est déplié, les offres se lisent', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[]}
        others={[card({ key: 'o1', title: 'Chef de chantier' })]}
        contacts={[]}
        profile={{ placedRoles: ['Développeur'], noGoSectors: [] }}
      />,
    )
    const details = await screen.findByTestId('recruitment-others')
    expect(details).toHaveAttribute('open')
  })
})

describe('#4294.6 — un fait vu plusieurs fois le DIT', () => {
  it('la ligne de source dit « Vu 2 fois » ; une carte vue une fois ne dit rien', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[
          card({ key: 'k1', title: '5 offres d’emploi ouvertes', seenCount: 2 }),
          card({ key: 'k2', title: 'Comptable' }),
        ]}
        contacts={[]}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Recrutements' })
    expect(within(section).getAllByText(/Vu 2 fois/)).toHaveLength(1)
    expect(within(section).queryByText(/Vu 1 fois|Vu 0 fois/)).toBeNull()
  })
})

// #5004 — chaque carte porte sa nature ; une vision / un article n'est JAMAIS présenté comme un besoin.
describe('nature de chaque carte — #5004', () => {
  const signal = (freshness: 'recent' | 'archive') =>
    ({ freshness, temporalStatus: undefined }) as unknown as OpportunityCard['signal']

  it('une carte de vision se dit « Information du site », jamais besoin ni demande', async () => {
    renderWithRouter(
      <VisionSection
        cards={[card({ key: 'v1', title: 'Plan stratégique 2030', signal: signal('recent') })]}
        contacts={[]}
      />,
    )
    const badge = await screen.findByTestId('line-nature')
    expect(badge).toHaveAttribute('data-nature', 'siteInformation')
    expect(badge).toHaveTextContent('Information du site')
  })

  it('un recrutement récent se dit « Signal récent » ; une piste « Piste à explorer »', async () => {
    renderWithRouter(
      <RecruitmentSection
        cards={[
          card({ key: 'r1', title: 'Dev', signal: signal('recent') }),
          card({ key: 'r2', title: 'Piste', origin: 'lead' }),
          card({ key: 'r3', title: 'Mission', origin: 'opportunity' }),
        ]}
        contacts={[]}
      />,
    )
    const natures = (await screen.findAllByTestId('line-nature')).map(b => b.getAttribute('data-nature'))
    expect(natures).toEqual(['recentSignal', 'leadToExplore', 'confirmedDemand'])
  })

  it('une carte sans fait daté ne s’affirme d’aucune nature (pas de badge inventé)', async () => {
    renderWithRouter(<RecruitmentSection cards={[card({ key: 'r1', title: 'Dev' })]} contacts={[]} />)
    await screen.findByRole('region', { name: 'Recrutements' })
    expect(screen.queryByTestId('line-nature')).toBeNull()
  })
})
