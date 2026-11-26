import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Contact, ContactRankingResponse } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { resetLauraIntro, useCurrentLauraIntro } from '@/features/laura/bubble/laura-intro-store'
import {
  ContactEngagementContext,
  type ContactEngagementContextValue,
} from '../components/contact-engagement/ContactEngagementContext'
import { TabCommittee } from './TabCommittee'

// #3263.46/.48 — « préparer l'approche » et « créer une introduction » RÉUTILISENT le
// composeur commun (`useContactEngagement().openEngagement`), même patron que `TabMessages.test.tsx`.
const openEngagement = vi.fn()
const engagementValue = { openEngagement } as unknown as ContactEngagementContextValue

// #3263.44 — l'enrichissement RÉUTILISE le hook et le dialogue de coût de l'onglet Contacts :
// on prouve que le clic ouvre la confirmation et que seul « confirmer » débite.
const enrichMutate = vi.fn()
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: enrichMutate, isPending: false, variables: undefined }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: { enrichment_credits: 7 } }),
}))
vi.mock('@/features/contacts/components/EnrichConfirmDialog', () => ({
  EnrichConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        confirmer-enrichissement
      </button>
    ) : null,
}))

// #3263.43 — même convention que `useHideContact.test.tsx` : on espionne
// `contactsApi.setHidden`, jamais un réseau réel.
const setHidden = vi.fn()
// #3263.17 — même discipline : jamais un réseau réel pour le classement de
// contacts lu par la relation ; `null` = aucun résultat (comportement par
// défaut de la plupart des tests, qui ne testent pas cette relation).
let rankingResponse: ContactRankingResponse | null = null
// #3263.28 — même discipline : jamais un réseau réel pour la collision de
// sollicitation ; `{}` (par défaut) = aucune collision connue.
let solicitationsResponse: Record<string, unknown> = {}
vi.mock('@/features/contacts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/contacts/api')>('@/features/contacts/api')
  return {
    ...actual,
    contactsApi: {
      ...actual.contactsApi,
      setHidden: (...args: unknown[]) => setHidden(...args),
      solicitations: () => Promise.resolve(solicitationsResponse),
      rankByAccount: () =>
        rankingResponse
          ? Promise.resolve(rankingResponse)
          : Promise.resolve({
              ranked: [],
              total: 0,
              scored: 0,
              excluded: [],
              context: {
                perimeter: null,
                perimeter_source: 'none',
                subject: null,
                subject_source: 'none',
                offer: null,
              },
            }),
    },
  }
})

// #3263.47 — même convention que `AskLaura.test.tsx` : mocker `Link` pour
// lire le lien final sans monter un routeur complet.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    search?: unknown
    params?: unknown
  }) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search)} data-params={JSON.stringify(params)} {...rest}>
      {children}
    </a>
  ),
}))

const RAW = {
  org: {
    orgGraph: {
      graphVersion: 1,
      entities: [{ id: 'e1', name: 'Groupe X', type: 'groupe', confidence: 80 }],
      people: [
        {
          id: 'p1',
          fullName: 'Claire Basset',
          title: 'Directrice Data',
          entityId: 'e1',
          identityStatus: 'actionable',
          confidence: 88,
          sources: [],
        },
      ],
      hierarchyEdges: [],
      influenceEdges: [],
      buyingCommittee: [{ personId: 'p1', role: 'champion', entityId: 'e1' }],
      uncoveredZones: [],
      recommendedPath: [],
      rejectedItems: [],
    },
  },
}

afterEach(() => {
  resetLauraIntro()
  setHidden.mockReset()
  openEngagement.mockReset()
  rankingResponse = null
  solicitationsResponse = {}
})

/** Lit ce que le magasin partagé de Laura contient — même patron que `AskLaura.test.tsx`. */
function IntroReader() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="intro">{intro ? `${intro.question}|${intro.label}|${intro.accountId ?? ''}` : 'rien'}</span>
}

