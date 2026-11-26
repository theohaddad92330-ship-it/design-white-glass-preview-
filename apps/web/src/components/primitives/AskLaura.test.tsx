import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { resetLauraIntro, useCurrentLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'
import { resetLauraPageContext, useLauraContext } from '@/features/laura/bubble/page-context-store'

/**
 * ⚠️ Le mock stocke `to`/`search` en ATTRIBUTS sur l'ancre plutôt que dans un
 * journal d'appels poussé à chaque rendu.
 *
 * Depuis #1812, `AskLaura` porte deux hooks externes (`useAskLauraIntro`,
 * `useIsMobile`) dont l'un se règle après le premier COMMIT (l'effet de dépôt
 * publie, puis `useSyncExternalStore` redéclenche un rendu) — exactement le
 * même mécanisme que `page-context-store`. Un journal qui pousse à CHAQUE
 * appel de `<Link>` verrait donc deux entrées pour un seul lien réellement
 * affiché : la transitoire d'avant le dépôt, jamais peinte, et la finale.
 * Lire l'attribut du DOM final — comme `screen.getByText` le fait déjà pour
 * le libellé — ne voit que ce qu'un utilisateur verrait vraiment.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...rest }: { children: React.ReactNode; to: string; search: unknown }) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search)} {...rest}>
      {children}
    </a>
  ),
}))

/**
 * Contrôlé PAR TEST : `false` (bureau) par défaut, comme dans le produit tant
 * que la fenêtre dépasse 768 px. Voir le describe « repli mobile » plus bas.
 */
let mobile = false
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => mobile }))

const { AskLaura } = await import('./AskLaura')

/** Lit ce que le magasin partagé de Laura contient — la preuve du DÉPÔT. */
function IntroReader() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="intro">{intro ? `${intro.question}|${intro.label}|${intro.accountId ?? ''}` : 'rien'}</span>
}

beforeEach(() => {
  mobile = false
})

/** Publie le contexte d'écran, exactement comme `AccountDetailPage` le fait. */
function PageContextPublisher({ accountId }: { accountId: string }) {
  useLauraContext({
    kind: 'account',
    label: 'Compte ACME',
    entityId: accountId,
    facets: [{ label: 'Statut', value: 'Actif' }],
    state: 'ready',
  })
  return null
}

/** Publie un contexte SANS compte, exactement comme `PilotagePage` le fait. */
function PilotageContextPublisher() {
  useLauraContext({
    kind: 'pilotage',
    label: 'Pilotage',
    entityId: null,
    facets: [{ label: 'Couverture', value: '4/12' }],
    state: 'ready',
  })
  return null
}

afterEach(() => {
  cleanup()
  resetLauraIntro()
  resetLauraPageContext()
})

/**
 * #1316 · #1318 · #1319 · #1322 · #1327 · #1334 — SIX retours demandent un accès
 * contextuel au copilote sur six écrans (« Demander à Laura de prioriser mon
 * portefeuille », « Demander à Laura d'arbitrer mes priorités »…).
 *
 * Ce que cette garde défend, c'est que ce ne soit PAS six copilotes. Laura est
 * une SURCOUCHE, pas un second moteur (D44) : ce point d'entrée n'appelle
 * aucune route de Laura — ni directement (avant #1812), ni via un message
 * envoyé tout seul (depuis #1812). Le commercial relit et envoie — « le
 * copilote prépare, le commercial envoie » n'est pas une convention, c'est
 * l'absence de code.
 */
describe('l’accès contextuel au copilote — #1812, la bulle prend le relais', () => {
  it('dépose la question dans le magasin partagé de Laura, plutôt que de naviguer', () => {
    render(
      <>
        <AskLaura question="Priorise mon portefeuille." label="Demander à Laura" />
        <IntroReader />
      </>,
    )

    expect(screen.getByTestId('intro')).toHaveTextContent('Priorise mon portefeuille.|Demander à Laura|')
    // Rien n'a été envoyé nulle part — jamais `?ask=`, jamais une navigation.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('emporte le compte en portée dans le DÉPÔT quand l’écran en désigne un', () => {
    render(
      <>
        <AskLaura question="Résume ce compte." label="Demander à Laura" accountId="acc-1" />
        <IntroReader />
      </>,
    )

    expect(screen.getByTestId('intro')).toHaveTextContent('Résume ce compte.|Demander à Laura|acc-1')
  })

  it('n’occupe plus la page — c’est la bulle qui porte le libellé, pas l’écran', () => {
    render(<AskLaura question="X" label="Demander à Laura d’arbitrer mes priorités" />)
    expect(screen.queryByText('Demander à Laura d’arbitrer mes priorités')).not.toBeInTheDocument()
  })
})

