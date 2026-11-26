import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Account } from '@bellum/contracts'
import type { ReactElement } from 'react'
import { i18n } from '@/i18n'
import { RelaunchImpactNote, RelaunchImpactTooltip } from './RelaunchImpact'

/**
 * #2117.35 — l'infobulle lit désormais le plan de lancement du SERVEUR pour
 * annoncer le coût : il lui faut donc un `QueryClient`. La requête ne part que
 * quand la bulle s'ouvre, et sans réponse l'écran retombe sur la grille
 * canonique — c'est ce repli que ces tests observent (aucun réseau n'est
 * simulé ici).
 */
function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const account = {
  id: '00000000-0000-0000-0000-0000000000aa',
  company_name: 'ACME Corp',
  siren: '123456789',
  status: 'completed',
} as unknown as Account

/**
 * #1133 — « En espérant que ça n'écrase pas les infos. »
 *
 * La garantie EXISTE dans le code ; elle ne se lisait nulle part au moment du
 * clic. Ces tests gardent la réponse à SA place — au survol du bouton qui pose
 * la question — et gardent surtout qu'elle n'affirme que ce qui est tenu.
 */
describe('RelaunchImpactTooltip — ce que « Actualiser l’analyse » écrase et conserve', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  /** Radix rend le texte DEUX fois : l'infobulle visible et une copie
   *  visuellement masquée pour les lecteurs d'écran. On lit l'infobulle. */
  async function hoverTrigger() {
    renderWithQuery(
      <RelaunchImpactTooltip account={account}>
        <button type="button">Actualiser l’analyse</button>
      </RelaunchImpactTooltip>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Actualiser l’analyse' }))
    return screen.findByRole('tooltip')
  }

  it('ne dit rien tant que le bouton n’est pas survolé — l’entête reste net', () => {
    renderWithQuery(
      <RelaunchImpactTooltip account={account}>
        <button type="button">Actualiser l’analyse</button>
      </RelaunchImpactTooltip>,
    )

    expect(screen.getByRole('button', { name: 'Actualiser l’analyse' })).toBeInTheDocument()
    expect(screen.queryByText(/sans créer de doublon/)).toBeNull()
  })

  it('nomme ce qui est CONSERVÉ par une relance, au survol', async () => {
    const tooltip = await hoverTrigger()

    // Arbitré côté API (`AccountsService.arbitrate`) : un champ de fiche corrigé
    // à la main sort du patch du pipeline.
    expect(tooltip).toHaveTextContent(/corrigés à la main/)
    // `bulkInsert` fusionne par identité et ne supprime jamais une ligne.
    expect(tooltip).toHaveTextContent(/contacts déjà trouvés/)
  })

  it('nomme aussi ce qui est REFAIT — sinon « conservé » se lirait « rien ne bouge »', async () => {
    const tooltip = await hoverTrigger()

    expect(tooltip).toHaveTextContent(/l’organigramme et le plan sont refaits/)
  })

  it('dit que la relance reste sur le MÊME dossier', async () => {
    // Le doute porte aussi là-dessus : relancer empile-t-il un second compte ?
    const tooltip = await hoverTrigger()

    expect(tooltip).toHaveTextContent(/sans créer de doublon/)
  })

  it('#4463 — n’annonce AUCUN coût, seulement l’impact, avant le clic', async () => {
    const tooltip = await hoverTrigger()

    // Le chiffre n'est pas écrit dans l'écran : il vient de la grille canonique
    // (`estimateAnalysisCredits`, la même que le débit serveur) tant que le
    // plan de lancement n'a pas répondu. Ce test garde qu'un NOMBRE de crédits
    // est annoncé, pas sa valeur — la valeur appartient à la grille.
    expect(tooltip).not.toHaveTextContent(/cr[ée]dit/i)
    // L'impact reste lisible.
    expect(tooltip).toHaveTextContent(/corrigés à la main/)
  })

  it('#4463 — aucun coût non plus sur un dossier sans rien à écraser', async () => {
    renderWithQuery(
      <RelaunchImpactTooltip account={{ ...account, status: 'prospect' }}>
        <button type="button">Actualiser l’analyse</button>
      </RelaunchImpactTooltip>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Actualiser l’analyse' }))

    expect(await screen.findByRole('tooltip')).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('laisse passer le bouton tel quel tant qu’il n’y a rien à écraser', async () => {
    // Un dossier jamais analysé n'a ni fiche corrigée ni contacts : annoncer
    // « tes corrections sont conservées » parlerait de ce qui n'existe pas.
    renderWithQuery(
      <RelaunchImpactTooltip account={{ ...account, status: 'prospect' }}>
        <button type="button">Actualiser l’analyse</button>
      </RelaunchImpactTooltip>,
    )
    await userEvent.hover(screen.getByRole('button', { name: 'Actualiser l’analyse' }))

    expect(screen.queryByText(/sans créer de doublon/)).toBeNull()
  })
})

describe('RelaunchImpactNote — le repli tactile', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('garde la garantie ÉCRITE, car au doigt il n’y a pas de survol', () => {
    render(<RelaunchImpactNote status="completed" />)

    const note = screen.getByText(/sans créer de doublon/)
    expect(note).toBeInTheDocument()
    // Masquée en pointeur fin : là, c'est l'infobulle qui la porte.
    expect(note.className).toContain('hidden')
    expect(note.className).toContain('pointer-coarse:block')
  })

  it('ne promet rien tant qu’il n’y a rien à écraser', () => {
    const { container } = render(<RelaunchImpactNote status="prospect" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('se tait aussi sur un dossier en échec', () => {
    const { container } = render(<RelaunchImpactNote status="error" />)

    expect(container).toBeEmptyDOMElement()
  })
})
