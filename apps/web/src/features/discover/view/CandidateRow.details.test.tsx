/**
 * ⚠️ #2613 — CE FICHIER A BASCULÉ. Décision de Louis du 20/09/2026 :
 * « on affiche pas ce qu'on a pas, on va pas mettre non mesuré et tout ça,
 * ça envoie juste un signal négatif à l'user qui est pas utile. »
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.**
 *
 * Les assertions « NOMME ce qui manque » ci-dessous ont été RETOURNÉES : dans
 * une liste, une absence ne produit plus AUCUNE ligne. Ce qui TIENT encore, et
 * qu'on ne rouvre pas : une valeur absente ne devient jamais « 0 » (elle
 * disparaît, elle ne se chiffre pas), un axe non évaluable reste hors du
 * dénominateur, et sous un SCORE l'énoncé des axes non évaluables reste nommé.
 *
 * Si tu lis ceci en croyant à une régression : ce n'en est pas une, c'est le
 * renversement. Ne le « répare » pas. Garde : `apps/web/src/architecture/
 * une-absence-ne-fait-pas-une-ligne.test.ts`.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { shiftLocalDays } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

const avatarProps: Array<{ name: string; logoUrl?: string | null; website?: string | null }> = []

vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: (props: { name: string; logoUrl?: string | null; website?: string | null }) => {
    avatarProps.push({ name: props.name, logoUrl: props.logoUrl ?? null, website: props.website ?? null })
    return null
  },
}))

const askLauraProps: Array<{ question: string; label: string; accountId?: string }> = []

vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { question: string; label: string; accountId?: string }) => {
    askLauraProps.push({ question: props.question, label: props.label, accountId: props.accountId })
    return <span data-testid="ask-laura">{props.label}</span>
  },
}))

// #2151.59 — `CandidateNotes` a son propre test (`CandidateNotes.test.tsx`) ;
// ici on ne verrouille que le CÂBLAGE (siren/name transmis). Sans ce mock,
// chaque test de ce fichier déclencherait un vrai `apiFetch` non mocké.
const candidateNotesProps: Array<{ siren: string; candidateName: string }> = []

vi.mock('./CandidateNotes', () => ({
  CandidateNotes: (props: { siren: string; candidateName: string }) => {
    candidateNotesProps.push({ siren: props.siren, candidateName: props.candidateName })
    return <div data-testid="candidate-notes-stub" />
  },
}))

import { CandidateRow } from './CandidateRow'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

/**
 * #2166.1 — le logo n'est jamais deviné : il ne voyage que quand le candidat
 * est déjà un compte possédé de l'espace (`DiscoverPortfolioService`, apparié
 * sur le SIREN). Ce test verrouille le CÂBLAGE — la carte transmet exactement
 * ce que le candidat porte, sans rien inventer.
 *
 * ⚠️ `renderWithRouter` résout sa route sur un microtask (même patron que
 * `Discover.test.tsx`) — la première assertion passe par `find*`, jamais
 * `get*`, sinon elle lit un arbre encore vide.
 */
describe('CandidateRow (détail) — logo (#2166.1)', () => {
  it('transmet le logo et le site quand le candidat est un compte possédé', async () => {
    avatarProps.length = 0
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          name: 'Doctolib',
          logoUrl: 'https://logo.example/doctolib.png',
          website: 'doctolib.fr',
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(await screen.findByText('Doctolib')).toBeInTheDocument()
    expect(avatarProps).toEqual([
      { name: 'Doctolib', logoUrl: 'https://logo.example/doctolib.png', website: 'doctolib.fr' },
    ])
  })

  it('ne transmet ni logo ni site pour un candidat neuf — jamais un logo inventé', async () => {
    avatarProps.length = 0
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Nouvelle Cible' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Nouvelle Cible')
    expect(avatarProps).toEqual([{ name: 'Nouvelle Cible', logoUrl: null, website: null }])
  })
})

/**
 * #2166.3, RESTREINT par #2613 le 20/09/2026.
 *
 * Le rattachement capitalistique (groupe/filiale) reste rendu sur la carte
 * QUAND il est connu. Le cas « possédé sans lien connu » écrivait « Rattachement
 * non renseigné » ; Louis a tranché le 20/09 : « on affiche pas ce qu'on a
 * pas ». Une carte est une LISTE — la puce disparaît, elle ne se remplace pas.
 */