/**
 * #1812 — REPLI : PAS DE BULLE SOUS 768 px.
 *
 * Laura y est déjà le premier onglet ET l'écran d'arrivée (mobile shell) —
 * aucune bulle n'y lirait une amorce déposée. `AskLaura` doit donc continuer
 * de rendre EXACTEMENT ce qu'il rendait avant #1812 : le lien direct vers
 * `/chat`, question pré-remplie, jamais envoyée. C'est le comportement que
 * `AskLaura.test.tsx` protégeait déjà — inchangé ici, sous ce repli précis.
 */
/** #4345.2 — le repli par lien ne subsiste que SOUS UNE SURCOUCHE (la bulle y est inerte) ou sur /chat. */
function renderInOverlay(ui: React.ReactElement) {
  return render(ui, { wrapper: LauraIntroScope })
}

describe('repli sous surcouche — la bulle est inerte, le lien direct reste', () => {
  beforeEach(() => {
    mobile = false
  })

  it('ouvre la conversation avec la question PRÉ-REMPLIE, jamais envoyée', () => {
    renderInOverlay(<AskLaura question="Priorise mon portefeuille." label="Demander à Laura" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('data-to', '/chat')
    expect(link).toHaveAttribute('data-search', JSON.stringify({ prompt: 'Priorise mon portefeuille.' }))
  })

  it('n’utilise JAMAIS le paramètre qui envoie', () => {
    renderInOverlay(<AskLaura question="Priorise mon portefeuille." label="Demander à Laura" />)
    // `?ask=` poste la question sans que personne ne l'ait relue. #1321.4 le
    // refuse explicitement : « ne pas envoyer aveuglément une commande ».
    expect(screen.getByRole('link').getAttribute('data-search')).not.toContain('"ask"')
  })

  it('emporte le compte en portée quand l’écran en a un', () => {
    renderInOverlay(<AskLaura question="Résume ce compte." label="Demander à Laura" accountId="acc-1" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('data-to', '/chat')
    expect(link).toHaveAttribute('data-search', JSON.stringify({ prompt: 'Résume ce compte.', accountId: 'acc-1' }))
  })

  /**
   * #2146.6 — LE CONTEXTE D'ÉCRAN SURVIT À LA NAVIGATION.
   *
   * `LauraDock` (la bulle, desktop) lit déjà `useCurrentLauraContext()` en
   * direct — rien à faire là. Mais dès qu'`AskLaura` rend un vrai `<Link>`
   * (repli mobile, ou une instance qui a perdu la course de #1812), la
   * navigation vers `/chat` DÉMONTE l'écran d'origine — et avec lui, le
   * contexte qu'il avait publié dans `page-context-store`. Sans le remettre
   * dans l'URL (`entryPageContext`, `Chat.tsx:1263`), Laura arrive sur ce lien
   * sans rien savoir de l'écran qui l'a ouverte : les six champs annoncés par
   * l'écran restent orphelins d'appelant.
   */
  const ACCOUNT_1 = '11111111-1111-1111-1111-111111111111'
  const ACCOUNT_2 = '22222222-2222-2222-2222-222222222222'

  it('emporte le contexte publié par l’écran quand il porte le même compte', () => {
    renderInOverlay(
      <>
        <PageContextPublisher accountId={ACCOUNT_1} />
        <AskLaura question="Résume ce compte." label="Demander à Laura" accountId={ACCOUNT_1} />
      </>,
    )
    const link = screen.getByRole('link')
    const search = JSON.parse(link.getAttribute('data-search') ?? '{}') as { context?: unknown }
    expect(search.context).toEqual({
      kind: 'account',
      label: 'Compte ACME',
      entityId: ACCOUNT_1,
      facets: [{ label: 'Statut', value: 'Actif' }],
      state: 'ready',
    })
  })

  it('ignore le contexte publié quand il porte un AUTRE compte que celui en portée', () => {
    renderInOverlay(
      <>
        <PageContextPublisher accountId={ACCOUNT_2} />
        <AskLaura question="Résume ce compte." label="Demander à Laura" accountId={ACCOUNT_1} />
      </>,
    )
    const link = screen.getByRole('link')
    const search = JSON.parse(link.getAttribute('data-search') ?? '{}') as { context?: unknown }
    expect(search.context).toBeUndefined()
  })

  it('ne transporte aucun contexte quand l’écran n’en publie aucun', () => {
    renderInOverlay(<AskLaura question="Priorise mon portefeuille." label="Demander à Laura" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('data-search', JSON.stringify({ prompt: 'Priorise mon portefeuille.' }))
  })

  /**
   * #3002 (#2206.45-.48, 25/09/2026) — « Explique-moi cet écran » depuis
   * /pilotage recevait une réponse générique : `/pilotage` ne désigne aucun
   * compte (`accountId` absent de `<AskLaura>`), et ce lien ne transportait un
   * contexte QUE quand un `accountId` était fourni — un contexte SANS compte
   * (`entityId: null`) était donc jeté systématiquement dès que ce lien
   * naviguait pour de vrai (repli mobile, ici).
   */
  it('#3002 — transporte un contexte SANS compte (pilotage) même sans accountId', () => {
    renderInOverlay(
      <>
        <PilotageContextPublisher />
        <AskLaura question="Où ma chaîne commerciale décroche-t-elle ?" label="Demander à Laura" />
      </>,
    )
    const link = screen.getByRole('link')
    const search = JSON.parse(link.getAttribute('data-search') ?? '{}') as { context?: unknown }
    expect(search.context).toEqual({
      kind: 'pilotage',
      label: 'Pilotage',
      entityId: null,
      facets: [{ label: 'Couverture', value: '4/12' }],
      state: 'ready',
    })
  })

  it('porte un libellé lisible — ce n’est pas une icône muette', () => {
    renderInOverlay(<AskLaura question="X" label="Demander à Laura d’arbitrer mes priorités" />)
    expect(screen.getByText('Demander à Laura d’arbitrer mes priorités')).toBeInTheDocument()
  })

  /**
   * #1419 — LE VARIANT MIS EN AVANT DOIT SE DISTINGUER DE SES VOISINS.
   *
   * ⚠️ Ce test existe à cause d'un défaut que seule la production a montré.
   * `prominent` rendait un `Button variant="outline"` : sur `/contacts`,
   * « Demander à Laura » et « Exporter vers un tableur » sortaient tous deux en
   * fond transparent, bordure `--bellum-border` — mesuré au pixel le 05/09/2026.
   *
   * Le test lit donc la CLASSE DE FOND, la seule chose qui distingue les deux :
   * jsdom ne met rien en page, il ne peut pas mesurer une couleur rendue.
   */
  it('« prominent » porte le fond d’accent, pas une bordure de plus', () => {
    renderInOverlay(<AskLaura question="X" label="Demander à Laura" variant="prominent" />)

    const cta = screen.getByText('Demander à Laura').closest('a')
    expect(cta?.className).toContain('bg-[var(--bellum-primary)]')
    expect(cta?.className).not.toContain('bg-transparent')
  })

  it('« inline » reste un lien, pas un bouton plein', () => {
    renderInOverlay(<AskLaura question="X" label="Demander à Laura" />)

    const link = screen.getByText('Demander à Laura').closest('a')
    expect(link?.className).not.toContain('bg-[var(--bellum-primary)]')
    expect(link?.className).toContain('underline')
  })
})

/**
 * #1812 — PLUSIEURS `<AskLaura>` SUR LE MÊME ÉCRAN.
 *
 * `MyDataView` en pose trois, `DormantOpportunitiesCard` et la colonne
 * « prochaine action » de `MissionTrackingTable` en posent un PAR LIGNE. La
 * bulle ne peut proposer qu'UNE amorce à la fois : celui qui perd la course
 * (tous sauf le dernier monté) doit garder son lien — sinon des CTA de liste
 * entiers disparaîtraient silencieusement.
 */
describe('plusieurs `<AskLaura>` sur le même écran — celui qui perd garde son lien', () => {
  it('le PREMIER reste un lien visible, le DERNIER (monté après) s’efface', () => {
    render(
      <>
        <AskLaura question="Prépare une reprise avec ACME." label="Demander à Laura (ACME)" />
        <AskLaura question="Prépare une reprise avec Globex." label="Demander à Laura (Globex)" />
      </>,
    )

    // Le second, monté en dernier, a gagné la bulle — il ne prend plus de
    // place sur la page.
    expect(screen.queryByText('Demander à Laura (Globex)')).not.toBeInTheDocument()
    // Le premier, qui a perdu la course, reste un lien réel — rien n'a
    // disparu pour de bon.
    expect(screen.getByText('Demander à Laura (ACME)')).toBeInTheDocument()
  })

  /**
   * #2114.64 — MESURÉ EN RECETTE ÉCRAN LE 25/09/2026 sur le cockpit
   * personnel : deux CTA d'en-tête de nature différente (« Analyser mon
   * activité », « Préparer une revue ») ne sont PAS des lignes répétées où
   * perdre la course est sans perte. `alwaysVisible` garde le lien même
   * quand cette instance GAGNE la course (le dernier monté, ici).
   */
  it('`alwaysVisible` garde son lien même GAGNANT de la course', () => {
    render(
      <>
        <AskLaura question="Analyse mon activité." label="Analyser mon activité" />
        <AskLaura question="Prépare ma revue." label="Préparer une revue" alwaysVisible />
      </>,
    )

    // Le second gagne toujours la course (dernier monté) — mais il ne
    // s'efface plus, contrairement au cas ci-dessus.
    expect(screen.getByText('Préparer une revue')).toBeInTheDocument()
    // Le premier, perdant, gardait déjà son lien — inchangé.
    expect(screen.getByText('Analyser mon activité')).toBeInTheDocument()
  })
})

/**
 * #4309.1 / #4345.1 — « Demander à Laura » ne quitte plus la page : sur bureau, un CTA qui reste visible
 * ouvre la bulle (demande au magasin), il ne rend plus un lien vers /chat.
 */
describe('AskLaura — sans quitter la page (#4309.1, #4345.1)', () => {
  function OpenReader() {
    const request = useLauraOpenRequest()
    return <span data-testid="open">{request ? request.question : 'rien'}</span>
  }

  it('sur bureau, un CTA visible est un bouton qui demande l’ouverture, 0 lien vers /chat', () => {
    render(
      <>
        <AskLaura question="Pourquoi ce compte ?" label="Demander à Laura" alwaysVisible />
        <OpenReader />
      </>,
    )
    expect(document.querySelector('[data-to="/chat"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Laura' }))
    expect(screen.getByTestId('open')).toHaveTextContent('Pourquoi ce compte ?')
  })

  it('le variant prominent est aussi un bouton sur bureau', () => {
    render(<AskLaura question="Q" label="Demander à Laura" variant="prominent" alwaysVisible />)
    expect(document.querySelector('[data-to="/chat"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Demander à Laura' })).toBeInTheDocument()
  })

  // #4345.2 / #4309.4 — le test qui sait dire NON : sur mobile aussi, aucune navigation vers /chat au clic.
  it('sur mobile, le geste ouvre la bulle sur place : un bouton, 0 lien vers /chat', () => {
    mobile = true
    render(
      <>
        <AskLaura question="Q mobile" label="Demander à Laura" />
        <OpenReader />
      </>,
    )
    expect(document.querySelector('[data-to="/chat"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Laura' }))
    expect(screen.getByTestId('open')).toHaveTextContent('Q mobile')
  })
})

