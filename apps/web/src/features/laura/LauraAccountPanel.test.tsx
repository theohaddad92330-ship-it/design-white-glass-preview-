import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_HIRING_INTERVENTION_KEY,
  ACCOUNT_PAIN_INTERVENTION_KEY,
  LAURA_INTERVENTIONS,
  lauraPageContextSchema,
  type AccountSuggestion,
  type InterventionDefinition,
  type LauraPageContext,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { LauraAccountPanel } from './LauraAccountPanel'

/**
 * LE PANNEAU CONTEXTUEL D'UN DOSSIER — maquette SOL6 n°6.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT, ET QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Le silence est le comportement par défaut.** Le serveur se tait ⇒ aucune
 *    bulle, pas d'espace réservé, pas de « rien à signaler ». Une bulle qui
 *    apparaîtrait à chaque ouverture de dossier déferait « Laura se tait quand
 *    tu travailles », qui est un comportement LIVRÉ.
 * 2. **« Pourquoi cette suggestion ? » rend les FAITS et les SOURCES.** Une
 *    suggestion qu'on ne peut pas décomposer est une boîte noire.
 * 3. **La ressource ne ment pas.** Vivier illisible ⇒ l'encadré se TAIT.
 *    Vivier lisible et vide ⇒ il dit zéro, et il dit combien de fiches n'ont
 *    rien déclaré.
 * 4. **« Préparer » PRÉPARE.** Aucun chemin d'envoi : le geste enregistre la
 *    réaction et ouvre le plan. Le copilote n'envoie jamais d'e-mail.
 */

const NAVIGATE = vi.fn()

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useLocation: () => ({ pathname: '/accounts/8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b' }),
    useNavigate: () => NAVIGATE,
  }
})

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT_ID = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'

const INTERVENTION = LAURA_INTERVENTIONS.find(
  entry => entry.key === ACCOUNT_HIRING_INTERVENTION_KEY,
) as InterventionDefinition

const SUGGESTION: AccountSuggestion = {
  accountId: ACCOUNT_ID,
  facts: [
    {
      kind: 'hiring_signal',
      statement: 'Deux postes Méthodes ouverts sur le site de Toulouse',
      source: 'Site carrières du groupe',
      observedOn: '2026-07-21',
      count: null,
    },
  ],
  resource: { state: 'measured', availableNow: 1, undeclared: 0 },
}

function speaks(suggestion: AccountSuggestion | null = SUGGESTION): void {
  apiFetchMock.mockResolvedValue({
    speaks: true,
    intervention: INTERVENTION,
    priority: 81,
    traceId: 'trace-1',
    ...(suggestion ? { accountSuggestion: suggestion } : {}),
  })
}

function renderPanel() {
  return render(<LauraAccountPanel accountId={ACCOUNT_ID} companyName="AIRBUS" onPrepare={vi.fn()} />)
}

beforeEach(() => {
  apiFetchMock.mockReset()
  NAVIGATE.mockReset()
})
afterEach(cleanup)

describe('le silence reste le comportement par défaut', () => {
  it('ne rend AUCUNE bulle quand le serveur se tait', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderPanel()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByTestId('laura-account-suggestion')).toBeNull()
    // …mais la porte reste ouverte : poser une question n'est pas une
    // interruption, c'est un geste de l'utilisateur.
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('ne rend AUCUNE bulle quand la demande échoue — jamais « Laura est indisponible »', async () => {
    apiFetchMock.mockRejectedValue(new Error('réseau'))
    renderPanel()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByTestId('laura-account-suggestion')).toBeNull()
  })

  it('nomme le COMPTE au serveur — c’est ce qui laisse la carte de coin muette', async () => {
    speaks()
    renderPanel()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/laura/plan',
        body: expect.objectContaining({ accountId: ACCOUNT_ID, surface: 'block' }),
      }),
    )
  })
})

