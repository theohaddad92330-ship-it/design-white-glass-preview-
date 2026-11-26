import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { WatchSignal } from '@/features/accounts/model/watch'
import { WatchFilters } from './WatchFilters'

/**
 * #1882 — la barre de filtres de la veille, côté ÉCRAN.
 *
 * La réparation vit dans la primitive (`packages/ui/src/components/tabs.tsx`),
 * et GA-290 l'y tient. Ce test-ci vérifie l'autre moitié, celle qu'une garde de
 * primitive ne peut pas voir : que le plancher ARRIVE bien jusqu'ici.
 *
 * C'est un motif payé plusieurs fois dans ce dépôt — « l'APPELANT neutralise le
 * composant juste, et tous les tests du composant passent ». Deux façons de le
 * perdre en une ligne, sans qu'aucun test de `tabs.tsx` ne bouge : un
 * `className="min-w-0"` passé au `TabsTrigger` (tailwind-merge garde le
 * DERNIER), ou la barre remplacée par un autre composant.
 *
 * ⚠️ jsdom ne met rien en page : il n'y a PAS de pixel à mesurer ici, et ce
 * test ne prétend pas mesurer un débordement. La mesure est ailleurs, faite
 * dans un vrai navigateur sur la production le 11/09/2026, et elle est écrite
 * au long dans GA-290 : cinq boutons de 77,7 px pour des libellés de 92,5 et
 * 83,6 px, `minWidth` calculé à « 0px ».
 */
const SIGNALS: WatchSignal[] = [
  {
    id: 'sig-1',
    category: 'recrutement',
    date: '2026-09-04',
    freshness: 'current',
    temporalStatus: 'RECENT',
    type: 'Recrutement',
    signal: 'Une offre de Business Developer est publiée.',
    source: 'Offre d’emploi datée',
    angles: [],
    actionGate: { allowed: true },
    tags: [],
    perimeter: 'ACME',
  },
  {
    id: 'sig-2',
    category: 'historique',
    date: '2026-09-02',
    freshness: 'current',
    temporalStatus: 'RECENT',
    type: 'Projet',
    signal: 'Un programme de migration est annoncé.',
    source: 'Communiqué',
    angles: [],
    actionGate: { allowed: true },
    tags: [],
    perimeter: 'ACME',
  },
]

function renderFilters() {
  return render(
    <WatchFilters signals={SIGNALS}>
      {({ filteredSignals }) => <span data-testid="count">{filteredSignals.length}</span>}
    </WatchFilters>,
  )
}

describe('#1882 — les filtres de la veille', () => {
  it('rend les cinq filtres, chacun nommé', () => {
    renderFilters()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    for (const tab of tabs) expect(tab.textContent?.trim()).not.toBe('')
  })

  it('chaque filtre garde le plancher de largeur — il ne peut pas rétrécir sous son libellé', () => {
    renderFilters()
    for (const tab of screen.getAllByRole('tab')) {
      // ⚠️ La PRIORITÉ fait partie de la règle, elle n'est pas un confort.
      // Mesuré en production le 11/09 APRÈS le premier correctif : la classe
      // était posée, sa règle générée, et `getComputedStyle` rendait quand même
      // `min-width: 0px`. `index.css:213` pose son zéro HORS couche, et un style
      // hors `@layer` bat tout ce qui vit dans une couche — la spécificité n'y
      // change rien. Sans `!`, cette garde resterait verte sur un plancher mort.
      expect(tab.className, tab.textContent ?? '').toContain('!min-w-min')
      // `min-w-0` remettrait exactement le zéro que la règle globale pose déjà
      // (`index.css:213`), et tailwind-merge garderait celui-là.
      expect(tab.className, tab.textContent ?? '').not.toMatch(/\bmin-w-0\b/)
    }
  })

  it('filtrer restreint bien la liste rendue', async () => {
    renderFilters()
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    expect(screen.getByTestId('count')).toHaveTextContent('2')
    const [, recruitments] = screen.getAllByRole('tab')
    await user.click(recruitments)
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })
})

