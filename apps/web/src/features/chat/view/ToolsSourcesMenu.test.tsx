import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectedClientTool } from '@bellum/contracts'
import { ToolsSourcesMenu } from './ToolsSourcesMenu'

const demo = vi.hoisted(() => ({ current: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const gmail: ConnectedClientTool = { provider: 'gmail', family: 'email', name: 'Gmail' }
const outlook: ConnectedClientTool = { provider: 'microsoft', family: 'email', name: 'Outlook' }
const hubspot: ConnectedClientTool = { provider: 'hubspot', family: 'crm', name: 'HubSpot', needsReconnect: true }

beforeEach(() => {
  demo.current = false
})

describe('#3708 — ToolsSourcesMenu', () => {
  it('ne rend rien quand rien n’est branché (hors démonstration)', () => {
    const { container } = render(<ToolsSourcesMenu tools={[]} excludedProviders={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit les deux états réels : connecté, autorisation expirée — et l’outil d’envoi ne « peut » rien de plus', () => {
    render(<ToolsSourcesMenu tools={[gmail, hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText('Gmail')).toBeInTheDocument()
    expect(screen.getByText(/autorisation expirée/i)).toBeInTheDocument()
    expect(screen.getByText(/jamais à envoyer/)).toBeInTheDocument()
  })

  it('#5048 — la forme V8 : « Outils de cette conversation », lignes en lecture seule, aucune case', () => {
    render(<ToolsSourcesMenu tools={[gmail, outlook]} excludedProviders={['microsoft']} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText('Outils de cette conversation')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText('Lu dans cette conversation')).toBeInTheDocument()
    expect(screen.getByText('Écarté de cette conversation')).toBeInTheDocument()
  })

  it('#5048 — un outil « à reconnecter » mène à /integrations, il ne se reconnecte pas ici', () => {
    render(<ToolsSourcesMenu tools={[gmail, hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByRole('link', { name: 'À reconnecter' })).toHaveAttribute('href', '/integrations')
    expect(screen.getAllByRole('link', { name: 'À reconnecter' })).toHaveLength(1)
  })

  it('#5046 — « ne déconnecte aucun compte » est au PIED, après la liste, pas dans l’en-tête', () => {
    render(<ToolsSourcesMenu tools={[gmail]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    const mention = screen.getByText(/ne déconnecte aucun compte/)
    const list = screen.getByRole('list')
    expect(list.compareDocumentPosition(mention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/Les puces au-dessus de la saisie/).textContent).not.toMatch(/déconnecte/)
  })

  it('le résumé discret donne le nombre sélectionné', () => {
    render(<ToolsSourcesMenu tools={[gmail, hubspot]} excludedProviders={['hubspot']} />)
    expect(screen.getByRole('button', { name: /outils et sources · 1\/2/i })).toBeInTheDocument()
  })

  it('une famille encore lue via un autre outil le dit, il ne fait pas semblant d’avoir exclu', () => {
    render(<ToolsSourcesMenu tools={[gmail, outlook]} excludedProviders={['gmail']} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText(/Reste lu via Outlook/)).toBeInTheDocument()
  })

  it('#3973 — décocher l’agenda Google dit que l’agenda reste lu via Outlook (qui sert aussi l’agenda)', () => {
    const googleCalendar: ConnectedClientTool = {
      provider: 'google-calendar',
      family: 'calendar',
      name: 'Google Agenda',
    }
    const microsoft: ConnectedClientTool = { ...outlook, additional_families: ['calendar'] }
    render(<ToolsSourcesMenu tools={[googleCalendar, microsoft]} excludedProviders={['google-calendar']} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText(/Reste lu via Outlook/)).toBeInTheDocument()
  })

  it('#3973 — sait dire NON : décocher Outlook ne se dit pas « encore lu » si son agenda ne l’est plus', () => {
    const microsoft: ConnectedClientTool = { ...outlook, additional_families: ['calendar'] }
    render(<ToolsSourcesMenu tools={[gmail, microsoft]} excludedProviders={['microsoft']} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.queryByText(/Reste lu via/)).not.toBeInTheDocument()
  })

  it('la gestion complète des connexions reste Réglages › Intégrations (aucune seconde version)', () => {
    render(<ToolsSourcesMenu tools={[gmail]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByRole('link', { name: /gérer les connexions/i })).toHaveAttribute('href', '/integrations')
  })

  it('démonstration : l’entrée reste visible et dit honnêtement qu’aucune source n’est consultée', () => {
    demo.current = true
    render(<ToolsSourcesMenu tools={[]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText(/aucun outil n'est branché/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('G.6 — démonstration AVEC les outils d’overlay (Gmail, HubSpot) : la note reste là, hors démo elle n’y est pas', () => {
    demo.current = true
    const { unmount } = render(<ToolsSourcesMenu tools={[gmail, hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText(/Salle de démonstration : aucun outil n'est branché/)).toBeInTheDocument()
    unmount()
    demo.current = false
    render(<ToolsSourcesMenu tools={[gmail, hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.queryByText(/Salle de démonstration/)).not.toBeInTheDocument()
  })

  it('#3708.2 — « accès limité » est dit à part, et ne promet ni envoi ni écriture', () => {
    const limited: ConnectedClientTool = { provider: 'gmail', family: 'email', name: 'Gmail', limited: true }
    render(<ToolsSourcesMenu tools={[limited, hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText(/accès limité/i)).toBeInTheDocument()
    expect(screen.getByText(/autorisation expirée/i)).toBeInTheDocument()
    expect(screen.queryAllByText(/^Connecté$/)).toHaveLength(0)
  })

  it('#3708.2 — « non connecté » nomme des BESOINS (familles), n’ajoute aucune case et aucun éditeur', () => {
    render(<ToolsSourcesMenu tools={[gmail]} unconnectedFamilies={['crm', 'calendar']} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText(/non connecté/i)).toHaveTextContent(/ton CRM/)
    expect(screen.getByText(/non connecté/i)).toHaveTextContent(/ton agenda/)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/HubSpot|Salesforce/)).toBeNull()
  })

  it('#3708.2 — aucune famille non connectée : aucune ligne « non connecté »', () => {
    render(<ToolsSourcesMenu tools={[gmail]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.queryByText(/non connecté/i)).toBeNull()
  })
})

/**
 * #3774.3.1 — le menu nommait logo, nom et état de connexion, mais pas les
 * capacités RÉELLES (PDF 7 §1/§2) : « HubSpot — connecté » ne dit pas si
 * Laura peut y ÉCRIRE un contact ou seulement le lire. `connectedClientTools`
 * (`tool-naming.ts`) les expose désormais ; ce menu les affiche, nommées par
 * leur clé — jamais devinées, jamais une capacité non VÉRIFIÉE.
 */
describe('#3774.3.1 — les capacités réelles, par outil', () => {
  it('les capacités vérifiées sont nommées, dans l’ordre reçu', () => {
    const connectedWithCapabilities: ConnectedClientTool = { ...gmail, capabilities: ['read', 'send'] }
    render(<ToolsSourcesMenu tools={[connectedWithCapabilities]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.getByText('Lire, Envoyer')).toBeInTheDocument()
  })

  it('aucune capacité vérifiée (ou champ absent) : aucune ligne — une absence ne se devine pas', () => {
    render(<ToolsSourcesMenu tools={[gmail, { ...hubspot, capabilities: [] }]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    expect(screen.queryByText('Lire')).toBeNull()
    expect(screen.queryByText('Envoyer')).toBeNull()
  })
})

// #3973.6 (Louis 15/10/2026) — un logo de marque garde sa lisibilité en thème sombre : une pastille
// claire derrière lui, portée par un TOKEN de thème (jamais une couleur en dur dans le JSX, GA-33).
describe('#3973.6 — la pastille derrière un logo de marque', () => {
  it('le logo porte la pastille du token de thème, et aucune couleur en dur', () => {
    render(<ToolsSourcesMenu tools={[hubspot]} excludedProviders={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /outils et sources/i }))
    const logo = screen.getByTestId('tool-logo-hubspot')
    expect(logo.className).toContain('bg-[var(--bellum-brand-logo-chip)]')
    expect(logo.className).not.toMatch(/#[0-9a-f]{3,6}/i)
  })
})