describe('« Pourquoi cette suggestion ? » rend les faits ET leurs sources', () => {
  it('n’expose rien tant qu’on ne le demande pas, puis expose tout', async () => {
    speaks()
    renderPanel()
    const why = await screen.findByRole('button', { name: /Pourquoi cette suggestion/i })
    expect(screen.queryByText('Site carrières du groupe')).toBeNull()

    fireEvent.click(why)
    expect(screen.getByText('Deux postes Méthodes ouverts sur le site de Toulouse')).toBeInTheDocument()
    expect(screen.getByText(/Site carrières du groupe/)).toBeInTheDocument()
    // La DATE fait partie de la provenance — une source sans date ne se vérifie
    // pas, elle se croit.
    expect(screen.getByText(/2026-07-21/)).toBeInTheDocument()
  })

  it('DIT qu’une source est absente plutôt que d’en inventer une', async () => {
    speaks({
      ...SUGGESTION,
      facts: [{ ...SUGGESTION.facts[0]!, source: null, observedOn: null }],
    })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Pourquoi cette suggestion/i }))
    expect(screen.getByText(/Source non renseignée/i)).toBeInTheDocument()
  })

  it('se referme — la décomposition est une réponse, pas un état permanent', async () => {
    speaks()
    renderPanel()
    const why = await screen.findByRole('button', { name: /Pourquoi cette suggestion/i })
    fireEvent.click(why)
    fireEvent.click(why)
    expect(screen.queryByText('Site carrières du groupe')).toBeNull()
  })
})

describe('la ressource disponible — « pas mesuré » n’est jamais « 0 »', () => {
  it('se TAIT quand le vivier n’a pas pu être lu', async () => {
    speaks({ ...SUGGESTION, resource: { state: 'unmeasured', reason: 'talent_pool_unreadable' } })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Pourquoi cette suggestion/i }))
    // Aucun chiffre : ni « 0 », ni un total inventé.
    expect(screen.queryByTestId('laura-account-resource')).toBeNull()
    expect(screen.getByText(/vivier n’a pas pu être lu/i)).toBeInTheDocument()
  })

  it('dit ZÉRO quand le vivier est lisible et vide — et combien de fiches se taisent', async () => {
    speaks({ ...SUGGESTION, resource: { state: 'measured', availableNow: 0, undeclared: 12 } })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Pourquoi cette suggestion/i }))
    const resource = screen.getByTestId('laura-account-resource')
    expect(resource.textContent).toMatch(/0/)
    expect(resource.textContent).toMatch(/12/)
  })
})

describe('« Préparer » prépare — et rien de plus', () => {
  it('enregistre la réaction et ouvre le plan, sans jamais rien envoyer', async () => {
    speaks()
    const onPrepare = vi.fn()
    render(<LauraAccountPanel accountId={ACCOUNT_ID} companyName="AIRBUS" onPrepare={onPrepare} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Préparer$/i }))

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/laura/interventions/trace-1/reaction',
          body: { reaction: 'acted' },
        }),
      ),
    )
    expect(onPrepare).toHaveBeenCalled()
    // Aucun appel d'envoi : le copilote prépare, le commercial envoie.
    const paths = apiFetchMock.mock.calls.map(call => String((call[0] as { path: string }).path))
    expect(paths.some(path => /send|email|message/i.test(path))).toBe(false)
  })

  it('« Pas maintenant » refuse la PROPOSITION — pas Laura', async () => {
    speaks()
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Pas maintenant/i }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(expect.objectContaining({ body: { reaction: 'refused' } })),
    )
  })
})

describe('la question part au copilote — jamais dans un second fil', () => {
  it('ouvre le copilote AVEC le compte, en PRÉ-REMPLISSANT sans envoyer', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderPanel()
    const field = await screen.findByRole('textbox')
    fireEvent.change(field, { target: { value: 'Qui contacter en premier ?' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)

    expect(NAVIGATE).toHaveBeenCalledWith({
      to: '/chat',
      // `prompt` PRÉ-REMPLIT et n'envoie pas : le commercial relit. `ask`
      // enverrait, et il est réservé à la bibliothèque de commandes, où la
      // phrase exacte est affichée avant le clic.
      search: expect.objectContaining({ accountId: ACCOUNT_ID, prompt: 'Qui contacter en premier ?' }),
    })
    expect(NAVIGATE.mock.calls[0]?.[0]?.search).not.toHaveProperty('ask')
  })

  it('une question vide ne va nulle part', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderPanel()
    const field = await screen.findByRole('textbox')
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    expect(NAVIGATE).not.toHaveBeenCalled()
  })
})

