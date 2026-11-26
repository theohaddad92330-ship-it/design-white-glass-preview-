import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PlanWeek } from '../../helpers/plan'
import { PlanNextMoves } from './PlanNextMoves'
import { buildPlanViewData, type NextAction, type RecommendedMovement } from './planViewData'

const movement: RecommendedMovement = {
  movement: 'top_down',
  sequence: 'sponsor → délégation → opérationnels',
  rationale: 'relation forte : entrer par le sponsor',
}

const actions: NextAction[] = [
  {
    id: 'enrichir_p1',
    chantier: 'contacts',
    label: 'Enrichir les contacts prioritaires',
    why: 'donnée manquante',
    horizon: '7j',
  },
  { id: 'envoyer_m1', chantier: 'messages', label: 'Envoyer le 1er message', why: 'contacts prêts', horizon: '30j' },
]

describe('PlanNextMoves', () => {
  it('renders the translated movement, its sequence and the ranked actions', () => {
    render(<PlanNextMoves movement={movement} nextActions={actions} />)

    expect(screen.getByText('Top-down (par le sponsor)')).toBeInTheDocument()
    expect(screen.getByText('sponsor → délégation → opérationnels')).toBeInTheDocument()
    expect(screen.getByText('Enrichir les contacts prioritaires')).toBeInTheDocument()
    expect(screen.getByText('Envoyer le 1er message')).toBeInTheDocument()
    // chantier badges resolved from i18n
    expect(screen.getByText('Contacts')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
  })

  it('#2959 — shows the computed route (named, why, and its attributes) in the same card as the movement', () => {
    render(
      <PlanNextMoves
        movement={movement}
        route={{
          route: 'partenaire',
          rationale: 'un partenaire est déjà en place sur le compte',
          details: [
            { key: 'first_door', value: 'le partenaire en place' },
            { key: 'fallback_plan', value: 'revenir au direct' },
          ],
        }}
        nextActions={[]}
      />,
    )
    expect(screen.getByText('Route recommandée')).toBeInTheDocument()
    expect(screen.getByText('Par un partenaire en place')).toBeInTheDocument()
    expect(screen.getByText('un partenaire est déjà en place sur le compte')).toBeInTheDocument()
    expect(screen.getByText('Première porte')).toBeInTheDocument()
    expect(screen.getByText('le partenaire en place')).toBeInTheDocument()
    expect(screen.getByText('Plan de repli')).toBeInTheDocument()
  })

  it('#2959 (recette 03/10) — aucun identifiant de route brut : ni dans le plan de repli, ni en route déconseillée', () => {
    render(
      <PlanNextMoves
        movement={movement}
        route={{
          route: 'partenaire',
          rationale: 'un partenaire est déjà en place',
          details: [
            {
              key: 'fallback_plan',
              value: 'repartir en direct_accessible si le partenaire ne fait pas l’introduction',
            },
            { key: 'discouraged_route', value: 'direct_accessible' },
          ],
        }}
        nextActions={[]}
      />,
    )
    expect(document.body.textContent).not.toMatch(/direct_accessible/)
    expect(
      screen.getByText('repartir en « Directement, sans détour » si le partenaire ne fait pas l’introduction'),
    ).toBeInTheDocument()
    expect(screen.getByText('« Directement, sans détour »')).toBeInTheDocument()
  })

  it('#2959 — a route alone (no movement, no action) still renders the card', () => {
    render(
      <PlanNextMoves movement={null} route={{ route: 'partenaire', rationale: 'x', details: [] }} nextActions={[]} />,
    )
    expect(screen.getByText('Route recommandée')).toBeInTheDocument()
  })

  it('falls back to the raw movement key when it is not a known enum value', () => {
    render(<PlanNextMoves movement={{ ...movement, movement: 'exotic_move' }} nextActions={[]} />)
    expect(screen.getByText('exotic_move')).toBeInTheDocument()
  })

  it('renders nothing when there is no movement and no action', () => {
    const { container } = render(<PlanNextMoves movement={null} nextActions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('groups the actions under their horizon and keeps the ranking continuous', () => {
    render(
      <PlanNextMoves
        movement={null}
        nextActions={actions}
        nextActionsByHorizon={[
          { horizon: '7j', actions: [actions[0]!] },
          { horizon: '30j', actions: [actions[1]!] },
        ]}
      />,
    )

    expect(screen.getByText('Sous 7 jours')).toBeInTheDocument()
    expect(screen.getByText('Sous 30 jours')).toBeInTheDocument()
    // Le rang ne repart pas à 1 dans le 2e bucket : la hiérarchie reste lisible.
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('falls back to the flat ranked list when the dossier carries no horizon', () => {
    render(<PlanNextMoves movement={null} nextActions={actions} />)

    expect(screen.queryByText('Sous 7 jours')).not.toBeInTheDocument()
    expect(screen.getByText('Enrichir les contacts prioritaires')).toBeInTheDocument()
    expect(screen.getByText('Envoyer le 1er message')).toBeInTheDocument()
  })

  // #2123.34 — « jamais quinze ». Le test qui sait dire NON : sans le plafond,
  // la zone rendait l'horizon entier.
  it('n’affiche JAMAIS plus de trois actions, tous horizons confondus', () => {
    const many = Array.from({ length: 15 }, (_, index) => ({
      id: `a${index}`,
      chantier: 'contacts',
      label: `Action ${index}`,
      why: '',
      horizon: '',
    }))
    render(
      <PlanNextMoves
        movement={null}
        nextActions={many}
        nextActionsByHorizon={[
          { horizon: '7j', actions: many.slice(0, 5) },
          { horizon: '30j', actions: many.slice(5, 10) },
          { horizon: '60j', actions: many.slice(10) },
        ]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  // #2959 (recette prod 03/10) — un dossier SANS clé `plan`, route posée à la racine (le cas
  // du dossier de démo Groupe BPCE) : « Route recommandée » reste visible, sans id brut.
  it('#2959 — la route d’un dossier sans clé `plan` est lue et visible, jamais d’identifiant brut', () => {
    const data = buildPlanViewData({
      demo_seed: true,
      recommendedRoute: {
        route: 'partenaire',
        rationale: 'un partenaire est déjà en place sur le compte',
        fallback_plan: 'repartir en direct_accessible si le partenaire ne fait pas l’introduction',
        discouraged_route: 'direct_accessible',
      },
    })
    render(
      <PlanNextMoves
        movement={data.recommendedMovement}
        route={data.recommendedRoute}
        nextActions={data.nextActions}
        ifNoResponse={data.ifNoResponse}
      />,
    )
    expect(screen.getByText('Route recommandée')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('direct_accessible')
  })

  // #3717.7 (reste de l'épopée #3777) — le compte déjà MESURÉ par le lot R9
  // (`planListOverlap.ts`) devient enfin visible : jamais retirée, la ligne
  // garde son texte complet, mais un compte renvoie vers le tableau.
  it('#3717.7 — nomme combien de « prochaines actions » sont déjà une ligne du tableau, sans en retirer aucune', () => {
    const planWeeks: PlanWeek[] = [
      { week: 1, title: 'Semaine 1', items: [{ text: 'Enrichir les contacts prioritaires' }] } as PlanWeek,
    ]
    render(<PlanNextMoves movement={null} nextActions={actions} planWeeks={planWeeks} />)

    expect(screen.getByText('1 sur 2 déjà suivie dans le tableau plus bas.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir le tableau' })).toHaveAttribute('href', '#action-plan-board')
    // la ligne reste entière — mesurer n'est pas retirer
    expect(screen.getByText('Enrichir les contacts prioritaires')).toBeInTheDocument()
  })

  it('#3717.7 — aucun recoupement avec le tableau : pas de note', () => {
    render(<PlanNextMoves movement={null} nextActions={actions} planWeeks={[]} />)

    expect(screen.queryByRole('link', { name: 'Voir le tableau' })).not.toBeInTheDocument()
  })

  // #3278 (recette prod 14/10) — « top_down » s'affichait brut en « Route déconseillée » : l'identifiant
  // d'un MOUVEMENT n'était pas dans la table des libellés de ROUTE. Famille : tout identifiant d'enum
  // que le moteur peut écrire (`COMMERCIAL_ROUTES` / `OPENING_MOVEMENTS`, apps/ia) a son libellé.
  it('#3278 — une route déconseillée qui est un mouvement (top_down) se lit en clair', () => {
    render(
      <PlanNextMoves
        movement={null}
        route={{
          route: 'filiale_site',
          rationale: 'grand compte complexe',
          details: [{ key: 'discouraged_route', value: 'top_down' }],
        }}
        nextActions={[]}
      />,
    )
    expect(screen.queryByText('top_down')).not.toBeInTheDocument()
    expect(screen.getByText('« Top-down (par le sponsor) »')).toBeInTheDocument()
  })

  const ENGINE_ROUTES = [
    'relation_existante',
    'reactivation',
    'direct_accessible',
    'filiale_site',
    'bottom_up',
    'middle_out',
    'sponsor',
    'rang_2',
    'partenaire',
    'prospection_inversee',
    'appel_offres',
    'expansion_client',
    'recommandation',
    'consultant_present',
    'ancien_consultant',
    'signal_entrant',
    'veille_seule',
    'depuis_talent',
    'evenement_communaute',
    'inbound_contenu',
  ]
  it.each(ENGINE_ROUTES)('#3278 — la route « %s » a un libellé, jamais son identifiant', route => {
    render(<PlanNextMoves movement={null} route={{ route, rationale: '', details: [] }} nextActions={[]} />)
    expect(screen.queryByText(route)).not.toBeInTheDocument()
  })

  const ENGINE_MOVEMENTS = [
    'bottom_up',
    'middle_out',
    'top_down',
    'sandwich',
    'rang2',
    'prospection_inversee',
    'public',
    'reactivation',
    'filiale_site',
    'referencement',
  ]
  it.each(ENGINE_MOVEMENTS)('#3278 — le mouvement « %s » a un libellé, jamais son identifiant', id => {
    render(<PlanNextMoves movement={{ movement: id, sequence: '', rationale: '' }} nextActions={[]} />)
    expect(screen.queryByText(id)).not.toBeInTheDocument()
  })
})

// #3278.b — le plan re-planifié nomme sa route ET le signal qu'il suit, daté ; sans signal, aucune ligne.
describe('PlanNextMoves — #3278.b signal suivi', () => {
  it('nomme le signal suivi et sa date, à côté de la route', () => {
    render(
      <PlanNextMoves
        movement={null}
        route={{ route: 'top_down', rationale: 'sponsor identifié', details: [] }}
        followedSignal={{ signal: 'Nouvelle DSI nommée', date: '2026-10-05', source: 'Les Échos' }}
        nextActions={actions}
      />,
    )
    expect(screen.getByText(/Signal suivi/)).toBeInTheDocument()
    expect(screen.getByText(/Nouvelle DSI nommée/)).toBeInTheDocument()
    expect(screen.getByText(/5 oct\. 2026/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON : sans signal suivi, aucune mention « Signal suivi »', () => {
    render(<PlanNextMoves movement={movement} nextActions={actions} />)
    expect(screen.queryByText(/Signal suivi/)).toBeNull()
  })

  it('la normalisation lit followedSignal du plan et ignore une valeur sans date au jour', () => {
    const ok = buildPlanViewData({ plan: { followedSignal: { signal: 'S', date: '2026-10-05' } } })
    expect(ok.followedSignal).toEqual({ signal: 'S', date: '2026-10-05', source: '' })
    const ko = buildPlanViewData({ plan: { followedSignal: { signal: 'S', date: '2026' } } })
    expect(ko.followedSignal).toBeNull()
  })
})

describe('PlanNextMoves — #3278.r42 la route cite ses preuves et « Changer d’angle » se trouve sur le bloc route', () => {
  const route = {
    route: 'filiale_site',
    rationale: 'grand compte complexe : entrer par une filiale ou un site',
    details: [
      { key: 'motivating_signal', value: 'Thales ouvre une base au Japon · Boursorama · 2026-10-12' },
      { key: 'proof', value: 'un besoin confirmé et propre au site' },
      {
        key: 'proof_cited',
        value: '2 références client publiables — source : références client de l’espace, relevé au 2026-10-17',
      },
      { key: 'channel_history', value: 'email ×3 (messages préparés sur ce compte)' },
    ],
  }

  it('nomme le signal qui motive la route, la preuve citée (source + date) et l’historique de canal', () => {
    render(<PlanNextMoves movement={null} route={route} nextActions={[]} />)
    expect(screen.getByText('Signal qui motive la route')).toBeInTheDocument()
    expect(screen.getByText(/Boursorama · 2026-10-12/)).toBeInTheDocument()
    expect(screen.getByText('Preuve citée')).toBeInTheDocument()
    expect(screen.getByText(/relevé au 2026-10-17/)).toBeInTheDocument()
    expect(screen.getByText('Historique de canal')).toBeInTheDocument()
  })

  it('le bouton « Changer d’angle » est sur le bloc route et déclenche le re-plan', async () => {
    const onChangeAngle = vi.fn()
    render(<PlanNextMoves movement={null} route={route} nextActions={[]} onChangeAngle={onChangeAngle} />)
    await userEvent.click(screen.getByRole('button', { name: /Changer d.angle/ }))
    expect(onChangeAngle).toHaveBeenCalledTimes(1)
  })

  it('SAIT DIRE NON : sans le rappel, aucun bouton', () => {
    render(<PlanNextMoves movement={null} route={route} nextActions={[]} />)
    expect(screen.queryByRole('button', { name: /Changer d.angle/ })).toBeNull()
  })
})