function renderTab(
  rawAnalysis: Record<string, unknown>,
  onTabChange: (tab: string) => void = () => {},
  contacts: Contact[] = [],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementContext.Provider value={engagementValue}>
        <TabCommittee
          accountId="acc-1"
          companyName="Acme"
          rawAnalysis={rawAnalysis}
          contacts={contacts}
          onTabChange={onTabChange}
        />
        <IntroReader />
      </ContactEngagementContext.Provider>
    </QueryClientProvider>,
  )
}

describe('TabCommittee — #3282', () => {
  it('rend le siège occupé, nomme les sièges vides et dit « jamais vérifié » (pas 0)', () => {
    const { container } = renderTab(RAW)
    const body = container.textContent ?? ''
    expect(body).toContain('Claire Basset')
    expect(body).toContain(i18n.t('accountOrg:committeeScreen.seats.champion'))
    // Les quatre autres sièges cœur sont nommés vides.
    for (const role of ['economic_buyer', 'technical_buyer', 'user_buyer', 'procurement']) {
      expect(body).toContain(i18n.t(`accountOrg:committeeScreen.seats.${role}`))
    }
    expect(body).toContain(i18n.t('accountOrg:committeeScreen.freshness.never_verified'))
    expect(body).not.toMatch(/\b0 jour/)
    // Aucun contact transmis : `contactId` ne se résout pas, donc pas de lien deviné.
    expect(screen.queryByText(i18n.t('accountOrg:committeeScreen.actions.openContact'))).not.toBeInTheDocument()
  })

  // #3263.17-19/.44/.46/.48 — le siège rejoint la vraie fiche contact par
  // rapprochement de nom (`orgPersonSlug`), même technique que le chemin
  // recommandé de l'organigramme (GA-26 : jamais un second mécanisme).
  it('résout la fiche contact quand un seul contact du compte porte ce nom', () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    renderTab(RAW, () => {}, [claire])
    const link = screen.getByText(i18n.t('accountOrg:committeeScreen.actions.openContact'))
    expect(link.closest('a')).toHaveAttribute('data-to', '/contacts/$id')
    expect(link.closest('a')).toHaveAttribute('data-params', JSON.stringify({ id: 'c-42' }))
  })

  // Théo comptes-fiche — le badge « Décideur » est dans CHAQUE liste de personnes, comité d'achat compris.
  it('Théo comptes-fiche — un décideur porte la pastille « Décideur » ; un non-décideur, aucune', () => {
    const decideur = {
      id: 'c-42',
      account_id: 'acc-1',
      full_name: 'Claire Basset',
      decision_role: 'economic',
    } as Contact
    const { unmount } = renderTab(RAW, () => {}, [decideur])
    expect(screen.getByText(i18n.t('contacts:roles.decisionMaker'))).toBeInTheDocument()
    unmount()
    renderTab(RAW, () => {}, [{ ...decideur, decision_role: 'user' } as Contact])
    expect(screen.queryByText(i18n.t('contacts:roles.decisionMaker'))).not.toBeInTheDocument()
  })

  // Recette prod 01/10 (#3282, VISUEL KO) : « Déclarer un rôle » restait 8 px plus bas que
  // « Ouvrir la fiche contact » — le bouton du tiroir portait un `mt-2` de son contexte d'origine.
  it('le geste « Déclarer un rôle » n’ajoute aucune marge haute à la ligne de CTA', () => {
    renderTab(RAW)
    const trigger = screen.getByTestId('org-correction-open')
    expect(trigger.className).not.toMatch(/(^|\s)mt-2(\s|$)/)
  })

  // Recette prod 01/10 (#3282) : « Décideur technique » en en-tête de groupe ET sur chaque ligne.
  it('ne répète pas, sur la ligne, le libellé du siège déjà porté par l’en-tête de groupe', () => {
    const raw = structuredClone(RAW) as typeof RAW
    raw.org.orgGraph.people[0].title = 'Champion'
    renderTab(raw)
    expect(screen.getAllByText('Champion')).toHaveLength(1)
  })

  // #3263.17 — la relation réseau, lue sur le MÊME classement que l'onglet
  // Contacts (`useContactRanking`, GA-26), jointe par le `contactId` résolu.
  it('#3282.18/.19 dernière et prochaine action : lues sur le classement, jointes par identifiant', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    rankingResponse = {
      ranked: [
        {
          contact_id: 'c-42',
          position: 1,
          score: 10,
          max: 10,
          axes: [{ key: 'relationship', points: 10, max: 10, reason: 'known_relationship' }],
          strategic_axes: [],
          group: 'first_door',
          explanation: {
            who: { key: 'who', measured: false, code: 'not_evaluated' },
            when: { key: 'when', measured: false, code: 'not_evaluated' },
            stage: { key: 'stage', measured: false, code: 'not_evaluated' },
            unlocks: { key: 'unlocks', measured: false, code: 'not_evaluated' },
            next: { key: 'next', measured: false, code: 'not_evaluated' },
            limit: { key: 'limit', measured: false, code: 'not_evaluated' },
          },
          anti_advice: { what: 'dont_ask_for_decision', why: 'not_evaluated' },
          confidence: 'not_measured',
          access_path: { kind: null, missing_reason: 'never_searched' },
          last_interaction_at: '2026-09-12T08:00:00.000Z',
          next_action_due_date: '2026-10-03',
        },
      ],
      total: 1,
      scored: 1,
      excluded: [],
      context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
    } as unknown as ContactRankingResponse
    renderTab(RAW, () => {}, [claire])
    expect(await screen.findByText(/Dernière action : /)).toBeInTheDocument()
    expect(screen.getByText(/Prochaine action : /)).toBeInTheDocument()
  })

  // #3282 / #3263.19 (recette 05/10) — un siège hors des dix premiers du classement garde sa date.
  it('#3282 — la prochaine action d’un siège hors du chemin recommandé se lit sur scheduled_actions', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    rankingResponse = {
      ranked: [],
      scheduled_actions: [{ contact_id: 'c-42', next_action_due_date: '2026-10-11' }],
      total: 1,
      scored: 0,
      excluded: [],
      context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
    } as unknown as ContactRankingResponse
    renderTab(RAW, () => {}, [claire])
    expect(await screen.findByText(/Prochaine action : /)).toBeInTheDocument()
  })

  it('#3282 — un geste du journal (sans e-mail envoyé) fait la dernière action du siège', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    rankingResponse = {
      ranked: [
        {
          contact_id: 'c-42',
          position: 1,
          score: 10,
          max: 10,
          axes: [],
          strategic_axes: [],
          group: 'first_door',
          explanation: {},
          anti_advice: { what: 'dont_ask_for_decision', why: 'not_evaluated' },
          confidence: 'not_measured',
          access_path: { kind: null, missing_reason: 'never_searched' },
          last_interaction_at: null,
          last_action_at: '2026-10-01T09:30:00.000Z',
        },
      ],
      total: 1,
      scored: 1,
      excluded: [],
      context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
    } as unknown as ContactRankingResponse
    renderTab(RAW, () => {}, [claire])
    expect(await screen.findByText(/Dernière action : /)).toBeInTheDocument()
  })

  it('#3263.17 relation connue : nomme la relation, lue sur le classement de contacts', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    rankingResponse = {
      ranked: [
        {
          contact_id: 'c-42',
          position: 1,
          score: 10,
          max: 10,
          axes: [{ key: 'relationship', points: 10, max: 10, reason: 'known_relationship' }],
          strategic_axes: [],
          group: 'first_door',
          explanation: {
            who: { key: 'who', measured: false, code: 'not_evaluated' },
            when: { key: 'when', measured: false, code: 'not_evaluated' },
            stage: { key: 'stage', measured: false, code: 'not_evaluated' },
            unlocks: { key: 'unlocks', measured: false, code: 'not_evaluated' },
            next: { key: 'next', measured: false, code: 'not_evaluated' },
            limit: { key: 'limit', measured: false, code: 'not_evaluated' },
          },
          anti_advice: { what: 'dont_ask_for_decision', why: 'not_evaluated' },
          confidence: 'not_measured',
          access_path: { kind: null, missing_reason: 'never_searched' },
          last_interaction_at: null,
        },
      ],
      total: 1,
      scored: 1,
      excluded: [],
      context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
    } as unknown as ContactRankingResponse
    renderTab(RAW, () => {}, [claire])
    expect(await screen.findByText(i18n.t('accountOrg:committeeScreen.relation.known'))).toBeInTheDocument()
  })

  it('#3263.17 relation inconnue : aucune ligne — une absence ne se nomme pas', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    rankingResponse = {
      ranked: [
        {
          contact_id: 'c-42',
          position: 1,
          score: 0,
          max: 10,
          axes: [{ key: 'relationship', points: 0, max: 10, reason: 'no_relationship' }],
          strategic_axes: [],
          group: 'first_door',
          explanation: {
            who: { key: 'who', measured: false, code: 'not_evaluated' },
            when: { key: 'when', measured: false, code: 'not_evaluated' },
            stage: { key: 'stage', measured: false, code: 'not_evaluated' },
            unlocks: { key: 'unlocks', measured: false, code: 'not_evaluated' },
            next: { key: 'next', measured: false, code: 'not_evaluated' },
            limit: { key: 'limit', measured: false, code: 'not_evaluated' },
          },
          anti_advice: { what: 'dont_ask_for_decision', why: 'not_evaluated' },
          confidence: 'not_measured',
          access_path: { kind: null, missing_reason: 'never_searched' },
          last_interaction_at: null,
        },
      ],
      total: 1,
      scored: 1,
      excluded: [],
      context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
    } as unknown as ContactRankingResponse
    renderTab(RAW, () => {}, [claire])
    // Laisse la requête (mockée) se résoudre avant d'asserter l'absence.
    await screen.findByText(i18n.t('accountOrg:committeeScreen.actions.openContact'))
    expect(screen.queryByText(i18n.t('accountOrg:committeeScreen.relation.known'))).not.toBeInTheDocument()
  })

  // #3263.38 / #3263.40 — « Première porte » et « Relations existantes » : deux lectures du classement
  // déjà câblé, jamais un second moteur ; une absence ne fait aucune ligne ; l'ordre suit le RANG
  // stratégique, jamais l'ancienneté (#3263.50).
  const rankedEntry = (contactId: string, position: number, group: string, reason: string) => ({
    contact_id: contactId,
    position,
    score: 10,
    max: 10,
    axes: [{ key: 'relationship', points: reason === 'known_relationship' ? 10 : 0, max: 10, reason }],
    strategic_axes: [],
    group,
    explanation: {},
    anti_advice: { what: 'dont_ask_for_decision', why: 'not_evaluated' },
    confidence: 'not_measured',
    access_path: { kind: null, missing_reason: 'never_searched' },
    last_interaction_at: null,
  })
  const rankingOf = (ranked: unknown[]) =>
    ({
      ranked,
      total: ranked.length,
      scored: ranked.length,
      excluded: [],
      context: { perimeter: null, perimeter_source: 'none', subject: null, subject_source: 'none', offer: null },
    }) as unknown as ContactRankingResponse

  it('#3263.38/.40 : la première porte suit le rang, les relations existantes nomment ceux qu’on connaît déjà', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    const paul = { id: 'c-43', account_id: 'acc-1', full_name: 'Paul Morel' } as Contact
    const ines = { id: 'c-44', account_id: 'acc-1', full_name: 'Inès Roche' } as Contact
    rankingResponse = rankingOf([
      rankedEntry('c-43', 1, 'first_door', 'no_relationship'),
      rankedEntry('c-42', 2, 'first_door', 'known_relationship'),
      rankedEntry('c-44', 3, 'decision_maker', 'no_relationship'),
    ])
    renderTab(RAW, () => {}, [claire, paul, ines])

    const firstDoor = await screen.findByLabelText(i18n.t('accountOrg:committeeScreen.firstDoor.title'))
    expect(firstDoor.textContent).toMatch(/Paul Morel.*Claire Basset/)
    expect(firstDoor.textContent).not.toMatch(/Inès Roche/)
    const known = screen.getByLabelText(i18n.t('accountOrg:committeeScreen.knownRelations.title'))
    expect(known.textContent).toMatch(/Claire Basset/)
    expect(known.textContent).not.toMatch(/Paul Morel/)
  })

  it('#3263.38/.40 : sans classement, ni première porte ni relations — aucune ligne', async () => {
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    renderTab(RAW, () => {}, [claire])
    await screen.findByText(i18n.t('accountOrg:committeeScreen.actions.openContact'))
    expect(screen.queryByLabelText(i18n.t('accountOrg:committeeScreen.firstDoor.title'))).not.toBeInTheDocument()
    expect(screen.queryByLabelText(i18n.t('accountOrg:committeeScreen.knownRelations.title'))).not.toBeInTheDocument()
  })

  it('homonymie : deux contacts « Claire Basset » → aucun lien, jamais deviné', () => {
    const claire1 = { id: 'c-1', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    const claire2 = { id: 'c-2', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    renderTab(RAW, () => {}, [claire1, claire2])
    expect(screen.queryByText(i18n.t('accountOrg:committeeScreen.actions.openContact'))).not.toBeInTheDocument()
  })

  it('sans graphe : état vide honnête, geste vers l’organigramme', () => {
    const onTabChange = vi.fn()
    renderTab({}, onTabChange)
    fireEvent.click(screen.getByText(i18n.t('accountOrg:committeeScreen.empty.action')))
    expect(onTabChange).toHaveBeenCalledWith('organigramme')
  })

  it('« Voir qui nous manque » mène à l’onglet couverture', () => {
    const onTabChange = vi.fn()
    renderTab(RAW, onTabChange)
    fireEvent.click(screen.getByText(i18n.t('accountOrg:committeeScreen.vacant.action')))
    expect(onTabChange).toHaveBeenCalledWith('coverage')
  })

  // #3263.45 — « Déclarer un rôle » REUTILISE le tiroir de correction de
  // l'organigramme, jamais un second mécanisme.
  it('#3263.45 — porte le geste de correction du rôle, sur CETTE personne', () => {
    renderTab(RAW)
    const trigger = screen.getByTestId('org-correction-open')
    expect(trigger.textContent).toContain(i18n.t('accountOrg:correction.gestures.declareRole'))
    fireEvent.click(trigger)
    // Le tiroir s'ouvre sur LA personne du siège, jamais une personne en dur.
    expect(screen.getByRole('dialog').textContent).toContain('Claire Basset')
  })

  // #3263.47 — « Demander une orientation » REUTILISE `AskLaura` (D44) : elle
  // dépose la question dans le magasin partagé plutôt que de naviguer — même
  // patron que `AskLaura.test.tsx`.
  it('#3263.47 — dépose une question sur CETTE personne, scopée à CE compte', () => {
    renderTab(RAW)
    const intro = screen.getByTestId('intro').textContent ?? ''
    expect(intro).toContain('Claire Basset')
    expect(intro).toContain('Acme')
    expect(intro).toContain(i18n.t('accountOrg:committeeScreen.actions.askOrientation'))
    expect(intro.endsWith('|acc-1')).toBe(true)
  })

  // #3263.43 — la vue « Masqués », REUTILISE `useHideContact` (Contacts).
  describe('#3263.43 — Masqués', () => {
    it('aucun contact masqué : aucune ligne', () => {
      const visible = { id: 'c1', account_id: 'acc-1', full_name: 'Alice Visible', hidden: false } as Contact
      renderTab(RAW, () => {}, [visible])
      expect(screen.queryByText(/Masqué/)).not.toBeInTheDocument()
    })

    it('liste les contacts masqués et les réaffiche d’un clic', async () => {
      setHidden.mockResolvedValueOnce({ id: 'c2', account_id: 'acc-1', full_name: 'Bob Masqué', hidden: false })
      const masque = { id: 'c2', account_id: 'acc-1', full_name: 'Bob Masqué', title: 'RSSI', hidden: true } as Contact
      renderTab(RAW, () => {}, [masque])

      expect(screen.getByText('Bob Masqué', { exact: false })).toBeInTheDocument()

      fireEvent.click(screen.getByText(i18n.t('accountOrg:committeeScreen.hidden.unhide')))

      await waitFor(() => expect(setHidden).toHaveBeenCalledWith('c2', false))
    })
  })

  it('#3263.44 — « Enrichir » ouvre la confirmation ; seul « confirmer » lance l’enrichissement du contact du siège', async () => {
    enrichMutate.mockClear()
    const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
    renderTab(RAW, () => {}, [claire])
    fireEvent.click(await screen.findByRole('button', { name: 'Enrichir' }))
    expect(enrichMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('confirmer-enrichissement'))
    expect(enrichMutate).toHaveBeenCalledWith(expect.objectContaining({ contact: claire, accountCompanyName: 'Acme' }))
  })

  it('#3263.44 — un siège sans contact du compte n’a pas de bouton « Enrichir » (jamais un contact deviné)', async () => {
    renderTab(RAW, () => {}, [])
    await screen.findByText('Claire Basset')
    expect(screen.queryByRole('button', { name: 'Enrichir' })).not.toBeInTheDocument()
  })

  // #3263.46 — « Préparer l'approche » RÉUTILISE le composeur commun
  // (`useContactEngagement().openEngagement`), jamais un second moteur de rédaction.
  describe('#3263.46 — préparer l’approche', () => {
    it('ouvre l’engagement sur CE contact avec l’objectif « Ouvrir le compte » déjà choisi', async () => {
      const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset', email: 'c@acme.fr' } as Contact
      renderTab(RAW, () => {}, [claire])
      fireEvent.click(
        await screen.findByRole('button', { name: i18n.t('accountOrg:committeeScreen.actions.prepareApproach') }),
      )
      expect(openEngagement).toHaveBeenCalledWith(
        [claire],
        'email',
        expect.objectContaining({ initialParameters: { objective: 'ouverture_compte' } }),
      )
    })

    it('SAIT DIRE NON — un siège sans contact du compte n’a pas ce bouton (jamais un contact deviné)', async () => {
      renderTab(RAW, () => {}, [])
      await screen.findByText('Claire Basset')
      expect(
        screen.queryByRole('button', { name: i18n.t('accountOrg:committeeScreen.actions.prepareApproach') }),
      ).not.toBeInTheDocument()
    })
  })

  // #3263.48 — « Créer une introduction » RÉUTILISE le MÊME composeur, avec l'objectif
  // « Demander une introduction » déjà choisi (`message-parameters.ts`) — jamais un second module.
  describe('#3263.48 — créer une introduction', () => {
    it('ouvre l’engagement sur CE contact avec l’objectif « introduction » et l’appel à l’action « demander_intro » déjà choisis', async () => {
      const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset', email: 'c@acme.fr' } as Contact
      renderTab(RAW, () => {}, [claire])
      fireEvent.click(
        await screen.findByRole('button', { name: i18n.t('accountOrg:committeeScreen.actions.createIntroduction') }),
      )
      expect(openEngagement).toHaveBeenCalledWith(
        [claire],
        'email',
        expect.objectContaining({ initialParameters: { objective: 'introduction', cta: 'demander_intro' } }),
      )
    })

    it('SAIT DIRE NON — un siège sans contact du compte n’a pas ce bouton', async () => {
      renderTab(RAW, () => {}, [])
      await screen.findByText('Claire Basset')
      expect(
        screen.queryByRole('button', { name: i18n.t('accountOrg:committeeScreen.actions.createIntroduction') }),
      ).not.toBeInTheDocument()
    })
  })

  // #3263.28 — RISQUE DE COLLISION : RÉUTILISE `contactsApi.solicitations`
  // (#2386.6/#2128.17, déjà groupé), jamais un second mécanisme de détection.
  describe('#3263.28 — risque de collision', () => {
    it('nomme la collègue qui a déjà sollicité CE contact du siège', async () => {
      const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
      solicitationsResponse = {
        'c-42': { colleague: { user_id: 'u-1', name: 'Marc Petit' }, lastTouchOn: '2026-09-28', withinDays: 14 },
      }
      renderTab(RAW, () => {}, [claire])
      expect(
        await screen.findByText(i18n.t('contacts:header.solicitationSignal', { name: 'Marc Petit', date: '28 sept.' })),
      ).toBeInTheDocument()
    })

    it('SAIT DIRE NON — aucune collision connue ne pose aucune notice', async () => {
      const claire = { id: 'c-42', account_id: 'acc-1', full_name: 'Claire Basset' } as Contact
      renderTab(RAW, () => {}, [claire])
      await screen.findByText('Claire Basset')
      expect(screen.queryByText(/Sollicité par/)).not.toBeInTheDocument()
    })

    it('SAIT DIRE NON — un siège sans contact résolu n’interroge personne', async () => {
      renderTab(RAW, () => {}, [])
      await screen.findByText('Claire Basset')
      expect(screen.queryByText(/Sollicité par/)).not.toBeInTheDocument()
    })
  })

  // #3263.37/.31 — les deux notices se RENDENT quand `committeeScreenData.ts` les porte ;
  // la logique de détection est déjà testée dans `committeeScreenData.test.ts` (GA-26).
  describe('#3263.37/.31 — notices dirigeant mondial et hors périmètre', () => {
    const RAW_MULTI_ENTITY = {
      org: {
        orgGraph: {
          graphVersion: 1,
          entities: [
            { id: 'groupe', name: 'Groupe X', type: 'groupe', confidence: 80 },
            { id: 'bu-data', name: 'BU Data', type: 'bu', parentId: 'groupe', confidence: 80 },
          ],
          people: [
            {
              id: 'p-dg',
              fullName: 'Henri Dirigeant',
              title: 'PDG',
              entityId: 'groupe',
              hierarchyLevel: 'L1',
              identityStatus: 'actionable',
              confidence: 88,
              sources: [],
            },
            {
              id: 'p-dsi',
              fullName: 'Sarah DSI',
              title: 'DSI',
              entityId: 'bu-data',
              identityStatus: 'actionable',
              confidence: 88,
              sources: [],
            },
          ],
          hierarchyEdges: [],
          influenceEdges: [],
          buyingCommittee: [
            { personId: 'p-dg', role: 'champion', entityId: 'groupe' },
            { personId: 'p-dsi', role: 'technical_buyer', entityId: 'bu-data' },
          ],
          uncoveredZones: [],
          recommendedPath: [],
          rejectedItems: [],
        },
      },
    }

    it('#3263.37 — nomme le dirigeant du groupe quand une BU plus précise est au comité', () => {
      renderTab(RAW_MULTI_ENTITY)
      expect(screen.getByText(i18n.t('accountOrg:committeeScreen.notices.tooGlobalExecutive'))).toBeInTheDocument()
    })

    // #4813 — une phrase d'avertissement dans une colonne de carte s'enroule : 380 px de texte dans 233 coupaient la fin.
    it('#4813 — le badge d’avertissement s’enroule dans la carte au lieu d’être rogné', () => {
      renderTab(RAW_MULTI_ENTITY)
      const badge = screen.getByText(i18n.t('accountOrg:committeeScreen.notices.tooGlobalExecutive'))
      expect(badge).toHaveClass('whitespace-normal', 'max-w-full')
      expect(badge).not.toHaveClass('whitespace-nowrap')
    })

    it('SAIT DIRE NON — la DSI de la BU ne porte pas la notice de dirigeant mondial', () => {
      renderTab(RAW_MULTI_ENTITY)
      const dsiCard = screen.getByText('Sarah DSI').closest('li')
      expect(dsiCard?.textContent).not.toContain(i18n.t('accountOrg:committeeScreen.notices.tooGlobalExecutive'))
    })
  })
})