describe('#2123.49-.56 — « Travailler ce compte avec Laura » : des suggestions qui savent déjà de quoi on parle', () => {
  function renderWithContext(props: { perimeter?: string | null; sourceCount?: number | null } = {}) {
    return render(
      <LauraAccountPanel
        accountId={ACCOUNT_ID}
        companyName="AIRBUS"
        onPrepare={vi.fn()}
        originSection="Vue d’ensemble"
        perimeter={'perimeter' in props ? props.perimeter : 'Cellule méthodes du site de Toulouse'}
        sourceCount={'sourceCount' in props ? props.sourceCount : 4}
      />,
    )
  }

  it('#2123.49 — le module porte son titre, même quand Laura se tait', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderWithContext()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: 'Travailler ce compte avec Laura' })).toBeInTheDocument()
  })

  it('#2123.50/.52/.53/.54/.55 — les cinq suggestions sont là, même quand Laura se tait', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderWithContext()
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    for (const label of [
      'Résume-moi la stratégie',
      'Trouve une autre porte d’entrée',
      'Prépare le premier message',
      'Compare ce compte à une référence',
      'Transforme cette recommandation en plan',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('#2123.56 — un clic ouvre Laura sur le compte, avec section, périmètre, sources et question pré-remplie', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderWithContext()
    fireEvent.click(await screen.findByRole('button', { name: 'Prépare le premier message' }))

    expect(NAVIGATE).toHaveBeenCalledTimes(1)
    const { to, search } = NAVIGATE.mock.calls[0]![0] as {
      to: string
      search: { accountId: string; prompt: string; ask?: string; context: LauraPageContext }
    }
    expect(to).toBe('/chat')
    expect(search.accountId).toBe(ACCOUNT_ID)
    // PRÉ-REMPLIT, n'envoie pas : le commercial relit avant d'envoyer.
    expect(search.prompt).toContain('Prépare le premier message')
    expect(search.prompt).toContain('AIRBUS')
    expect(search.ask).toBeUndefined()
    // Le contexte est celui du CONTRAT : l'écran /chat le relit avec le schéma.
    expect(lauraPageContextSchema.safeParse(search.context).success).toBe(true)
    expect(search.context).toMatchObject({ kind: 'account', entityId: ACCOUNT_ID, label: 'AIRBUS', state: 'ready' })
    const values = search.context.facets.map(facet => facet.value)
    expect(values).toContain('Vue d’ensemble')
    expect(values).toContain('Cellule méthodes du site de Toulouse')
    expect(values.some(value => /4 sources/.test(value))).toBe(true)
    // Aucun chemin d'envoi : ouvrir Laura ne part nulle part.
    const paths = apiFetchMock.mock.calls.map(call => String((call[0] as { path: string }).path))
    expect(paths.some(path => /send|email|message/i.test(path))).toBe(false)
  })

  it('#2123.56 — un périmètre ou des sources NON MESURÉS ne partent pas : ni vide, ni « 0 »', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderWithContext({ perimeter: null, sourceCount: null })
    fireEvent.click(await screen.findByRole('button', { name: 'Résume-moi la stratégie' }))

    const { search } = NAVIGATE.mock.calls[0]![0] as { search: { context: LauraPageContext } }
    expect(search.context.facets.map(facet => facet.value)).toEqual(['Vue d’ensemble'])
  })

  it('#2123.51 — « pourquoi ce compte est prudent » ne se propose QUE sur un verdict PRUDENT', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    render(<LauraAccountPanel accountId={ACCOUNT_ID} companyName="AIRBUS" onPrepare={vi.fn()} verdict="PRUDENT" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Explique pourquoi ce compte est prudent' }))
    const { search } = NAVIGATE.mock.calls[0]![0] as { search: { prompt: string; ask?: string } }
    expect(search.prompt).toContain('Explique pourquoi ce compte est prudent')
    expect(search.ask).toBeUndefined()
  })

  it('#2123.51 — témoin : sur un GO, un NO-GO ou un verdict non lu, la question serait fausse et ne se propose pas', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    for (const verdict of ['GO', 'NO-GO', 'EXPLORER', null] as const) {
      const { unmount } = render(
        <LauraAccountPanel accountId={ACCOUNT_ID} companyName="AIRBUS" onPrepare={vi.fn()} verdict={verdict} />,
      )
      await screen.findByRole('button', { name: 'Résume-moi la stratégie' })
      expect(screen.queryByRole('button', { name: 'Explique pourquoi ce compte est prudent' })).toBeNull()
      unmount()
    }
  })

  it('témoin : la question libre porte le même contexte que les suggestions', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderWithContext()
    const field = await screen.findByRole('textbox')
    fireEvent.change(field, { target: { value: 'Qui contacter en premier ?' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)

    const { search } = NAVIGATE.mock.calls[0]![0] as { search: { prompt: string; context: LauraPageContext } }
    expect(search.prompt).toBe('Qui contacter en premier ?')
    expect(search.context.entityId).toBe(ACCOUNT_ID)
  })

  /**
   * #2583 — mesuré en production (recette du 18/09) : `scrollWidth=302` pour un
   * `offsetWidth=238` sur `[role="group"]`, et trois boutons dont le bord droit
   * dépasse celui du panneau ("Explique pourquoi ce compte est prudent",
   * "Compare ce compte à une référence", "Transforme cette recommandation en
   * plan"). La cause N'EST PAS le titre du panneau (déjà protégé par
   * `min-w-0` sur toute la chaîne) : c'est `shrink-0`, posé SANS CONDITION par
   * `buttonVariants` (`packages/ui/src/components/button.tsx`). Le
   * `className="h-auto min-w-0 whitespace-normal text-left"` de ce fichier
   * ajoute `whitespace-normal` (qui gagne sur `whitespace-nowrap` via
   * tailwind-merge) mais ne touche jamais à `flex-shrink` : un item qui ne
   * PEUT jamais rétrécir garde sa largeur MAX-CONTENT (une seule ligne), donc
   * `whitespace-normal` n'a jamais l'occasion de faire son travail — le texte
   * ne wrap pas, le bouton déborde du panneau de 280 px.
   */
  it('#2583 — les boutons de suggestion peuvent rétrécir : `shrink-0` du Bouton partagé ne doit pas survivre', async () => {
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'cap_reached' })
    renderWithContext()
    const group = await screen.findByRole('group', { name: 'Ce que Laura peut préparer sur ce compte' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      // Tokens exacts, pas une regex sur la chaîne entière : le Bouton porte
      // aussi `[&_svg]:shrink-0` (l'icône, pas le bouton) — un `.toMatch`
      // brut y matcherait à tort et rendrait ce test aveugle au vrai défaut.
      expect(button.className.split(/\s+/)).not.toContain('shrink-0')
    }
  })
})

