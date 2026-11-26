import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { apiFetch } from '@/lib/api'
import { EsnNameField } from './EsnNameField'

/**
 * #1887 — « je mets cap… ça nous met Capgemini et tout ».
 *
 * Ce qui est MESURÉ ici, et pas seulement affirmé : le nombre de requêtes
 * qu'une frappe déclenche. Le défaut de ce dépôt qu'il s'agit d'éviter — un
 * champ qui interroge le réseau une fois par touche, voire en boucle — ne se
 * REGARDE pas, il se COMPTE.
 *
 * ⚠️ Un `QueryClient` NEUF par rendu, et pas `renderWithRouter` : celui-ci
 * partage son client au niveau du MODULE, donc le cache d'un test survit au
 * suivant — et un test qui compte des requêtes n'en verrait aucune la seconde
 * fois. Ce champ n'a besoin d'aucun routeur.
 */
const fetchMock = vi.mocked(apiFetch)

/** Le champ est contrôlé : le test doit porter l'état comme l'onglet le fait. */
function Harness({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState('')
  return <EsnNameField value={value} onChange={setValue} onSubmit={onSubmit ?? (() => undefined)} />
}

/**
 * Remet le mock à zéro ET monte le champ.
 *
 * ⚠️ LA REMISE À ZÉRO EST ICI, DANS LE CORPS DU TEST — PAS DANS UN `beforeEach`.
 * Mesuré le 11/09/2026 : avec `fetchMock.mockReset()` (ou `mockClear()`) dans un
 * `beforeEach`, le test qui fait ÉCHOUER la requête tombe sur un
 * « Error: réseau » que vitest lui attribue, alors que toutes ses assertions
 * passent. Le même `mockReset()` appelé dans le corps du test ne le fait pas.
 * C'est un rouge qui ne parle pas du sujet : il se lit comme un défaut de code,
 * et il a coûté trois quarts d'heure.
 */
function mount(onSubmit?: () => void): HTMLElement {
  fetchMock.mockReset()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Harness onSubmit={onSubmit} />
    </QueryClientProvider>,
  )
  return screen.getByLabelText('Nom de l’ESN à déclarer')
}

const suggestionsFor = (...names: string[]) => ({
  suggestions: names.map(name => ({
    name,
    normalizedName: name.toLowerCase(),
    siren: null,
    city: null,
    headcountRange: null,
    parentName: null,
  })),
})

/** Tape la chaîne caractère par caractère, comme un humain le ferait. */
function type(input: HTMLElement, text: string) {
  for (let index = 1; index <= text.length; index++) {
    fireEvent.change(input, { target: { value: text.slice(0, index) } })
  }
}

describe('EsnNameField — la suggestion depuis notre référentiel', () => {
  it('propose Capgemini quand on tape « cap »', async () => {
    const input = mount()
    fetchMock.mockResolvedValue(suggestionsFor('Capgemini', 'Capgemini Invent'))

    type(input, 'cap')

    expect(await screen.findByRole('option', { name: /^Capgemini$/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Capgemini Invent/ })).toBeInTheDocument()
  })

  it('UNE SEULE requête pour une frappe de « capgemini » — neuf touches, un appel', async () => {
    const input = mount()
    fetchMock.mockResolvedValue(suggestionsFor('Capgemini'))

    type(input, 'capgemini')

    await screen.findByRole('option', { name: /Capgemini/ })
    // Neuf touches, un seul aller-retour : c'est le délai de 300 ms qui les
    // fond. Un chiffre supérieur ici veut dire que le débounce a sauté.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith({ path: '/territory/esn/suggest?q=capgemini' })
  })

  it('n’interroge RIEN sous deux caractères — et n’ouvre aucun panneau vide', async () => {
    const input = mount()
    fetchMock.mockResolvedValue(suggestionsFor())

    type(input, 'c')

    // Le délai de 300 ms plus une marge : si une requête devait partir, elle
    // serait partie. Un panneau qui clignote à chaque touche sans rien à dire
    // est pire que pas de panneau.
    await new Promise(resolve => setTimeout(resolve, 400))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/Aucune ESN de notre référentiel/)).not.toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('dit qu’aucune ESN ne correspond — et n’invente pas l’entreprise tapée', async () => {
    const input = mount()
    fetchMock.mockResolvedValue(suggestionsFor())

    type(input, 'zzzz')

    expect(await screen.findByText(/Aucune ESN de notre référentiel ne correspond/)).toBeInTheDocument()
    // La frappe ne réapparaît JAMAIS comme une proposition cliquable : ce
    // serait une création déguisée, et une entreprise inventée.
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('distingue une PANNE du référentiel de « rien ne correspond »', async () => {
    const input = mount()
    fetchMock.mockRejectedValue(new Error('réseau'))

    type(input, 'sopra')

    expect(await screen.findByText(/Le référentiel n’a pas répondu/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune ESN de notre référentiel ne correspond/)).not.toBeInTheDocument()
  })

  it('choisir une suggestion REMPLIT le champ — ça n’ajoute pas tout seul', async () => {
    const onSubmit = vi.fn()
    const input = mount(onSubmit)
    fetchMock.mockResolvedValue(suggestionsFor('Capgemini Engineering'))

    type(input, 'engi')
    fireEvent.click(await screen.findByRole('option', { name: /Capgemini Engineering/ }))

    expect(input).toHaveValue('Capgemini Engineering')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('laisse déclarer un nom que le référentiel ignore — il ne connaît pas tout le marché', () => {
    const onSubmit = vi.fn()
    const input = mount(onSubmit)
    fetchMock.mockResolvedValue(suggestionsFor())

    type(input, 'Une ESN locale')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveValue('Une ESN locale')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