describe('CandidateRow (détail) — groupe / filiale (#2166.3)', () => {
  it('affiche le rôle quand un compte possédé porte un lien résolu', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'TF1', accountId: 'acc-1', groupRole: 'filiale', groupHeadSiren: '222222222' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(await screen.findByText('Filiale')).toBeInTheDocument()
  })

  // #2613 — la puce d'absence a disparu ; le reste de la carte est intact.
  it('n’écrit RIEN pour un compte possédé sans lien connu', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'PME Locale', accountId: 'acc-2', groupRole: null })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(await screen.findByText('PME Locale')).toBeInTheDocument()
    expect(screen.queryByText('Rattachement non renseigné')).not.toBeInTheDocument()
    expect(screen.queryByText(/non renseigné/i)).not.toBeInTheDocument()
  })

  it('n’affiche RIEN pour un candidat neuf — jamais deviné', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Nouvelle Cible 2' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Nouvelle Cible 2')
    expect(screen.queryByText('Rattachement non renseigné')).not.toBeInTheDocument()
    expect(screen.queryByText('Filiale')).not.toBeInTheDocument()
    expect(screen.queryByText('Tête de groupe')).not.toBeInTheDocument()
  })
})

// #3597 — les tests de densité de la carte pleine largeur (padding p-4, gap de la
// colonne actions) sont retirés avec elle : la ligne compacte a sa propre mise en page.

/**
 * #2489.1 (retour bêta 16/09, « bcp trop d'espace perdu par carte ») — la
 * cause qui restait après le resserrage des paddings/gaps ci-dessus : le bloc
 * « Pourquoi maintenant » réservait un titre ET une phrase d'espace vide sur
 * TOUTE carte sans signal daté — le cas le plus courant d'une recherche
 * Découvrir (les signaux datés sont rares). Tous les autres blocs factuels de
 * la carte (angle, rôles suggérés, sources) suivent déjà la règle « absent =
 * rien de rendu » ; celui-ci était la seule exception.
 */
describe('CandidateRow (détail) — #2489.1 un signal absent ne réserve pas de place', () => {
  it('sans signal daté, ni le titre « Pourquoi maintenant » ni son message ne sont rendus', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Sans Signal', signals: [] })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Sans Signal')
    expect(screen.queryByText('Pourquoi maintenant')).toBeNull()
    expect(screen.queryByText('Aucun déclencheur récent identifié — analyse non prioritaire')).toBeNull()
  })

  it('avec un signal daté, le titre et le signal restent rendus — non-régression', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          name: 'Avec Signal',
          signals: [
            { type: 'hiring', label: 'Recrute 3 devs', date: shiftLocalDays(new Date(), -3) },
            { type: 'business', label: 'Avec Signal expose au salon du Bourget', date: shiftLocalDays(new Date(), -5) },
          ],
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Avec Signal')
    // #4068 (Louis 13/10) — plus de seconde liste « Pourquoi maintenant ». #4495 — le fort est le SUJET de la
    // carte, et une fois dans la liste des faits de l'aperçu ; le contexte, à part, ne le répète pas.
    expect(screen.queryByText('Pourquoi maintenant')).toBeNull()
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Recrute 3 devs')
    expect(screen.getByTestId('candidate-facts')).toHaveTextContent('Recrute 3 devs')
    expect(screen.getByTestId('candidate-context-facts')).toHaveTextContent('salon du Bourget')
    expect(screen.getByTestId('candidate-context-facts')).not.toHaveTextContent('Recrute 3 devs')
  })
})

/* #2166.54 — la case de sélection est optionnelle : omise, elle ne rend rien
 * (les appelants qui n'en ont pas besoin ne changent pas). */