/**
 * #2119.15 / #2119.16 — LA FENÊTRE D'ÂGE, SUR UN AXE À ELLE.
 *
 * Elle ne remplace pas les catégories, elle s'y AJOUTE : « les recrutements, et
 * seulement les actuels » est la question qu'on se pose, et une liste unique
 * l'aurait rendue impossible.
 *
 * ⚠️ Ce qui est filtré est `freshness`, la classe d'âge que l'analyse estampille
 * — pas une fenêtre en jours, que `signal.date` (chaîne libre) ne permet pas de
 * calculer sans écarter en silence ce qu'elle ne sait pas lire.
 */
describe('WatchFilters — la fenêtre d’âge (#2119.15 / #2119.16)', () => {
  const dated: WatchSignal[] = [
    { ...SIGNALS[0]!, id: 'actuel', freshness: 'current', signal: 'Signal actuel du compte' },
    { ...SIGNALS[0]!, id: 'ancien', freshness: 'archive', signal: 'Contexte ancien du compte' },
    { ...SIGNALS[0]!, id: 'sans-date', freshness: 'undated', signal: 'Signal sans âge connu' },
  ]

  function renderWindow() {
    return render(
      <WatchFilters signals={dated}>
        {({ filteredSignals }) => (
          <ul>
            {filteredSignals.map(item => (
              <li key={item.id}>{item.signal}</li>
            ))}
          </ul>
        )}
      </WatchFilters>,
    )
  }

  it('ne filtre RIEN par défaut — y compris ce dont l’âge est inconnu', () => {
    renderWindow()
    expect(screen.getByText('Signal actuel du compte')).toBeInTheDocument()
    expect(screen.getByText('Contexte ancien du compte')).toBeInTheDocument()
    expect(screen.getByText('Signal sans âge connu')).toBeInTheDocument()
  })

  it('« Contexte ancien » ne montre QUE les signaux marqués archive', async () => {
    renderWindow()
    await userEvent.click(screen.getByLabelText('Fenêtre d’âge des signaux'))
    await userEvent.click(await screen.findByRole('option', { name: 'Contexte ancien' }))

    expect(screen.getByText('Contexte ancien du compte')).toBeInTheDocument()
    // Le test qui sait dire NON : un filtre qui laisserait passer l'actuel ne
    // filtre rien, et un âge INCONNU ne se range pas d'office dans l'un des deux.
    expect(screen.queryByText('Signal actuel du compte')).toBeNull()
    expect(screen.queryByText('Signal sans âge connu')).toBeNull()
  })
})

/**
 * #4715 — « Plus importants » ordonne vraiment. L'ancien tri lisait
 * `signal.score ?? 0`, un champ que rien ne remplit : toutes les comparaisons
 * valaient 0 et l'ordre d'entrée restait. Ce test sait dire NON : l'entrée est
 * volontairement dans l'ordre INVERSE de l'importance, donc un comparateur
 * redevenu neutre laisse `low` en tête et échoue.
 */
describe('WatchFilters — le tri par importance (#4715)', () => {
  const ranked: WatchSignal[] = [
    { ...SIGNALS[0]!, id: 'archive', importance: 'low', signal: 'Signal archivé' },
    { ...SIGNALS[0]!, id: 'inconnu', importance: null, signal: 'Signal sans âge connu' },
    { ...SIGNALS[0]!, id: 'sans-source', importance: 'medium', signal: 'Signal actif sans source' },
    { ...SIGNALS[0]!, id: 'source', importance: 'high', signal: 'Signal actif et sourcé' },
  ]

  it('range high, medium, low, puis ce qui n’a pas d’importance — et « Plus récents » garde l’ordre d’entrée', async () => {
    render(
      <WatchFilters signals={ranked}>
        {({ filteredSignals }) => (
          <ul>
            {filteredSignals.map(item => (
              <li key={item.id}>{item.signal}</li>
            ))}
          </ul>
        )}
      </WatchFilters>,
    )
    const order = () => screen.getAllByRole('listitem').map(item => item.textContent)
    expect(order()[0]).toBe('Signal archivé')

    await userEvent.click(screen.getByLabelText('Trier les signaux'))
    await userEvent.click(await screen.findByRole('option', { name: 'Plus importants' }))

    expect(order()).toEqual([
      'Signal actif et sourcé',
      'Signal actif sans source',
      'Signal archivé',
      'Signal sans âge connu',
    ])
  })
})
