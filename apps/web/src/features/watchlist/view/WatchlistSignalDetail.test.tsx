import { fireEvent, render, screen } from '@testing-library/react'
import type { ElementType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WatchlistItem } from '../model/watchlist'

type MotionMockProps = { children?: ReactNode } & Record<string, unknown>

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        const cached = motionComponents.get(prop)
        if (cached) return cached
        const Rendered = ({ children, ...props }: MotionMockProps) => {
          const Component = prop as ElementType
          return <Component {...props}>{children}</Component>
        }
        motionComponents.set(prop, Rendered)
        return Rendered
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}))

vi.mock('@tanstack/react-router', async () => {
  const { forwardRef } = await import('react')
  return {
    useNavigate: () => vi.fn(),
    // ⚠️ Le faux porte le `search` dans le `href` ET transmet la ref : le
    // troisième geste du panneau (#1423) est un lien vers le copilote, monté
    // par `<Button asChild>`, qui passe une ref à son enfant.
    Link: forwardRef<
      HTMLAnchorElement,
      { children?: React.ReactNode; to: string; search?: Record<string, unknown>; className?: string }
    >(({ children, to, search, ...rest }, ref) => (
      <a
        {...rest}
        ref={ref}
        href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)]))}` : to}
      >
        {children}
      </a>
    )),
  }
})
vi.mock('../rules/useWatchlistRules', () => ({ useWatchlistRules: () => ({ rules: [] }) }))

const createMutate = vi.fn()
vi.mock('../actions/useSignalAction', () => ({
  useCreateSignalAction: () => ({ mutate: createMutate, isPending: false }),
}))

const verifyMutate = vi.fn()
vi.mock('../actions/useVerifySignal', () => ({
  useVerifySignal: () => ({ mutate: verifyMutate, isPending: false }),
}))

const { WatchlistSignalDetail } = await import('./WatchlistSignalDetail')

const item = (over: Partial<WatchlistItem> = {}): WatchlistItem => ({
  accountId: 'a-1',
  companyName: 'Nordia',
  id: 's-1',
  sector: 'Services',
  signalDate: '2026-07-05',
  signalLabel: 'Programme data',
  signalSource: 'Communiqué',
  signalType: 'Projet',
  score: 8,
  status: 'new',
  archived: false,
  firstDetectedAt: null,
  firstDetectionExact: false,
  lastSeenAt: null,
  changeCount: 0,
  resolved: false,
  resolvedAt: null,
  importance: null,
  triggeredActionLabel: null,
  lastVerifiedAt: null,
  temporalStatus: null,
  salesImplication: null,
  impact: null,
  logoUrl: null,
  website: null,
  ...over,
})

/**
 * L'objet `Signal` complété (restitution V2 §20) vu de l'écran : une importance
 * DÉRIVÉE, et le lien vers l'action que ce signal a déclenchée. Les deux sont
 * absents tant que la donnée n'existe pas — jamais une valeur devinée.
 */
describe('WatchlistSignalDetail — importance + action déclenchée (V2 §20)', () => {
  beforeEach(() => createMutate.mockReset())

  it('shows the derived importance when the server could compute one', () => {
    render(<WatchlistSignalDetail item={item({ importance: 'high' })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText('Importance forte')).toBeInTheDocument()
  })

  it('shows NO importance badge when nothing could be weighed', () => {
    render(<WatchlistSignalDetail item={item()} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText(/Importance/)).not.toBeInTheDocument()
  })

  it('renders « a déclenché : … » with the action’s own label', () => {
    render(
      <WatchlistSignalDetail
        item={item({ triggeredActionLabel: 'Traiter le signal : Programme data' })}
        onOpenAccount={vi.fn()}
      />,
    )
    expect(screen.getByText('A déclenché')).toBeInTheDocument()
    expect(screen.getByText('Traiter le signal : Programme data')).toBeInTheDocument()
    // Le signal a déjà produit son action : plus de bouton de création.
    expect(screen.queryByRole('button', { name: 'En faire une action' })).not.toBeInTheDocument()
  })

  it('offers to turn the signal into an action — le clic est ce qui crée le lien', () => {
    render(<WatchlistSignalDetail item={item()} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText('A déclenché')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'En faire une action' }))
    expect(createMutate).toHaveBeenCalledWith({ accountId: 'a-1', label: 'Programme data' })
  })

  it('n’affiche jamais un jeton de citation à la place de la source', () => {
    // Le défaut vécu : `readableSource` existait et était juste, mais ce
    // panneau-ci lisait `item.signalSource` en direct. Une fonction correcte
    // branchée à un seul endroit sur deux ne corrige rien — c'est le CÂBLAGE
    // que ce test verrouille, pas le filtre (qui a ses propres tests).
    render(<WatchlistSignalDetail item={item({ signalSource: '[PR3]' })} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText('[PR3]')).not.toBeInTheDocument()
    expect(screen.getByText('Source inconnue')).toBeInTheDocument()
  })

  it('garde le nom du média quand le jeton l’accompagne', () => {
    render(<WatchlistSignalDetail item={item({ signalSource: '[P5] Journal du Net' })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText('Journal du Net')).toBeInTheDocument()
  })
})

// #3206.2 (partiel, épopée #3240) — « Marquer ce signal comme vérifié ».
// Reste dans la section Historique, jamais un quatrième geste principal
// (#1423) : les trois boutons pleine largeur restent « en faire une action »,
// « ouvrir le dossier », « demander quoi faire ».
describe('WatchlistSignalDetail — vérification humaine (#3206.2)', () => {
  beforeEach(() => verifyMutate.mockReset())

  it('offre « Marquer vérifié » quand un historique existe et que personne n’a encore vérifié', () => {
    render(
      <WatchlistSignalDetail
        item={item({ firstDetectedAt: '2026-06-01T08:00:00.000Z', firstDetectionExact: true })}
        onOpenAccount={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Marquer vérifié' }))
    expect(verifyMutate).toHaveBeenCalledWith({ accountId: 'a-1', label: 'Programme data' })
  })

  it('n’offre rien sans historique matérialisé — aucune ligne à estampiller côté serveur', () => {
    render(<WatchlistSignalDetail item={item()} onOpenAccount={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Marquer vérifié' })).not.toBeInTheDocument()
  })

  it('affiche « Vérifié par toi le … » et retire le bouton une fois vérifié', () => {
    render(
      <WatchlistSignalDetail
        item={item({
          firstDetectedAt: '2026-06-01T08:00:00.000Z',
          firstDetectionExact: true,
          lastVerifiedAt: '2026-07-20T09:00:00.000Z',
        })}
        onOpenAccount={vi.fn()}
      />,
    )
    expect(screen.getByText(/Vérifié par toi le/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marquer vérifié' })).not.toBeInTheDocument()
  })

  it('affiche le badge « Vérifié » quand le statut dérivé est CURRENT_VERIFIED', () => {
    render(<WatchlistSignalDetail item={item({ temporalStatus: 'CURRENT_VERIFIED' })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText('Vérifié')).toBeInTheDocument()
  })

  it('n’affiche PAS le badge « Vérifié » pour un autre statut temporel', () => {
    render(<WatchlistSignalDetail item={item({ temporalStatus: 'STALE' })} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText('Vérifié')).not.toBeInTheDocument()
  })

  // #3206.3 (reste, épopée #3240) — SUPERSEDED, distinct de CURRENT_VERIFIED.
  it('affiche le badge « Remplacé » quand le statut dérivé est SUPERSEDED', () => {
    render(<WatchlistSignalDetail item={item({ temporalStatus: 'SUPERSEDED' })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText('Remplacé')).toBeInTheDocument()
  })

  it('n’affiche PAS le badge « Remplacé » pour un autre statut temporel', () => {
    render(<WatchlistSignalDetail item={item({ temporalStatus: 'CURRENT_VERIFIED' })} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText('Remplacé')).not.toBeInTheDocument()
  })
})

/**
 * Le score du compte passe par `ScoreWithAxes`.
 *
 * Le panneau écrivait « — » quand le compte n'avait pas de note. Un tiret ne
 * dit pas laquelle des deux choses est vraie : « on a regardé et il n'y a rien
 * à en dire » ou « on n'a pas regardé ». La primitive dit la seconde, avec sa
 * raison — c'est la même règle que « non mesuré n'est pas mesuré à zéro »,
 * appliquée au signe qui la remplaçait.
 */
describe('WatchlistSignalDetail — le score n’est jamais nu', () => {
  it('rend la note sur son maximum, jamais un pourcentage', () => {
    render(<WatchlistSignalDetail item={item({ score: 8 })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('la bande de métriques s’empile en mobile (1 colonne), 3 colonnes dès sm', () => {
    const { container } = render(<WatchlistSignalDetail item={item({ score: 8 })} onOpenAccount={vi.fn()} />)
    const band = screen.getByText('8/10').closest('section.grid')
    expect(band).not.toBeNull()
    expect(band?.className).toContain('grid-cols-1')
    expect(band?.className).toContain('sm:grid-cols-3')
    expect(container.querySelector('section.grid-cols-3')).toBeNull()
  })

  it('dit « non mesuré » et POURQUOI, au lieu d’un tiret', () => {
    render(<WatchlistSignalDetail item={item({ score: null })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
    expect(screen.getByText(/aucune note d’analyse/)).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })
})

/**
 * #1424 — la lecture commerciale du signal remplace la phrase statique.
 *
 * « Identifie le bon contact et transforme le signal en angle d'approche » est
 * juste, et c'est exactement le problème : elle l'est pour les deux cents
 * signaux d'un espace, donc elle n'apprend rien. L'analyse a écrit, pour CE
 * signal, ce qu'il peut vouloir dire commercialement ; c'est cette phrase-là
 * qui doit être sous les yeux au moment de décider.
 */
describe('WatchlistSignalDetail — la lecture commerciale (#1424)', () => {
  const IMPLICATION = 'Un tour de table finance des projets, pas des intentions.'
  const GÉNÉRIQUE = 'Identifie le bon contact et transforme le signal en angle d’approche.'

  it('affiche la lecture écrite par l’analyse pour CE signal', () => {
    render(<WatchlistSignalDetail item={item({ salesImplication: IMPLICATION })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText(IMPLICATION)).toBeInTheDocument()
  })

  it('remplace la phrase statique quand la lecture existe', () => {
    render(<WatchlistSignalDetail item={item({ salesImplication: IMPLICATION })} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText(GÉNÉRIQUE)).not.toBeInTheDocument()
  })

  it('retombe sur le conseil générique quand l’analyse n’a rien dit — jamais une lecture inventée', () => {
    render(<WatchlistSignalDetail item={item({ salesImplication: null })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText(GÉNÉRIQUE)).toBeInTheDocument()
  })
})

/**
 * #2107.31 — l'ampleur business du signal, distincte de la lecture ESN
 * (#1424 ci-dessus). Contexte SCORE (grille des trois cases) : l'absence se
 * NOMME, elle ne retire jamais la case.
 */
describe('WatchlistSignalDetail — l’ampleur business du signal (#2107.31)', () => {
  const IMPACT = "Transformation à l'échelle du groupe, pas d'une seule direction."

  it('affiche l’ampleur écrite par l’analyse pour CE signal', () => {
    render(<WatchlistSignalDetail item={item({ impact: IMPACT })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText(IMPACT)).toBeInTheDocument()
  })

  it('nomme l’absence plutôt que de retirer la case', () => {
    render(<WatchlistSignalDetail item={item({ impact: null })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText('Non évaluée')).toBeInTheDocument()
  })
})

// #3922.3 — /mes-cibles : BODACC visible (CELSO, TF1) mais sans lien vers l'annonce.
describe('WatchlistSignalDetail — le lien vers la preuve (#3922.3)', () => {
  it('rend « Voir l’annonce » vers l’annonce', () => {
    render(
      <WatchlistSignalDetail
        item={item({ signalSource: 'BODACC', sourceUrl: 'https://www.bodacc.fr/a?id=9', sourceKind: 'bodacc' })}
        onOpenAccount={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: /Voir l.annonce/i })).toHaveAttribute(
      'href',
      'https://www.bodacc.fr/a?id=9',
    )
  })

  it('sait dire NON : sans URL, aucune ligne « Sans lien vérifiable » et aucun lien', () => {
    render(<WatchlistSignalDetail item={item({ sourceUrl: null })} onOpenAccount={vi.fn()} />)
    expect(screen.queryByText(/Sans lien vérifiable/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Voir/ })).not.toBeInTheDocument()
  })

  it('collecte antérieure au lien : le dit', () => {
    render(<WatchlistSignalDetail item={item({ collectedBeforeLink: true })} onOpenAccount={vi.fn()} />)
    expect(screen.getByText(/collecte antérieure au lien source/i)).toBeInTheDocument()
  })
})

// #4182.5 — recette R25 : /mes-cibles montrait le titre de l'offre seul, sans équipe demandeuse.
describe('WatchlistSignalDetail — le demandeur d’une offre (#4182.5)', () => {
  it('étayé : une ligne « Demandeur probable » avec la preuve', () => {
    render(
      <WatchlistSignalDetail
        item={item({
          signalType: 'Recrutement',
          requester: {
            author: 'rh',
            possibleManagerFunction: 'Directeur de la production',
            team: 'Plateforme',
            city: 'Lyon',
            status: 'etaye',
            method: [],
          },
        })}
        onOpenAccount={vi.fn()}
      />,
    )
    expect(screen.getByTestId('need-requester')).toHaveTextContent('Demandeur probable : Directeur de la production')
  })

  // #4286.12 — contrat Louis 26/10 (REMPLACE la décision du 25/10, « aucune ligne ») : sur le DÉTAIL d'un signal de
  // recrutement, l'équipe demandeuse est nommée quand la donnée existe, sinon elle se dit « à identifier » avec sa méthode.
  it('recrutement, demandeur à identifier : « Équipe demandeuse à identifier » et le lien de méthode', () => {
    const { container } = render(
      <WatchlistSignalDetail
        item={item({
          signalType: 'Recrutement',
          requester: {
            author: 'non_precise',
            possibleManagerFunction: null,
            team: null,
            city: 'Lyon',
            status: 'a_identifier',
            method: ['lire_offre'],
          },
        })}
        onOpenAccount={vi.fn()}
      />,
    )
    const block = screen.getByTestId('signal-requester')
    expect(block).toHaveTextContent('Équipe demandeuse à identifier')
    expect(screen.getByTestId('need-requester-method')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/non renseign|\b0\b/i)
  })

  it('recrutement SANS demandeur composé (CARREFOUR BANQUE) : le même « à identifier », jamais un détail muet', () => {
    render(<WatchlistSignalDetail item={item({ signalType: 'Recrutement' })} onOpenAccount={vi.fn()} />)
    expect(screen.getByTestId('signal-requester')).toHaveTextContent('Équipe demandeuse à identifier')
    expect(screen.getByTestId('need-requester-method')).toBeInTheDocument()
  })

  it('étayé par la fonction ET l’équipe : les deux se nomment', () => {
    render(
      <WatchlistSignalDetail
        item={item({
          signalType: 'Recrutement',
          requester: {
            author: 'rh',
            possibleManagerFunction: 'Directeur de la production',
            team: 'Plateforme',
            city: null,
            status: 'etaye',
            method: [],
          },
        })}
        onOpenAccount={vi.fn()}
      />,
    )
    const block = screen.getByTestId('signal-requester')
    expect(block).toHaveTextContent('Directeur de la production')
    expect(block).toHaveTextContent('Plateforme')
    expect(block).not.toHaveTextContent('à identifier')
  })

  it('étayé par une équipe seule : le détail NOMME quand même le demandeur, avec sa preuve', () => {
    render(
      <WatchlistSignalDetail
        item={item({
          requester: {
            author: 'cabinet',
            possibleManagerFunction: null,
            team: 'Plateforme data',
            city: 'Lyon',
            status: 'etaye',
            method: [],
          },
        })}
        onOpenAccount={vi.fn()}
      />,
    )
    const block = screen.getByTestId('signal-requester')
    expect(block).toHaveTextContent(/demandeur/i)
    expect(block).toHaveTextContent('Plateforme data')
    expect(block).toHaveTextContent('D’après le texte de l’offre')
  })

  it('sait dire NON : un signal qui n’est pas une offre n’a aucune ligne demandeur', () => {
    render(<WatchlistSignalDetail item={item()} onOpenAccount={vi.fn()} />)
    expect(screen.queryByTestId('need-requester')).not.toBeInTheDocument()
    expect(screen.queryByTestId('need-requester-method')).not.toBeInTheDocument()
  })
})

// Théo L1 — sélecteur avancé — « Demander à Laura » sur une OFFRE D'EMPLOI ouvre
// un fil cadré sur CETTE offre (`?scope=job_offer:<id>`), lien partageable.
describe('WatchlistSignalDetail — Théo L1 l’offre d’emploi part en portée de Laura', () => {
  const OFFER = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'

  function askLauraHref(): string {
    return screen.getByRole('link', { name: /Demander quoi faire/ }).getAttribute('href') ?? ''
  }

  it('une offre historisée : le lien cadre le fil sur elle', () => {
    render(
      <WatchlistSignalDetail
        item={item({ signalType: 'recrutement', signalLabel: 'Data engineer (H/F)', historyId: OFFER })}
        onOpenAccount={vi.fn()}
      />,
    )
    expect(askLauraHref()).toContain(`scope=job_offer%3A${OFFER}`)
  })

  function scopedLinks(): Element[] {
    return screen.queryAllByRole('link').filter(link => (link.getAttribute('href') ?? '').includes('scope='))
  }

  it('sait dire NON : un signal qui n’est pas une offre garde le geste d’avant, sans portée', () => {
    render(<WatchlistSignalDetail item={item({ historyId: OFFER })} onOpenAccount={vi.fn()} />)
    expect(scopedLinks()).toHaveLength(0)
  })

  it('sait dire NON : une offre pas encore historisée n’a rien pour la désigner', () => {
    render(
      <WatchlistSignalDetail item={item({ signalType: 'recrutement', historyId: null })} onOpenAccount={vi.fn()} />,
    )
    expect(scopedLinks()).toHaveLength(0)
  })

  it('une offre de STAGE ne devient jamais une portée (décision 12/10)', () => {
    render(
      <WatchlistSignalDetail
        item={item({ signalType: 'recrutement', signalLabel: 'Stage Supply Chain H/F', historyId: OFFER })}
        onOpenAccount={vi.fn()}
      />,
    )
    expect(scopedLinks()).toHaveLength(0)
  })
})