describe('CandidateRow (détail) — sélection (#2166.54)', () => {
  it('sans callback, aucune case n’apparaît', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('ACME')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('le clic sur la case appelle `onToggleSelected`', async () => {
    const onToggleSelected = vi.fn()
    renderWithRouter(
      <CandidateRow
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
        selected={false}
        onToggleSelected={onToggleSelected}
      />,
    )
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(onToggleSelected).toHaveBeenCalledTimes(1)
  })
})

/* #2151.55 / #2166.49 — « Trouver les commerciaux » / « Chercher les contacts » */
describe('CandidateRow (détail) — chercher les contacts', () => {
  it('sans callback, aucun bouton n’apparaît', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('ACME')
    expect(screen.queryByRole('button', { name: /chercher les contacts/i })).toBeNull()
  })

  it('#4308.1 — aucun bouton « chercher les contacts » dans la carte', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('ACME')
    expect(screen.queryByRole('button', { name: /chercher les contacts/i })).toBeNull()
  })

  /**
   * #2489.3 — le plancher de 44 px (GA-30) ne vaut qu'en pointeur GROSSIER
   * (CLAUDE.md : « cibles tactiles ≥ 44 px en pointeur grossier »). `AskLaura`
   * le fait déjà (`pointer-coarse:min-h-11`, `AskLaura.tsx`) ; ce bouton posait
   * `min-h-11` NU, donc 44 px même à la souris — un des rangs qui empilaient la
   * carte à 695 px en recette (#2489, mesuré 17/09 sur c66feff77, APRÈS le
   * resserrage de padding #2489.1 : la cause n'était donc pas le padding).
   */
  /**
   * #2489.5 — 695 px restaient mesurés APRÈS #2489.1 (padding) et #2489.3
   * (gap + min-h errant) : ce n'était ni le padding ni un plancher tactile,
   * mais le NOMBRE de rangs — neuf gestes (Ajouter au portefeuille / Écarter /
   * Analyser, Chercher les contacts, Expliquer avec Laura, Qualifier, Vérifier
   * aujourd'hui, Trouver les commerciaux, Préparer une approche partenaire)
   * empilés un par ligne dans une colonne de 300 px. Deux de ces blocs
   * s'enroulent désormais (`flex-wrap`) au lieu de s'empiler un par ligne —
   * même geste, aucune action retirée, juste moins de rangs.
   */
  it('#2489.5 — les liens de lecture (contacts/expliquer) s’enroulent au lieu de s’empiler', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    const quickLinks = await screen.findByTestId('candidate-card-quick-links')
    expect(quickLinks.className).toContain('flex-wrap')
    expect(quickLinks.className).not.toContain('flex-col')
  })

  it('#2489.5 — les quatre gestes Laura s’enroulent au lieu de s’empiler un par ligne', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    const lauraActions = await screen.findByTestId('candidate-card-laura-actions')
    expect(lauraActions.className).toContain('flex-wrap')
    expect(lauraActions.className).not.toContain('flex-col')
  })
})

/**
 * #2489.6 — 623 px mesurés en production le 17/09 (registre du 18/09), APRÈS
 * #2489.1/.3/.5 : le padding, le plancher tactile errant et l'empilement des
 * liens de lecture avaient déjà été corrigés, la carte restait haute. Le
 * dernier bloc encore empilé un par ligne était « Suivre ce compte » /
 * « Écarter » (`CandidateActions`, `orientation="column"`) — deux boutons
 * compacts qui tiennent côte à côte sur les 300 px de la colonne d'actions.
 * Même geste que #2489.5 : aucune action retirée, un rang de moins.
 */
describe('CandidateRow (détail) — densité, suite (#2489.6)', () => {
  it('« Suivre ce compte » et « Écarter » sont côte à côte, pas empilés (dans l’aperçu, #4495)', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    const essentials = within(await screen.findByTestId('candidate-essentials'))
    const follow = essentials.getByRole('button', { name: 'Suivre ce compte' })
    const dismiss = essentials.getByRole('button', { name: 'Écarter' })
    const secondaryRow = follow.parentElement
    expect(secondaryRow).toBe(dismiss.parentElement)
    expect(secondaryRow?.className).not.toContain('flex-col')
  })
})

/**
 * #2151.36 — la complémentarité n'est rendue QUE quand elle est fournie (mode
 * ESN/partenaire) et n'est jamais un score nu : les axes non évalués sont
 * NOMMÉS, jamais tus.
 */
