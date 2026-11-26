import { deriveAccountStrategy5P, type AccountStrategy5PPartnerInput } from '@bellum/contracts'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountStrategy5PCard } from './AccountStrategy5PCard'

const strategyOf = (partners: AccountStrategy5PPartnerInput[]) =>
  deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [], partners })

describe('#3684.2/#3667.R1 — ESN citées en 5P, renvoyées vers leur ligne Partenaires', () => {
  it('une observation seule est qualifiée avec le MÊME mot que l’onglet Accès, jamais comme un partenaire confirmé', async () => {
    const strategy = strategyOf([
      { id: 'p2', name: 'Talan', rank: 'unknown', relationship: 'unknown', source: 'analysis' },
    ])
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenPartner={vi.fn()} />)
    expect(await screen.findByText('Talan')).toBeInTheDocument()
    // #3667.R1 — vocabulaire canonique `personalAccessCertainty` (access.json), le même
    // qu'Écosystème/Accès pour la même ESN ; plus jamais l'échelle maison (« Observation
    // historique — piste à vérifier ») propre à la stratégie 5P.
    expect(screen.getByText('Historique observé')).toBeInTheDocument()
    // #3684 — recette prod 09/10 : la carte répétait 3 fois la même idée
    // (action + risque + prochaine vérification). `next_check` est présent ici
    // (relation non fondée) : c'est LUI le geste, jamais les trois ensemble.
    expect(screen.getByText('À vérifier : la relation avec le client')).toBeInTheDocument()
    expect(
      screen.queryByText('Action : revérifier qu’elle tient encore, sinon ne pas l’utiliser.'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Détecté automatiquement, jamais déclaré par quelqu’un de l’équipe.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Déclarée par mon équipe')).not.toBeInTheDocument()
  })

  it('une relation déclarée porte son périmètre, UN geste, et ouvre SA ligne', async () => {
    const onOpenPartner = vi.fn()
    const strategy = strategyOf([
      { id: 'p1', name: 'CGI', rank: 'rank2', relationship: 'partner', source: 'declared', scope: 'TMA SAP' },
    ])
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenPartner={onOpenPartner} />)
    expect(await screen.findByText('Relation probable')).toBeInTheDocument()
    expect(screen.getByText('TMA SAP')).toBeInTheDocument()
    // Relation fondée (déclarée) + périmètre déjà connu : `next_check` est nul,
    // le geste retombe sur l'action générique de la certitude — UNE SEULE ligne.
    expect(screen.getByText('Action : la confirmer auprès de la personne avant de t’en prévaloir.')).toBeInTheDocument()
    expect(screen.queryByText('Non confirmé — à qualifier avant de s’en prévaloir.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voir CGI dans Partenaires' }))
    expect(onOpenPartner).toHaveBeenCalledWith('p1')
  })

  it('#3684 — la même réserve sur 5 cartes se dit UNE fois pour le bloc, aucun « À vérifier. » en tête', async () => {
    const partners: AccountStrategy5PPartnerInput[] = ['Talan', 'Alten', 'Sopra', 'Capgemini', 'Atos'].map(
      (name, i) => ({ id: `p${i}`, name, rank: 'unknown', relationship: 'unknown', source: 'analysis' }),
    )
    renderWithRouter(<AccountStrategy5PCard strategy={strategyOf(partners)} />)
    expect(await screen.findByText('Talan')).toBeInTheDocument()
    expect(screen.getAllByText('À vérifier : la relation avec le client')).toHaveLength(1)
    const passageBlock = screen.getByRole('list', { name: 'ESN citées' }).parentElement?.parentElement as HTMLElement
    expect(within(passageBlock).queryByText('À vérifier.')).not.toBeInTheDocument()
    expect(screen.getByTestId('cited-esns-shared-gesture')).toHaveTextContent('À vérifier : la relation avec le client')
  })

  it('#3684.5 — aucune ESN : « relation non documentée », pas « aucune ESN n’intervient »', async () => {
    renderWithRouter(<AccountStrategy5PCard strategy={strategyOf([])} />)
    expect(await screen.findByText('Relation non documentée')).toBeInTheDocument()
    expect(screen.queryByText(/aucune ESN/i)).not.toBeInTheDocument()
  })
})
