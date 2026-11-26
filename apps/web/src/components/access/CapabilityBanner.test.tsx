import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RouteAccess } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { CapabilityBanner } = await import('./CapabilityBanner')

/**
 * Le bandeau unique (BEL-ARCH-002).
 *
 * Le produit avait onze variantes de « cet écran ne sert pas », dont une qui ne
 * disait rien : une permission manquante renvoyait au tableau de bord sans un
 * mot, ce qui se lit comme un bug. Ce qui compte ici n'est pas l'apparence,
 * c'est que chacun des quatre états dise un GESTE différent — et que le
 * dégradé n'empêche rien.
 */
describe('CapabilityBanner', () => {
  const access = (over: Partial<RouteAccess> = {}): RouteAccess => ({ state: 'ready', missing: [], ...over })

  it('n’affiche rien quand l’écran sert normalement', () => {
    const { container } = render(<CapabilityBanner access={access()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit que l’écran appartient à une autre offre, et qui peut l’ouvrir', () => {
    render(<CapabilityBanner access={access({ state: 'plan_locked', missing: ['talent_pool'] })} />)

    expect(screen.getByText('Cet écran fait partie d’une autre offre')).toBeInTheDocument()
    expect(screen.getByText(/propriétaire de l’espace/)).toBeInTheDocument()
  })

  it('dit qu’une permission manque — au lieu de rediriger en silence', () => {
    render(<CapabilityBanner access={access({ state: 'permission', missing: ['finance:read'] })} />)

    expect(screen.getByText('Ton rôle n’ouvre pas cet écran')).toBeInTheDocument()
  })

  it('envoie connecter l’outil quand rien n’est branché', () => {
    render(<CapabilityBanner access={access({ state: 'no_integration', missing: ['calendar'] })} />)

    expect(screen.getByText(/Réglages › Intégrations/)).toBeInTheDocument()
  })

  it('dit que le RESTE fonctionne quand l’écran est dégradé', () => {
    // C'est la nuance qui évite de faire conclure à une panne : l'écran est
    // ouvert, une partie seulement manque.
    render(<CapabilityBanner access={access({ state: 'degraded', missing: ['calendar'] })} />)

    expect(screen.getByText(/Le reste fonctionne normalement/)).toBeInTheDocument()
  })

  it('NOMME toujours ce qui manque — « une capacité est indisponible » envoie chercher', () => {
    render(<CapabilityBanner access={access({ state: 'degraded', missing: ['calendar', 'email'] })} />)

    expect(screen.getByText(/ton agenda, ta messagerie/)).toBeInTheDocument()
  })

  it('n’affiche pas de ligne « ce qui manque » vide', () => {
    render(<CapabilityBanner access={access({ state: 'plan_locked', missing: [] })} />)

    expect(screen.queryByText(/Ce qui manque/)).not.toBeInTheDocument()
  })
})

/**
 * LE GESTE — D222 (§12.6 du tracker du 26/08).
 *
 * Le docblock du composant annonçait « quatre GESTES distincts » et n'en rendait
 * aucun : ni lien, ni bouton. Le recomptage du tome 7 l'a relevé comme un défaut
 * VIVANT (« une bannière sans destinataire ni geste »), avec sa recommandation
 * écrite — palier → facturation, connecteur → intégrations.
 *
 * Une destination par état, et une seule : c'est ce qui distingue un bandeau
 * d'un message d'erreur.
 */
describe('CapabilityBanner — le geste', () => {
  const access = (over: Partial<RouteAccess> = {}): RouteAccess => ({ state: 'ready', missing: [], ...over })

  it('un palier verrouillé mène à la facturation', () => {
    render(<CapabilityBanner access={access({ state: 'plan_locked', missing: ['talent_pool'] })} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/billing')
  })

  it('aucun outil branché mène aux intégrations', () => {
    render(<CapabilityBanner access={access({ state: 'no_integration', missing: ['calendar'] })} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
  })

  it('un écran dégradé mène aux intégrations lui aussi — il n’est pas fermé pour autant', () => {
    render(<CapabilityBanner access={access({ state: 'degraded', missing: ['email'] })} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/integrations')
    expect(screen.getByText(/Le reste fonctionne normalement/)).toBeInTheDocument()
  })

  it('une permission manquante ne propose AUCUN lien — il n’existe pas d’écran où se l’accorder', () => {
    // « Un bouton qui ne répare rien est pire qu'un message nu » : la phrase est
    // déjà celle du dépôt, sur l'échec de lecture du CRM. Le destinataire du
    // geste est ici une PERSONNE, pas une route.
    render(<CapabilityBanner access={access({ state: 'permission', missing: ['finance:read'] })} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Demande l’accès à un responsable/)).toBeInTheDocument()
  })
})

/**
 * CE QUE LE COMPOSANT A GAGNÉ EN ACCUEILLANT LES BANDEAUX AD HOC — D223.
 *
 * Migrer n'est pas aplatir. Trois écrans disaient quelque chose que le bandeau
 * ne savait pas dire, et c'est le bandeau qui gagne le cas :
 *
 *  - une phrase PROPRE à l'écran (« Connecte ton agenda pour y ajouter cette
 *    action ») est plus utile que la phrase générique ;
 *  - un libellé de geste propre à l'écran (« Reconnecter » ≠ « Connecter ») ;
 *  - un geste qui n'est PAS une navigation : démarrer une autorisation, avec son
 *    état d'attente.
 */
describe('CapabilityBanner — ce que les écrans lui ont appris', () => {
  const access = (over: Partial<RouteAccess> = {}): RouteAccess => ({ state: 'ready', missing: [], ...over })

  it('laisse l’écran dire SA phrase quand elle est plus précise que la générique', () => {
    render(
      <CapabilityBanner
        access={access({ state: 'no_integration', missing: [] })}
        title="Aucune messagerie connectée"
        description="Connecte ta messagerie pour chercher tes fils ici."
      />,
    )

    expect(screen.getByText('Aucune messagerie connectée')).toBeInTheDocument()
    expect(screen.getByText('Connecte ta messagerie pour chercher tes fils ici.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun outil connecté ne fournit ces données')).not.toBeInTheDocument()
  })

  it('laisse l’écran nommer SON geste, sans changer la destination', () => {
    render(
      <CapabilityBanner access={access({ state: 'no_integration', missing: [] })} action={{ label: 'Reconnecter' }} />,
    )

    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('Reconnecter')
    expect(link).toHaveAttribute('href', '/integrations')
  })

  it('accepte un geste qui n’est pas une navigation, et c’est un vrai bouton', () => {
    const onClick = vi.fn()
    render(
      <CapabilityBanner
        access={access({ state: 'no_integration', missing: [] })}
        action={{ label: 'Connecter ton agenda', onClick }}
      />,
    )

    const button = screen.getByRole('button', { name: 'Connecter ton agenda' })
    expect(button).toHaveAttribute('type', 'button')
    // Un geste qui n'est pas une route ne doit pas EN PLUS en proposer une :
    // deux destinataires pour un seul message, c'est le défaut d'origine.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('dit que le geste est en cours, plutôt que de le laisser cliquer deux fois', () => {
    render(
      <CapabilityBanner
        access={access({ state: 'no_integration', missing: [] })}
        action={{ label: 'Connecter ton agenda', onClick: vi.fn(), pending: true }}
      />,
    )

    expect(screen.getByRole('button', { name: /Connecter ton agenda/ })).toBeDisabled()
  })
})

/**
 * #1932.2 / #1932.3 — LE DÉGRADÉ PORTE DEUX GESTES, PAS UN.
 *
 * Le badge « ce qui manque » disait déjà QUOI, mais le seul bouton du dégradé
 * menait à Intégrations — rien ne proposait explicitement de rester. La
 * capacité se NOMME (jamais l'éditeur), au tutoiement, dans les deux CTA.
 */
describe('CapabilityBanner — le dégradé propose deux gestes (#1932.2, #1932.3)', () => {
  const access = (over: Partial<RouteAccess> = {}): RouteAccess => ({ state: 'degraded', missing: [], ...over })

  it('nomme la capacité manquante dans les deux CTA, jamais l’éditeur', () => {
    render(<CapabilityBanner access={access({ missing: ['crm'] })} />)

    expect(screen.getByRole('button', { name: 'Continuer sans ton CRM' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter ton CRM' })).toHaveAttribute('href', '/integrations')
  })

  it('retombe sur un mot générique quand la capacité n’est pas dans le répertoire connu', () => {
    render(<CapabilityBanner access={access({ missing: ['un_code_jamais_vu'] })} />)

    expect(screen.getByRole('button', { name: 'Continuer sans cet outil' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connecter cet outil' })).toBeInTheDocument()
  })

  it('« Continuer sans » REPLIE le bandeau — un vrai geste, pas un bouton qui ne répare rien', () => {
    render(<CapabilityBanner access={access({ missing: ['crm'] })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Continuer sans ton CRM' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('un geste sur mesure (`action.onClick`) garde la priorité — un seul bouton, pas trois', () => {
    const onClick = vi.fn()
    render(<CapabilityBanner access={access({ missing: ['crm'] })} action={{ label: 'Relancer', onClick }} />)

    expect(screen.getByRole('button', { name: 'Relancer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continuer sans/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

/**
 * #1932.5 — LA VALEUR AVANT LA CONNEXION.
 *
 * Le bandeau savait dire ce qui MANQUE (« Ce qui manque : email ») et où
 * brancher. Il ne savait pas dire ce qui RESTE POSSIBLE — or c'est cette
 * phrase-là qui empêche de lire « connecte, sinon rien ». Le retour la nomme
 * exactement : jamais imposer une connexion avant d'avoir expliqué la valeur.
 *
 * Elle appartient à l'ÉCRAN, pas au bandeau : « les séquences se consultent et
 * se préparent, mais rien ne part » n'est vrai que sur les séquences. Le
 * bandeau lui donne une place, un ordre (avant ce qui manque) et deux états —
 * ceux où l'écran sert encore. Sur un palier verrouillé ou un rôle qui n'ouvre
 * pas l'écran, promettre « ce qui reste possible » serait un mensonge.
 */
describe('CapabilityBanner — ce qui reste possible (#1932.5)', () => {
  const access = (over: Partial<RouteAccess> = {}): RouteAccess => ({ state: 'ready', missing: [], ...over })

  it('dit ce qui reste possible AVANT ce qui manque, sur un écran dégradé', () => {
    render(
      <CapabilityBanner
        access={access({ state: 'degraded', missing: ['email'] })}
        stillPossible="consulter et préparer les séquences"
      />,
    )

    const banner = screen.getByRole('status')
    const reste = screen.getByText(/consulter et préparer les séquences/)
    const manque = screen.getByText(/Ce qui manque/)

    expect(banner).toContainElement(reste)
    // L'ordre EST le point : la valeur d'abord, la connexion ensuite.
    expect(reste.compareDocumentPosition(manque) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('la dit aussi quand AUCUN outil n’est branché — c’est là qu’elle sert le plus', () => {
    render(
      <CapabilityBanner
        access={access({ state: 'no_integration', missing: ['email'] })}
        stillPossible="consulter et préparer les séquences"
      />,
    )

    expect(screen.getByText(/consulter et préparer les séquences/)).toBeInTheDocument()
  })

  it('ne promet RIEN quand l’écran ne sert pas : palier verrouillé, rôle insuffisant', () => {
    const { rerender } = render(
      <CapabilityBanner
        access={access({ state: 'plan_locked', missing: ['talent_pool'] })}
        stillPossible="consulter et préparer les séquences"
      />,
    )
    expect(screen.queryByText(/consulter et préparer les séquences/)).not.toBeInTheDocument()

    rerender(
      <CapabilityBanner
        access={access({ state: 'permission', missing: ['finance:read'] })}
        stillPossible="consulter et préparer les séquences"
      />,
    )
    expect(screen.queryByText(/consulter et préparer les séquences/)).not.toBeInTheDocument()
  })

  it('n’affiche pas de ligne vide quand l’écran n’a rien à promettre', () => {
    render(<CapabilityBanner access={access({ state: 'degraded', missing: ['email'] })} />)

    expect(screen.queryByText(/Ce qui reste possible/)).not.toBeInTheDocument()
  })
})