describe('CandidateRow (détail) — complémentarité partenaire (#2151.36)', () => {
  it('ne rend rien quand la complémentarité n’est pas fournie (mode compte)', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('ACME')
    expect(screen.queryByTestId('partner-complementarity')).toBeNull()
  })

  it('nomme les axes non évalués plutôt que de les taire', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
        partnerComplementarity={{
          score: null,
          axes: [
            { axis: 'sectors', score: 100 },
            { axis: 'size', score: null },
            { axis: 'expertise', score: null },
            { axis: 'accounts', score: null },
          ],
          unmeasuredAxes: ['size', 'expertise', 'accounts'],
        }}
      />,
    )
    const block = await screen.findByTestId('partner-complementarity')
    expect(block.textContent).toContain('100')
    expect(block.textContent?.toLowerCase()).not.toMatch(/\b0\s*%/)
  })
})

/**
 * #2151.53 / #2151.54 / #2151.55 / #2151.56 — quatre gestes n'existaient pas
 * sur la carte (« Qualifier », « Vérifier aujourd'hui », « Trouver les
 * commerciaux », « Préparer une approche partenaire »). Les construire en
 * ROUTE ou en TABLE neuve aurait fabriqué une fonctionnalité que personne n'a
 * spécifiée ; le composant qui existe déjà pour « poser une question à Laura
 * pré-remplie, jamais envoyée seule » (`AskLaura`, D44 : Laura est une
 * SURCOUCHE, pas un second moteur) est le geste RÉEL le plus proche du littéral
 * — le commercial relit et envoie lui-même, rien n'est automatisé.
 */
describe('CandidateRow (détail) — gestes portés par Laura (#2151.53/.54/.55/.56)', () => {
  it('pose les quatre questions, nommant l’entreprise, sans compte de portée pour un candidat neuf', async () => {
    askLauraProps.length = 0
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Doctolib', accountId: null })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    // #4310.1 / #4308.1 — la carte ne porte plus que DEUX gestes Laura : « Expliquer avec Laura »
    // (#2166.52) et « Préparer une approche partenaire » (#2151.56).
    await screen.findByText('Doctolib')
    expect(askLauraProps).toHaveLength(2)
    expect(askLauraProps.every(p => p.question.includes('Doctolib'))).toBe(true)
    expect(askLauraProps.every(p => p.accountId === undefined)).toBe(true)
  })

  it('met le compte en portée quand le candidat en est déjà un', async () => {
    askLauraProps.length = 0
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Doctolib', accountId: 'acc-1' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Doctolib')
    expect(askLauraProps.every(p => p.accountId === 'acc-1')).toBe(true)
  })
})

/**
 * ⚠️ #4068 REVIENT SUR #2291.3 (18/09), DÉLIBÉRÉMENT — décision Louis 12/10.
 *
 * Ce bloc exigeait que la carte NOMME ses sources (« Sources : le BODACC,
 * France Travail », « la source de données d'entreprises »). Louis a renversé
 * cette règle le 12/10/2026 : « on nomme jamais les sources ». Si tu lis ceci
 * en croyant à une régression : ce n'en est pas une, c'est le renversement
 * (`doctrine-registry.ts`, #4068.4). Les tests d'avant (#2546.2) verrouillaient
 * le câblage `candidate.sources` → texte ; ils verrouillent désormais
 * l'inverse : AUCUN nom ne sort, quelle que soit la donnée reçue.
 */
