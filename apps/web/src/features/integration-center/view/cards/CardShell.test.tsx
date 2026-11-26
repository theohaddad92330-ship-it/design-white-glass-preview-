import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Boxes } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { CardShell } from './CardShell'

/**
 * #1442 / #1447 — LE DÉTAIL NE SE DÉPLIE QUE QUAND IL RÉPOND À UNE QUESTION.
 *
 * *« Les cartes actuelles sont beaucoup trop hautes quand elles sont
 * déconnectées. »* Seize cartes qui dépliaient bénéfices ET diagnostics avant
 * qu'on ait cliqué font un catalogue qu'on ne parcourt pas.
 *
 * La règle, et les deux pièges qu'elle évite :
 *  · **branché ⇒ déplié.** Sur un outil branché, la question est « est-ce que ça
 *    marche ? », et la réponse doit être là sans un clic de plus (#1447) ;
 *  · **à brancher ⇒ replié, jamais SUPPRIMÉ.** Retirer le détail ferait
 *    disparaître ce que l'outil sait faire au moment précis où l'on décide de le
 *    brancher. Il est derrière un bouton qui dit ce qu'il ouvre ;
 *  · **le GESTE reste toujours visible.** Replier le bouton « Connecter » avec
 *    le détail rendrait la carte inutile — c'est la faute symétrique.
 */
function shell(props: { expanded?: boolean } = {}) {
  return render(
    <CardShell
      icon={Boxes}
      name="Un outil"
      description="Ce que ça fait."
      details={<p>ce que l’outil sait faire</p>}
      {...props}
    >
      <button type="button">Connecter</button>
    </CardShell>,
  )
}

describe('une carte de connecteur', () => {
  it('lit un corpus non vide : le nom et le geste sont toujours là', () => {
    shell()
    expect(screen.getByText('Un outil')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connecter' })).toBeInTheDocument()
  })

  it('branchée : le détail est là SANS clic', () => {
    shell({ expanded: true })
    expect(screen.getByText('ce que l’outil sait faire')).toBeInTheDocument()
  })

  it('branchée : aucun bouton de repli — il ne replierait rien', () => {
    shell({ expanded: true })
    expect(screen.queryByRole('button', { name: /détail/i })).toBeNull()
  })

  it('à brancher : le détail est REPLIÉ, et le geste reste visible', () => {
    shell()
    expect(screen.queryByText('ce que l’outil sait faire')).toBeNull()
    expect(screen.getByRole('button', { name: 'Connecter' })).toBeInTheDocument()
  })

  it('à brancher : il s’ouvre au clic, et se referme', async () => {
    shell()
    const toggle = screen.getByRole('button', { name: /Voir le détail/i })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(toggle)
    expect(screen.getByText('ce que l’outil sait faire')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Masquer le détail/i }).getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(screen.getByRole('button', { name: /Masquer le détail/i }))
    expect(screen.queryByText('ce que l’outil sait faire')).toBeNull()
  })

  it('sans détail à montrer, aucun bouton de repli n’apparaît', () => {
    render(
      <CardShell icon={Boxes} name="Un outil" description="Ce que ça fait.">
        <button type="button">Connecter</button>
      </CardShell>,
    )
    expect(screen.queryByRole('button', { name: /détail/i })).toBeNull()
  })
})

/**
 * #2078.13 — AUCUN connecteur du catalogue n'est obligatoire (#2078.18,
 * `/welcome` n'en exige aucun). La carte le dit elle-même, tant qu'aucun badge
 * réel (connecté / à reconnecter) ne répond déjà à la question.
 */
describe('une carte de connecteur : la mention facultative', () => {
  it('à brancher : la mention facultative se lit', () => {
    shell()
    expect(screen.getByText('Facultatif')).toBeInTheDocument()
  })

  it('branchée : le badge réel remplace la mention, jamais les deux', () => {
    render(
      <CardShell icon={Boxes} name="Un outil" description="Ce que ça fait." badge={<span>Connecté</span>}>
        <button type="button">Connecter</button>
      </CardShell>,
    )
    expect(screen.getByText('Connecté')).toBeInTheDocument()
    expect(screen.queryByText('Facultatif')).toBeNull()
  })
})

/** #3973.7 — le logo du registre unique sur la carte ; sans fichier, l'icône générique. */
describe('#3973.7 — logo de marque sur la carte', () => {
  it('un connecteur au registre : le logo, décoratif (aria-hidden, alt vide), le nom lisible', () => {
    render(<CardShell icon={Boxes} connector="hubspot" name="HubSpot" description="CRM." />)
    const img = screen.getByTestId('connector-logo-img')
    expect(img).toHaveAttribute('alt', '')
    expect((img as HTMLImageElement).src).toContain('hubspot')
    expect(screen.getByTestId('connector-logo')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('HubSpot')).toBeInTheDocument()
  })

  it('Attio (fichier pas encore fourni) et un protocole : l’icône, aucune image', () => {
    render(<CardShell icon={Boxes} connector="attio" name="Attio" description="CRM." />)
    render(<CardShell icon={Boxes} connector="webhook" name="Webhook" description="Protocole." />)
    expect(screen.queryByTestId('connector-logo-img')).toBeNull()
  })
})

/**
 * Refonte Théo (PR12, `.bo11-integration`) — l'ORDRE de la carte : le nom en
 * titre h3 (sous le h2 de la famille), la phrase, le geste, puis le PIED séparé
 * d'un filet qui porte le statut et le repli du détail.
 */
describe('une carte de connecteur — grammaire Théo', () => {
  it('nom en h3, puis phrase, geste, et un pied qui porte statut et repli', () => {
    shell()
    const name = screen.getByRole('heading', { level: 3, name: 'Un outil' })
    const status = screen.getByText('Facultatif')
    const footer = status.parentElement as HTMLElement
    expect(footer.className).toContain('border-t')
    expect(footer).toContainElement(screen.getByRole('button', { name: /Voir le détail/i }))
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(name, screen.getByText('Ce que ça fait.'))).toBe(true)
    expect(follows(screen.getByText('Ce que ça fait.'), screen.getByRole('button', { name: 'Connecter' }))).toBe(true)
    expect(follows(screen.getByRole('button', { name: 'Connecter' }), footer)).toBe(true)
  })
})
