import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PlanItemFacts } from './PlanItemFacts'
import { planItem } from './planItem.fixture'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={params ? to.replace(/\$\w+/, Object.values(params)[0] ?? '') : to}>{children}</a>
  ),
}))

/**
 * #2123.1-.10, .21-.33, .35 — la ligne d'une action du plan affiche raison,
 * objet visé, contact, dépendance, source, confiance, coût et statut. Le
 * constat de recette était qu'AUCUN ne s'affichait : ce test rend les deux
 * extrêmes, la ligne vide et la ligne complète.
 */
describe('PlanItemFacts', () => {
  it('NOMME chaque champ absent — jamais un « 0 », jamais un pourcentage', () => {
    const { container } = render(<PlanItemFacts item={planItem()} items={[]} />)

    expect(screen.getByText('À faire')).toBeInTheDocument()
    // #3416 — « À vérifier d'abord : l'objet visé » et « Objet visé : non renseigné »
    // disaient la même chose sur la même ligne : on n'en garde qu'une (la consigne).
    expect(screen.queryByText('Objet visé : non renseigné')).not.toBeInTheDocument()
    expect(screen.getByText("À vérifier d'abord : l'objet visé")).toBeInTheDocument()
    expect(screen.getByText('Aucun contact lié')).toBeInTheDocument()
    expect(screen.getByText('Source non conservée')).toBeInTheDocument()
    expect(screen.getByText('Confiance non renseignée')).toBeInTheDocument()
    expect(screen.queryByText('Coût non renseigné')).toBeNull()
    expect(container.textContent).not.toMatch(/\b0\b|%/)
  })

  it('rend la ligne complète et lie la page propriétaire de l’objet', () => {
    // #2317.9 — la dépendance est FAITE : rien à bloquer, la puce reste
    // la simple mention « Après : … » (voir le test dédié juste après pour
    // le cas bloqué).
    const before = planItem({ id: 'i1', label: 'Qualifier le périmètre', execution_status: 'done', done: true })
    const item = planItem({
      id: 'i2',
      execution_status: 'done',
      target: { kind: 'contact', id: 'c1', label: 'Marc Dubois' },
      contact_id: 'c1',
      depends_on_item_id: 'i1',
      provenance: { source: 'model', at: '2026-09-12T08:00:00.000Z' },
      confidence: 'medium',
      cost_credits: 2,
      reason: 'Deux postes ouverts à la DSI',
    })
    render(<PlanItemFacts item={item} items={[before, item]} />)

    expect(screen.getByText('Exécutée')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contact : Marc Dubois' })).toHaveAttribute('href', '/contacts/c1')
    expect(screen.getByText('Page : Contacts')).toBeInTheDocument()
    expect(screen.getByText('Après : Qualifier le périmètre')).toBeInTheDocument()
    expect(screen.getByText(/Hypothèse à valider · 12/)).toBeInTheDocument()
    expect(screen.getByText('Confiance moyenne')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cr[ée]dit/i)
    expect(screen.getByText('Pourquoi : Deux postes ouverts à la DSI')).toBeInTheDocument()
    // L'objet visé EST le contact : le nommer deux fois serait la même chose
    // sous la même forme (loi 4), et rien ne manque à vérifier.
    expect(screen.queryByText('Aucun contact lié')).toBeNull()
    expect(screen.queryByText(/À vérifier d'abord/)).toBeNull()
  })

  it('#2317.15 — nomme le NO-GO : non cliquable, non attribuée, sans date ni résultat attendu', () => {
    render(<PlanItemFacts item={planItem()} items={[]} />)

    expect(screen.getByText('NO-GO : non cliquable')).toBeInTheDocument()
    expect(screen.getByText('NO-GO : non attribuée')).toBeInTheDocument()
    expect(screen.getByText('NO-GO : sans date ni résultat attendu')).toBeInTheDocument()
  })

  it('#2317.15 — aucune puce NO-GO quand la recommandation est complète', () => {
    render(
      <PlanItemFacts
        item={planItem({
          target: { kind: 'contact', id: 'c1', label: 'Marc Dubois' },
          contact_id: 'c1',
          owner_name: 'Sophie',
          due_date: '2026-10-01',
        })}
        items={[]}
      />,
    )

    expect(screen.queryByText(/NO-GO/)).toBeNull()
  })

  it('#2317.9 — nomme le blocage tant que la dépendance n’est pas faite', () => {
    const before = planItem({ id: 'i1', label: 'Qualifier le périmètre' })
    const item = planItem({ id: 'i2', depends_on_item_id: 'i1' })
    render(<PlanItemFacts item={item} items={[before, item]} />)

    expect(screen.getByText('Bloquée : en attente de « Qualifier le périmètre »')).toBeInTheDocument()
    expect(screen.queryByText('Après : Qualifier le périmètre')).toBeNull()
  })

  it('#2123.37 / .41 — nomme « Préparée » et « Exécutée »', () => {
    const { rerender } = render(<PlanItemFacts item={planItem({ execution_status: 'prepared' })} items={[]} />)
    expect(screen.getByText('Préparée')).toBeInTheDocument()

    rerender(<PlanItemFacts item={planItem({ execution_status: 'done', done: true })} items={[]} />)
    expect(screen.getByText('Exécutée')).toBeInTheDocument()
  })

  /**
   * #2396.1 — RÉFUTÉ en prod (23/09) : `completion_mode` était persisté côté
   * serveur (manuel, preuve, événement, proposé) mais aucun composant web ne
   * le lisait — une action cochée ne montrait jamais COMMENT elle l'avait été.
   */
  describe('le mode de complétion (#2396.1)', () => {
    it('une action non faite ne montre aucun mode — rien à signaler, pas un « 0 »', () => {
      render(<PlanItemFacts item={planItem()} items={[]} />)
      expect(
        screen.queryByText(/Cochée manuellement|Complétée par preuve|Complétée par un événement|proposée/i),
      ).toBeNull()
    })

    it('une action faite MANUELLEMENT le dit', () => {
      render(<PlanItemFacts item={planItem({ execution_status: 'done', completion_mode: 'manual' })} items={[]} />)
      expect(screen.getByText('Cochée manuellement')).toBeInTheDocument()
    })

    it('une action faite PAR PREUVE le dit — distinct d’un geste manuel', () => {
      render(<PlanItemFacts item={planItem({ execution_status: 'done', completion_mode: 'proof' })} items={[]} />)
      expect(screen.getByText('Complétée par preuve')).toBeInTheDocument()
      expect(screen.queryByText('Cochée manuellement')).toBeNull()
    })

    it('une action faite dont le mode est ANTÉRIEUR à la colonne (`null`) ne ment pas — aucune ligne', () => {
      render(<PlanItemFacts item={planItem({ execution_status: 'done', completion_mode: null })} items={[]} />)
      expect(
        screen.queryByText(/Cochée manuellement|Complétée par preuve|Complétée par un événement|proposée/i),
      ).toBeNull()
    })
  })

  /**
   * #2153.57 — le RÉSULTAT, distinct de l'attendu. Purement déclaratif :
   * aucune affordance d'édition sans `onSetResult` (lecture seule ailleurs
   * qu'`ActionPlanBoard`), et une saisie blanche efface plutôt que
   * d'enregistrer une phrase vide.
   */
  describe('le résultat (#2153.57)', () => {
    it('nomme « Résultat non renseigné » — jamais un « 0 » ni un blanc', () => {
      render(<PlanItemFacts item={planItem()} items={[]} />)
      expect(screen.getByText('Résultat non renseigné')).toBeInTheDocument()
    })

    it('affiche le résultat saisi', () => {
      render(<PlanItemFacts item={planItem({ result: 'Le DSI a validé le budget' })} items={[]} />)
      expect(screen.getByText('Résultat : Le DSI a validé le budget')).toBeInTheDocument()
    })

    it('n’offre AUCUNE édition sans callback — une lecture seule ne promet rien', () => {
      render(<PlanItemFacts item={planItem()} items={[]} />)
      expect(screen.queryByText('Renseigner')).toBeNull()
    })

    it('enregistre la saisie détourée, via le callback fourni', async () => {
      const user = userEvent.setup()
      const onSetResult = vi.fn()
      render(<PlanItemFacts item={planItem()} items={[]} onSetResult={onSetResult} />)

      await user.click(screen.getByText('Renseigner'))
      await user.type(screen.getByLabelText("Résultat de l'action"), '  Le DSI a validé le budget  ')
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

      expect(onSetResult).toHaveBeenCalledWith('Le DSI a validé le budget')
    })

    it('efface sur une saisie blanche — jamais une phrase vide enregistrée', async () => {
      const user = userEvent.setup()
      const onSetResult = vi.fn()
      render(<PlanItemFacts item={planItem({ result: 'Ancien résultat' })} items={[]} onSetResult={onSetResult} />)

      await user.click(screen.getByText('Renseigner'))
      const input = screen.getByLabelText("Résultat de l'action")
      await user.clear(input)
      await user.type(input, '   ')
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

      expect(onSetResult).toHaveBeenCalledWith(null)
    })
  })

  it('#3416 — une action faite montre l’issue choisie, y compris les quatre ajoutées à la recette', () => {
    const done = (outcome: 'blocked_by_procurement' | 'blocked_by_margin' | 'technical_error' | 'abandoned') =>
      planItem({ execution_status: 'done', done: true, outcome })
    const labels = {
      blocked_by_procurement: 'Bloqué par les achats',
      blocked_by_margin: 'Bloqué par la marge',
      technical_error: 'Erreur technique',
      abandoned: 'Abandonné',
    } as const
    for (const [outcome, label] of Object.entries(labels) as [keyof typeof labels, string][]) {
      const { unmount } = render(<PlanItemFacts item={done(outcome)} items={[]} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('#3416 — une action PAS faite ne montre aucune issue (une absence ne fait aucune puce)', () => {
    render(<PlanItemFacts item={planItem({ outcome: 'positive' })} items={[]} />)
    expect(screen.queryByText('Positif')).not.toBeInTheDocument()
  })

  // #3416.1 — douze puces sur une ligne faite : 4 visibles (statut/issue d'abord),
  // le reste derrière « +N » ; NO-GO et confiance rangés dans le détail déplié.
  it('#3416.1 — plafonne à 4 puces visibles, « +N » déplie le reste', async () => {
    const user = userEvent.setup()
    const before = planItem({ id: 'i1', label: 'Qualifier', execution_status: 'done', done: true })
    const item = planItem({
      id: 'i2',
      execution_status: 'done',
      done: true,
      completion_mode: 'manual',
      outcome: 'technical_error',
      target: { kind: 'contact', id: 'c1', label: 'Marc Dubois' },
      contact_id: 'c1',
      depends_on_item_id: 'i1',
      provenance: { source: 'model', at: '2026-09-12T08:00:00.000Z' },
      confidence: 'medium',
      cost_credits: 2,
      result: 'Budget validé',
    })
    render(<PlanItemFacts item={item} items={[before, item]} />)
    const list = screen.getByRole('list')
    const chips = () =>
      within(list)
        .getAllByRole('listitem', { hidden: true })
        .filter(li => !li.querySelector('button[aria-expanded]'))
    const visible = () => chips().filter(li => !li.hasAttribute('hidden'))
    const total = chips().length
    expect(visible()).toHaveLength(4)
    expect(screen.getByText('Erreur technique')).toBeVisible()
    expect(screen.getByText('Confiance moyenne')).not.toBeVisible()
    const toggle = screen.getByRole('button', { name: /autres faits/ })
    // #3416 — « +8 » seul n'expliquait rien : « +8 autres », et une cible de 44 px au pointeur fin.
    expect(toggle).toHaveTextContent('+7 autres')
    expect(toggle.className).toMatch(/(?:^|\s)min-h-11(?:\s|$)/)
    expect(toggle.className).toMatch(/(?:^|\s)min-w-11(?:\s|$)/)
    expect(total).toBe(11)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(visible()).toHaveLength(total)
    expect(screen.getByText('Confiance moyenne')).toBeVisible()
    expect(screen.getByRole('button', { name: /Masquer/ })).toHaveAttribute('aria-expanded', 'true')
  })

  describe('#3287 (#3265.2) — origine, règle, arrêt et exécution externe', () => {
    it('dit l’origine et la condition d’arrêt en DEUX phrases, pas en puces de plus', () => {
      const item = planItem({
        source_recommendation: 'renewal_decision',
        method_rule: 'couverture_multi_roles_niveaux_entites',
        external_execution_id: 'evt-1',
        stop_condition: 'Le renouvellement est décidé.',
      })
      const { container } = render(<PlanItemFacts item={item} items={[]} />)
      expect(
        screen.getByText(
          'Origine : décision de renouvellement · Règle de méthode : couverture multi-rôles · Événement d’agenda créé',
        ),
      ).toBeInTheDocument()
      expect(screen.getByText('S’arrête quand : Le renouvellement est décidé.')).toBeInTheDocument()
      // Aucune puce (`li`) ajoutée par ces champs : le nombre de puces est celui d'une ligne sans eux.
      const baseline = render(<PlanItemFacts item={planItem()} items={[]} />).container
      expect(container.querySelectorAll('li').length).toBe(baseline.querySelectorAll('li').length)
    })

    it('NON — rien de posé, aucune ligne (une absence ne fait pas de ligne)', () => {
      const { container } = render(<PlanItemFacts item={planItem()} items={[]} />)
      expect(container.textContent).not.toMatch(/Origine|Règle de méthode|S’arrête quand|agenda/)
    })

    it('NON — une clé inconnue n’est jamais affichée brute', () => {
      const { container } = render(
        <PlanItemFacts item={planItem({ source_recommendation: 'cle_interne_inconnue' })} items={[]} />,
      )
      expect(container.textContent).not.toContain('cle_interne_inconnue')
      expect(container.textContent).not.toMatch(/Origine/)
    })
  })
})