describe('CandidateRow (détail) — aucune source nommée (#4068.4, renverse #2546.2 / #2291.3)', () => {
  const SOURCE_NAMES = ['BODACC', 'France Travail', 'BOAMP', 'APEC', 'WTTJ', 'DECP', 'Pappers', 'registre']

  it('même quand `sources` nomme des registres connus, aucune ligne « Sources : » ni aucun nom', async () => {
    const { container } = renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          name: 'Verdal Distribution (démo)',
          sources: [
            { name: 'BODACC', fetchedAt: '2026-08-01T09:00:00.000Z' },
            { name: 'France Travail', fetchedAt: '2026-08-01T09:00:00.000Z' },
            { name: 'pappers', fetchedAt: '2026-08-01T09:00:00.000Z' },
          ],
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Verdal Distribution (démo)')
    expect(screen.queryByText(/^Sources/)).toBeNull()
    const text = (container.textContent ?? '').toLowerCase()
    for (const name of SOURCE_NAMES) expect(text).not.toContain(name.toLowerCase())
  })

  it('un identifiant inconnu ne fait pas non plus de ligne « Sources : une source de données »', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          name: 'Cible sans registre reconnu',
          sources: [{ name: 'un-identifiant-que-rien-ne-reconnaît', fetchedAt: '2026-08-01T09:00:00.000Z' }],
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Cible sans registre reconnu')
    expect(screen.queryByText(/Sources :/)).toBeNull()
    expect(screen.queryByText(/une source de données/i)).toBeNull()
  })

  it('le candidat de registre sans signal ne dit pas « la source de données d’entreprises »', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          name: 'SCALIAN DS',
          signals: [],
          sources: [{ name: 'pappers', fetchedAt: '2026-09-18T09:00:00.000Z' }],
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('SCALIAN DS')
    expect(screen.queryByText(/source de données/i)).toBeNull()
  })
})

/**
 * #2151.59 — une note libre sur le candidat. Le composant lui-même
 * (`CandidateNotes`) a son propre test ; ici on verrouille seulement le
 * CÂBLAGE — la carte lui transmet le SIREN et le nom EXACTS du candidat, sans
 * rien deviner ni tronquer.
 */
describe('CandidateRow (détail) — note libre sur le candidat (#2151.59)', () => {
  it('transmet le siren et le nom du candidat à `CandidateNotes`', async () => {
    candidateNotesProps.length = 0
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Doctolib', siren: '441602748' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(await screen.findByTestId('candidate-notes-stub')).toBeInTheDocument()
    expect(candidateNotesProps).toEqual([{ siren: '441602748', candidateName: 'Doctolib' }])
  })
})

/**
 * #2291.2 — le modèle de contrat OBSERVÉ, sur la carte. Une observation porte
 * sa source, sa période et son volume ; cherché sans rien d'attribuable, la
 * carte dit « non observé » ; jamais cherché, elle se tait (comme les signaux).
 */
describe('CandidateRow (détail) — modèle de contrat observé (#2291.2)', () => {
  const card = (over: Partial<DiscoverCandidate>) =>
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate(over)}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )

  it('dit le volume, la période et la répartition — sans nommer la source, jamais un type à zéro', async () => {
    card({
      contractModel: {
        observedAt: '2026-09-19',
        jobOffers: {
          source: 'France Travail',
          total: 14,
          counts: { permanent: 9, fixedTerm: 2, interim: 0, freelance: 3, other: 0 },
          since: '2026-06-20',
          until: '2026-09-12',
        },
        publicContracts: {
          source: 'BOAMP',
          total: 3,
          regie: 2,
          fixedPrice: 0,
          since: '2026-02-01',
          until: '2026-08-01',
        },
      },
    })
    expect(await screen.findByText('Modèle de contrat observé')).toBeInTheDocument()
    const offers = screen.getByText(/14 offres publiées/)
    expect(offers.textContent).toMatch(/9 CDI/)
    expect(offers.textContent).toMatch(/3 indépendants/)
    // #4068 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : la source ne se nomme plus.
    expect(offers.textContent).not.toMatch(/France Travail/)
    expect(offers.textContent).not.toMatch(/0 intérim/)
    const notices = screen.getByText(/3 avis de marchés passés/)
    expect(notices.textContent).toMatch(/2 disent régie ou assistance technique/)
    expect(notices.textContent).not.toMatch(/BOAMP/)
  })

  it('cherché sans rien d’attribuable : « non observé », jamais une préférence', async () => {
    card({ signalsSearched: true, contractModel: null })
    expect(await screen.findByText(/Modèle de contrat : non observé/)).toBeInTheDocument()
  })

  it('jamais cherché : la carte se tait', async () => {
    card({})
    await screen.findByTestId('candidate-notes-stub')
    expect(screen.queryByText(/Modèle de contrat/)).not.toBeInTheDocument()
  })
})