// #4345.3 — dans le dialogue du dossier /projects, la bulle est inerte : le geste libère la surcouche
// (`releaseOverlay`) PUIS ouvre la bulle sur place, au lieu de naviguer vers /chat?prompt=…
describe('#4345.3 — surcouche libérée, bulle ouverte sur place', () => {
  function OpenReader() {
    const request = useLauraOpenRequest()
    return <span data-testid="open">{request ? request.question : 'rien'}</span>
  }

  it('avec `releaseOverlay`, sous surcouche : un bouton, 0 lien /chat ; le clic ferme la surcouche et ouvre la bulle', () => {
    const release = vi.fn()
    render(
      <LauraIntroScope>
        <AskLaura question="Q dossier" label="Demander à Laura" releaseOverlay={release} />
        <OpenReader />
      </LauraIntroScope>,
    )
    expect(document.querySelector('[data-to="/chat"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Laura' }))
    expect(release).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('open')).toHaveTextContent('Q dossier')
  })

  it('SAIT DIRE NON — sans `releaseOverlay`, la surcouche garde son lien /chat (#1847)', () => {
    render(
      <LauraIntroScope>
        <AskLaura question="Q" label="Demander à Laura" />
      </LauraIntroScope>,
    )
    expect(document.querySelector('[data-to="/chat"]')).not.toBeNull()
  })
})