// #3939.3 — la douleur sourcée et DATÉE : sa phrase, son âge, aucune source nommée, aucun vivier.
describe('#3939.3 — Laura propose une douleur sourcée sur le dossier', () => {
  const PAIN_INTERVENTION = LAURA_INTERVENTIONS.find(
    entry => entry.key === ACCOUNT_PAIN_INTERVENTION_KEY,
  ) as InterventionDefinition
  const now = new Date()
  const twelveDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 12))
    .toISOString()
    .slice(0, 10)
  const PAIN: AccountSuggestion = {
    accountId: ACCOUNT_ID,
    facts: [
      {
        kind: 'pain_hypothesis',
        statement: 'Arbitrage budgétaire avant le plan',
        source: null,
        observedOn: null,
        count: null,
      },
      {
        kind: 'pain_signal',
        statement: 'Plan stratégique annoncé',
        source: null,
        observedOn: twelveDaysAgo,
        count: null,
      },
    ],
    resource: null,
  }

  function painSpeaks(): void {
    apiFetchMock.mockResolvedValue({
      speaks: true,
      intervention: PAIN_INTERVENTION,
      priority: 70,
      traceId: 'trace-2',
      accountSuggestion: PAIN,
    })
  }

  it('compose la phrase depuis l’HYPOTHÈSE, jamais depuis le recrutement', async () => {
    painSpeaks()
    renderPanel()
    const bubble = await screen.findByTestId('laura-account-suggestion')
    expect(within(bubble).getByText(/une douleur se dessine — Arbitrage budgétaire avant le plan/)).toBeInTheDocument()
    expect(within(bubble).queryByText(/vivier/)).toBeNull()
  })

  it('« Pourquoi ? » dit l’ÂGE du signal, ne nomme aucune source et ne mesure aucun vivier', async () => {
    painSpeaks()
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Pourquoi cette suggestion/i }))
    expect(screen.getByText('Plan stratégique annoncé')).toBeInTheDocument()
    expect(screen.getByText(`Observé il y a 12 jours (${twelveDaysAgo})`)).toBeInTheDocument()
    expect(screen.queryByText(/Source non renseignée/i)).toBeNull()
    expect(screen.queryByTestId('laura-account-resource')).toBeNull()
    expect(screen.queryByText(/vivier n’a pas pu être lu/)).toBeNull()
  })
})