describe('CandidateRow (détail) — référence comparable (#2166.11, épopée #2806)', () => {
  it('nomme le compte du portefeuille apparié sur le secteur', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          name: 'Nouvelle Cible',
          similarityHeadline: { kind: 'sector', referenceAccount: 'Decathlon' },
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(await screen.findByText('Decathlon')).toBeInTheDocument()
    expect(screen.getByText(/dans ton portefeuille/i)).toBeInTheDocument()
  })

  it('sans appariement, aucune ligne — jamais un texte de repli deviné', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Nouvelle Cible' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByText('Nouvelle Cible')
    expect(screen.queryByText(/dans ton portefeuille/i)).not.toBeInTheDocument()
  })
})

/**
 * #3551 (recette prod Y8 02/10) — une même carte affichait « Fit élevé »,
 * « 0/70 · 2 axes non évaluables » ET « 80/100 » : trois lectures d'UN score.
 * La décomposition en cinq axes du palier concurrençait le score d'intérêt
 * (auditable, avec ses facteurs) juste dessous. UN seul nombre par carte.
 */
describe('CandidateRow (détail) — un seul score par carte (#3551)', () => {
  it('« Fit élevé » + 80/100, jamais un second « 0/70 » à côté', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ score: 80, scoreMax: 100, scoreUnmeasured: [] })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByTestId('candidate-row')
    // Théo decouvrir.R6 — le score auditable vit dans le tiroir « Aperçu du compte » : on lit tout le document.
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/80\s*\/\s*100/)
    expect(text).not.toMatch(/0\s*\/\s*70/)
    expect(text).not.toMatch(/non évaluable/)
  })
})

/**
 * #3907 — « ils ne disent pas à chaque fois ce que fait la boîte » (call bêta
 * 08/10/2026). Le code NAF brut (« 6202A ») n'est jamais affiché : la carte ne
 * montre que le libellé d'activité, et rien quand aucun n'est connu.
 *
 * Recette prod 09/10 — PARTIEL : l'activité décodée n'apparaissait que dans le
 * détail déplié, jamais sur la carte elle-même. Le libellé vit désormais sur
 * `candidate-row` (toujours visible), plus dupliqué dans le détail.
 */
describe('CandidateRow — ce que fait l’entreprise SUR LA CARTE, jamais un code NAF brut (#3907)', () => {
  it('nomme l’activité SUR LA CARTE (pas seulement dans le détail déplié) quand la source la donne', async () => {
    renderWithRouter(
      <CandidateRow
        candidate={candidate({ sector: 'Conseil en systèmes et logiciels informatiques', nafCode: '6202A' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    const card = await screen.findByTestId('candidate-row')
    expect(card).toHaveTextContent('Conseil en systèmes et logiciels informatiques')
    expect(card.textContent).not.toMatch(/6202A/)
    expect(screen.queryByTestId('candidate-row-details')).toBeNull()
  })

  it('n’affiche jamais le code NAF brut, même sans libellé d’activité connu, et aucune ligne vide', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({ sector: null, nafCode: '0130Z' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    const card = await screen.findByTestId('candidate-row')
    expect(screen.queryByTestId('candidate-sector')).toBeNull()
    expect(card.textContent).not.toMatch(/0130Z/)
    expect(card.textContent).not.toMatch(/NAF/)
  })
})

describe('CandidateRow — d’où vient le secteur (#4358.4)', () => {
  const render = (over: Partial<DiscoverCandidate>) =>
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate(over)}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )

  it.each([
    ['naf', /code NAF/],
    ['declared_activity', /activité déclarée/],
    ['website', /au site/],
  ] as const)('la carte dit la provenance « %s »', async (basis, expected) => {
    render({ sector: 'Commerce en ligne', sectorBasis: basis })
    expect(await screen.findByTestId('candidate-sector-basis')).toHaveTextContent(expected)
  })

  it('sait dire NON : sans provenance connue, la carte n’en invente pas', async () => {
    render({ sector: 'Commerce en ligne' })
    await screen.findByTestId('candidate-sector')
    expect(screen.queryByTestId('candidate-sector-basis')).toBeNull()
  })

  it('sait dire NON : sans secteur, aucune provenance non plus', async () => {
    render({ sector: null, sectorBasis: 'naf' })
    await screen.findByTestId('candidate-row')
    expect(screen.queryByTestId('candidate-sector-basis')).toBeNull()
  })
})
