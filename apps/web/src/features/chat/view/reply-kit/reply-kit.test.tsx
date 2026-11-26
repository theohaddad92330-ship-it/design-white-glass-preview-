import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Lightbulb } from 'lucide-react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import {
  ReplyActionBlock,
  ReplyBasis,
  ReplyCardGrid,
  ReplyCautionBanner,
  ReplyContextChips,
  ReplyDensityProvider,
  ReplyExpandable,
  ReplyHeader,
  ReplyInsightCard,
  ReplyMetaRow,
  ReplyObjectPill,
  ReplyPartialState,
  ReplyStatusBadge,
  ReplySummaryPanel,
  ReplyTags,
} from '.'

describe('reply-kit (#3761)', () => {
  it('le statut porte un libellé ET une icône, jamais la couleur seule', () => {
    render(<ReplyStatusBadge status="partial" label="Partielle" />)
    const badge = screen.getByText('Partielle').closest('[data-reply-status]')
    expect(badge?.getAttribute('data-reply-status')).toBe('partial')
    expect(badge?.querySelector('svg')).not.toBeNull()
  })

  it('une valeur de métadonnée absente ne fait aucune entrée — jamais 0', () => {
    const { container } = render(
      <ReplyMetaRow
        items={[
          { label: 'Comptes', value: 0 },
          { label: 'Contacts', value: null },
          { label: 'Période', value: '' },
        ]}
      />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(1)
    expect(screen.getByText('Comptes')).toBeTruthy()
    expect(screen.queryByText('Contacts')).toBeNull()
  })

  it('chips, tags : une entrée vide ne s’affiche pas, et rien du tout si tout est vide', () => {
    const { container } = render(
      <>
        <ReplyContextChips ariaLabel="Contexte" chips={[{ label: ' ' }]} />
        <ReplyTags ariaLabel="Tags" tags={['', '  ']} />
      </>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('compose en-tête, chips, carte d’insight et grille dans les deux densités', () => {
    for (const density of ['comfortable', 'compact'] as const) {
      const { container, unmount } = render(
        <ReplyDensityProvider density={density}>
          <ReplyHeader title="Cartographie" status="partial" statusLabel="Partielle">
            <ReplyContextChips ariaLabel="Contexte" chips={[{ label: 'Périmètre', value: 'Hérault' }]} />
          </ReplyHeader>
          <ReplySummaryPanel title="Synthèse">Résumé</ReplySummaryPanel>
          <ReplyCardGrid>
            <ReplyInsightCard title="Insight" icon={Lightbulb} blockType="verdict">
              Corps
            </ReplyInsightCard>
          </ReplyCardGrid>
        </ReplyDensityProvider>,
      )
      expect(screen.getByRole('group', { name: 'Insight' }).getAttribute('data-reply-block')).toBe('verdict')
      expect(container.querySelector('[data-reply-grid]')?.className.includes('md:grid-cols-2')).toBe(
        density === 'comfortable',
      )
      unmount()
    }
  })

  it('le dépliable s’annonce et se déplie', () => {
    render(<ReplyExpandable title="Détail">Contenu</ReplyExpandable>)
    const button = screen.getByRole('button', { name: /Détail/ })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Contenu')).toBeNull()
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Contenu')).toBeTruthy()
  })

  it('l’état partiel NOMME ce qui manque', () => {
    render(
      <ReplyPartialState
        title="Partiel"
        missing={[{ what: 'Date de fin de mission', how: 'la renseigner' }, { what: ' ' }]}
      />,
    )
    expect(screen.getByText('Date de fin de mission')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  // #3761.16 — MissingDataCard compose cette pièce plutôt que de bricoler sa
  // propre liste : il lui faut un rendu entièrement custom par ligne (why +
  // lien structuré), jamais une « how » en texte brut qui afficherait la
  // syntaxe markdown telle quelle.
  it('un élément manquant peut porter un détail entièrement composé, au lieu du texte « how »', () => {
    render(
      <ReplyPartialState
        title="Partiel"
        missing={[
          {
            what: 'Date de fin de mission',
            detail: <a href="/missions">Renseigne-la</a>,
          },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Renseigne-la' })).toBeTruthy()
    // Le texte générique « comment la renseigner » ne se rajoute pas en double.
    expect(screen.queryByText(/comment/i)).toBeNull()
  })

  it('le titre est OPTIONNEL : un appelant déjà titré (une carte) ne le répète pas', () => {
    const { container } = render(<ReplyPartialState missing={[{ what: 'Une donnée' }]} />)
    expect(screen.getByText('Une donnée')).toBeTruthy()
    expect(container.querySelector('[data-reply-partial]')?.getAttribute('aria-label')).toBeNull()
  })

  it('un pied (ce qui reste possible) s’affiche après la liste de ce qui manque', () => {
    render(
      <ReplyPartialState title="Partiel" missing={[{ what: 'Une donnée' }]} footer={<span>Reste possible</span>} />,
    )
    expect(screen.getByText('Reste possible')).toBeTruthy()
  })

  it('le bloc d’action n’offre jamais « envoyer » et dit que le commercial envoie', () => {
    const onValidate = vi.fn()
    render(
      <ReplyActionBlock
        title="Relance"
        description="Brouillon prêt"
        onValidate={onValidate}
        onEdit={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.queryByRole('button', { name: /envoyer|send/i })).toBeNull()
    expect(screen.getByText(/c’est toi qui envoies|you send/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Valider|Validate/ }))
    expect(onValidate).toHaveBeenCalledTimes(1)
  })

  it('une action validée ne prétend pas avoir été envoyée', () => {
    render(<ReplyActionBlock title="Relance" state="validated" />)
    expect(screen.getByText(/rien n’a été envoyé|nothing has been sent/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ReplyActionBlock : libellés de l’appelant, contenu à valider, mention remplaçable', () => {
    const onValidate = vi.fn()
    render(
      <ReplyActionBlock
        title="Ce qui va changer"
        validateLabel="Valider ces 2 changements"
        editLabel="Modifier"
        note={null}
        onValidate={onValidate}
        onEdit={() => undefined}
      >
        <ul>
          <li>Tâche A : échéance reportée</li>
        </ul>
      </ReplyActionBlock>,
    )
    expect(screen.getByText('Tâche A : échéance reportée')).toBeTruthy()
    expect(screen.queryByText(/c’est toi qui envoies|you send/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Valider ces 2 changements' }))
    expect(onValidate).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /envoyer|send/i })).toBeNull()
  })

  it('#4129.1 — ReplyActionBlock : icône, gestes de l’appelant entre valider et ignorer, rien sans geste', () => {
    const { container, rerender } = render(
      <ReplyActionBlock
        title="Action à valider"
        icon={Lightbulb}
        note={null}
        onValidate={() => undefined}
        onDismiss={() => undefined}
        extraActions={<button type="button">Copier</button>}
      />,
    )
    const names = screen.getAllByRole('button').map(button => button.textContent)
    expect(names).toEqual(['Valider la préparation', 'Copier', 'Ignorer'])
    expect(container.querySelector('[data-reply-action] svg')).not.toBeNull()
    // Une carte sans geste (état terminal rendu par l'appelant) n'a ni bouton, ni rangée vide, ni mention.
    rerender(<ReplyActionBlock title="Action à valider" note={null} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelector('[data-reply-actions]')).toBeNull()
  })

  it('ReplyBasis : le périmètre en chips, la nature et la certitude en métadonnées, rien sans mesure', () => {
    const { container, rerender } = render(
      <ReplyBasis
        basis={{
          foundations: ['workspace'],
          scope: { account: 'Acme', portfolio: { count: 6, total: 40 }, scopes: [] },
          certainty: 'medium',
          undatedFreshness: false,
        }}
      />,
    )
    expect(screen.getByRole('list', { name: /Périmètre|Scope/ }).textContent).toContain('compte Acme')
    expect(screen.getByRole('list', { name: /Périmètre|Scope/ }).textContent).toContain(
      '6 comptes du portefeuille sur 40',
    )
    expect(container.querySelector('[data-reply-meta]')?.textContent).toContain('moyenne')
    rerender(
      <ReplyBasis
        basis={{
          foundations: [],
          scope: { account: null, portfolio: null, scopes: [] },
          certainty: null,
          undatedFreshness: false,
        }}
      />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(<ReplyBasis basis={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('la pastille d’objet : lien vers un écran réel, libellé simple sinon', async () => {
    renderWithRouter(
      <>
        <ReplyObjectPill label="Acme" href="/accounts" />
        <ReplyObjectPill label="Route inventée" href="/nimporte-quoi" />
      </>,
    )
    expect(await screen.findByRole('link', { name: 'Acme' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Route inventée' })).toBeNull()
    expect(screen.getByText('Route inventée')).toBeTruthy()
  })

  it('la bannière de prudence est une note nommée', () => {
    render(<ReplyCautionBanner title="Prudence">Données partielles</ReplyCautionBanner>)
    expect(screen.getByRole('note').textContent).toContain('Données partielles')
  })
})
