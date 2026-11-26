/**
 * ⚠️ #2613 — CE FICHIER A BASCULÉ. Décision de Louis du 20/09/2026 :
 * « on affiche pas ce qu'on a pas, on va pas mettre non mesuré et tout ça,
 * ça envoie juste un signal négatif à l'user qui est pas utile. »
 * Portée tranchée le même jour : **partout dans les LISTES, mais un SCORE
 * garde ses axes.**
 *
 * ⚠️ CE QUI TIENT ENCORE, et qui est le VRAI sujet des tests d'en dessous :
 * « MESURÉ À ZÉRO » n'est pas « NON MESURÉ ». « Aucun signal mesuré » se dit
 * toujours, parce qu'on a cherché. C'est le « non mesuré » — « je n'ai pas pu
 * regarder » — qui ne s'écrit plus, et qui ne devient surtout pas un « 0 ».
 *
 * Si tu lis ceci en croyant à une régression : ce n'en est pas une, c'est le
 * renversement. Garde : `apps/web/src/architecture/
 * une-absence-ne-fait-pas-une-ligne.test.ts`.
 */
import { shiftLocalDays } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

const avatarProps: Array<{ name: string; logoUrl?: string | null; website?: string | null }> = []

// #2166.1 — même câblage que `CandidateCard.test.tsx` : verrouille que la ligne
// compacte transmet le logo tel quel, sans rien inventer.
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: (props: { name: string; logoUrl?: string | null; website?: string | null }) => {
    avatarProps.push({ name: props.name, logoUrl: props.logoUrl ?? null, website: props.website ?? null })
    return null
  },
}))

// #3597.7 — le repliable monte `CandidateNotes` (requête réseau) : son propre test
// existe (`CandidateNotes.test.tsx`), ici on ne verrouille que la ligne.
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
// LUDB.3 — le vocabulaire suit le pack de l'espace (session) ; ici l'espace IT : libellés d'origine.
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
// #3671.2bis — même raison : `CandidateWrongCompanyAction` a son propre test
// (`CandidateWrongCompanyAction.test.tsx`), et appelle `useMutation` (QueryClient).
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

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
    establishmentCount: null,
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
 * La vue liste compacte doit rester une lecture FIDÈLE de la carte : mêmes faits
 * de registre, même palier de fit dérivé du score, mêmes gestes gradués — juste
 * plus dense. Ce fichier verrouille qu'elle rend l'essentiel décisionnel et
 * n'invente rien de plus que la carte.
 */
describe('CandidateRow', () => {
  it('rend le nom, le score auditable et le palier de fit nommé', () => {
    render(
      <CandidateRow
        // #4068.3 — score et palier de fit ont quitté la ligne : ils vivent dans le repliable.
        defaultOpen
        candidate={candidate({ name: 'Doctolib', score: 70, scoreMax: 100 })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByText('Doctolib')).toBeInTheDocument()
    expect(screen.getAllByText('70/100').length).toBeGreaterThan(0)
    // 70 % du mesurable sur 5 blocs → « Fit élevé » (même population que « fort potentiel »).
    expect(screen.getAllByText(/fit élevé/i).length).toBeGreaterThan(0)
  })

  /**
   * #3877.4 — le nombre d'établissements distingue, SANS gonfler le nombre de
   * comptes (un compte reste une ligne, dédupliqué par SIREN), qu'UN compte
   * tient plusieurs sites. Muet à 1 (ou non mesuré) : ça ne distingue rien de
   * l'immense majorité des comptes, et un chiffre pour chacun ferait du bruit.
   */
  // #4433 — un compte remonté par élargissement porte son étiquette ; un compte exact n'en porte aucune.
  it('#4433 — étiquette « proche : JavaScript » sur un compte élargi, rien sur un compte exact', () => {
    const { rerender } = render(
      <CandidateRow
        candidate={candidate({ widenedBy: { axis: 'skill', tier: 1, code: 'javascript' } })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByTestId('widened-chip')).toHaveTextContent('proche : JavaScript')
    rerender(
      <CandidateRow
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByTestId('widened-chip')).toBeNull()
  })

  // #4436.3 — l'effectif absent (ou « 00 » INSEE, non publié) ne s'écrit jamais « 0 salarié » : le compte reste, la taille se dit non publiée.
  it('#4436.3 — effectif absent : « taille non publiée », jamais « 0 salarié » ; effectif connu : sa tranche seule', () => {
    const props = { isFollowed: false, onToggleFollow: () => {}, onDismiss: () => {}, onAnalyze: () => {} }
    const { rerender } = render(<CandidateRow candidate={candidate({ headcountRange: null })} {...props} />)
    expect(screen.getByTestId('candidate-size-unpublished')).toHaveTextContent('taille non publiée')
    expect(document.body.textContent).not.toMatch(/\b0\s*salarié/i)
    rerender(<CandidateRow candidate={candidate({ headcountRange: '250 à 499 salariés' })} {...props} />)
    expect(screen.getByText('250 à 499 salariés')).toBeInTheDocument()
    expect(screen.queryByTestId('candidate-size-unpublished')).toBeNull()
  })

  // #4436.3 — recette prod 23/10 : SANS département, la source nationale livrait le libellé DÉJÀ écrit « 0 salarié ».
  it.each(['0 salarié', '0 à 0 salariés', 'Entre 0 et 0 salariés', 'Pas de salarié'])(
    '#4436.3 — un libellé nul (« %s ») se dit « taille non publiée », jamais « 0 salarié »',
    label => {
      const props = { isFollowed: false, onToggleFollow: () => {}, onDismiss: () => {}, onAnalyze: () => {} }
      render(<CandidateRow candidate={candidate({ headcountRange: label })} {...props} />)
      expect(screen.getByTestId('candidate-size-unpublished')).toHaveTextContent('taille non publiée')
      expect(document.body.textContent).not.toMatch(/\b0\s*(à\s*0\s*)?salarié/i)
    },
  )

  it('#3877.4 — nomme le nombre d’établissements au-delà d’un seul', () => {
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ establishmentCount: 12 })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByTestId('candidate-establishment-count')).toHaveTextContent('12 établissements')
  })

  // #3705.5 — le rattachement à un groupe, SOURCÉ, se dit comme un fait ; un indice de mandataire
  // reste un « probable » ; une absence ne fait AUCUNE ligne.
  it('#3705.5 — nomme « Filiale de <groupe> » sur un lien capitalistique sourcé', () => {
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ groupLink: { kind: 'capital_link', entities: ['GROUPE X'] } })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByTestId('candidate-group-link')).toHaveTextContent('Filiale de GROUPE X')
  })

  it('#3705.5 — un mandataire personne morale reste un rattachement probable', () => {
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ groupLink: { kind: 'legal_entity_officer', entities: ['HOLDING Y'] } })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByTestId('candidate-group-link')).toHaveTextContent('Filiale probable de HOLDING Y')
  })

  it('#3705.5 — sans lien de groupe, aucune ligne', () => {
    render(
      <CandidateRow
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByTestId('candidate-group-link')).not.toBeInTheDocument()
  })

  it('#3877.4 — reste muet à un seul établissement, ou non mesuré', () => {
    render(
      <CandidateRow
        candidate={candidate({ establishmentCount: 1 })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByTestId('candidate-establishment-count')).not.toBeInTheDocument()

    render(
      <CandidateRow
        candidate={candidate({ establishmentCount: null })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryAllByTestId('candidate-establishment-count')).toHaveLength(0)
  })

  it('#4068.1 — la ligne liste le fait avec sa DATE, sa NATURE et son libellé', () => {
    const date = shiftLocalDays(new Date(), -20)
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ signals: [{ type: 'hiring', label: 'Architecte cloud H/F', date }] })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    const facts = screen.getByTestId('candidate-facts')
    expect(facts).toHaveTextContent(`${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`)
    expect(facts).toHaveTextContent('Recrutement')
    expect(facts).toHaveTextContent('Architecte cloud H/F')
  })

  /**
   * #3906 → #4068.1 — le fait ancien ne se cache plus derrière la fenêtre de fraîcheur : il se
   * DIT avec sa date (jamais présenté comme un déclencheur d'hier). Décision Louis 12/10.
   */
  it('#4068.1 — un fait de 109 jours reste listé, daté, même avec une fenêtre de recherche de 90 jours', () => {
    const date = shiftLocalDays(new Date(), -109)
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ signals: [{ type: 'tender', label: 'Appel d’offres', date }] })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
        searchCriteria={{ ...emptyUnifiedFilters(), sinceDays: 90 }}
      />,
    )
    expect(screen.getByTestId('candidate-facts')).toHaveTextContent('Appel d’offres')
  })

  /**
   * #2546.1 — un compte proposé porte SON signal ; un compte SANS signal
   * mesuré le DIT, il n'est pas présenté comme les autres. La ligne compacte
   * ne rendait RIEN du tout quand `signals` était vide (`{candidate.signals
   * .length > 0 && (...)}`) : un compte sans déclencheur avait exactement le
   * même blanc qu'un compte qui en porte un, sur une ligne coupée avant
   * d'atteindre ce bloc. Le nom du compte n'y suffit pas — c'est le silence,
   * pas un texte, qui masquait la distinction.
   *
   * Décision 1 (18/09/2026) — « aucun signal mesuré » n'est vrai QUE si la
   * recherche a réellement cherché (`signalsSearched: true`) : un candidat
   * hors des premières lignes ciblées n'a pas été interrogé, et le dire
   * « sans signal » serait exactement le « 0 » à la place d'un « non mesuré »
   * que la doctrine interdit (GA-18/19). Voir le test suivant.
   */
  it('#2546.1 — dit « aucun signal mesuré » quand la recherche a réellement cherché', () => {
    render(
      <CandidateRow
        candidate={candidate({ name: 'Sans Signal', signals: [], signalsSearched: true })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByText(/aucun signal mesuré/i)).toBeInTheDocument()
  })

  // #2613 — restreint la Décision 1 du 18/09 : un candidat non interrogé ne dit
  // plus « signaux non mesurés ». Ce qui reste interdit, et qui était son objet :
  // lui écrire « aucun signal », c'est-à-dire un « 0 » sur une non-mesure.
  //
  // #3819.1 (07/10/2026) — ce candidat ne reste PLUS muet : « Non cherché :
  // offres » (voir `notSearchedAxes`) répond exactement à ce que l'issue
  // #3819 nommait — « muet si jamais interrogé » — sans jamais écrire
  // « aucun signal » ni deviner une mesure.
  it('Décision 1 (18/09/2026), restreinte par #2613, complétée par #3819.1 — un candidat non ciblé NOMME ce qui n’a pas été cherché, jamais « aucun signal »', () => {
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ name: 'Hors cible', signals: [], signalsSearched: false })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByText(/aucun signal mesuré/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/signaux non mesurés/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('not-searched')).toHaveTextContent(
      /offres et signaux de cette entreprise n’ont pas été recherchés/,
    )
    // …et le nom du compte, lui, reste : la ligne ne disparaît pas.
    expect(screen.getByText('Hors cible')).toBeInTheDocument()
  })

  // #3819.1 — « besoins connus », SEULEMENT pour un compte déjà possédé ; un
  // décompte à 0 ne fait AUCUNE ligne (dans une liste, une absence ne s'affiche jamais).
  it('affiche le compte de besoins connus pour un compte possédé', () => {
    render(
      <CandidateRow
        candidate={candidate({ accountId: 'acc-1', knownNeedsCount: 3 })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByText('3 besoins connus')).toBeInTheDocument()
  })

  it('n’affiche aucune ligne de besoins à 0 — une absence ne s’affiche jamais dans une liste', () => {
    render(
      <CandidateRow
        candidate={candidate({ accountId: 'acc-1', knownNeedsCount: 0 })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByText(/besoin/i)).not.toBeInTheDocument()
  })

  // #3819.1 — « le lien avec les critères/compétences saisis ».
  it('nomme les critères saisis que ce candidat satisfait', () => {
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate({ nafCode: '6201Z', city: 'Lille' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
        searchCriteria={{
          ...emptyUnifiedFilters(),
          sectors: ['software_tech'],
          city: 'Lille',
        }}
      />,
    )
    expect(screen.getByTestId('matched-criteria')).toHaveTextContent('Correspond à : secteur, zone')
  })

  it('ne nomme rien sans critère saisi — pas de lien inventé', () => {
    render(
      <CandidateRow
        candidate={candidate({ nafCode: '6201Z', city: 'Lille' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByTestId('matched-criteria')).not.toBeInTheDocument()
  })

  it('cumule offres et besoins dans la mention compacte quand aucun des deux n’a pu être cherché', async () => {
    renderWithRouter(
      <CandidateRow
        defaultOpen
        candidate={candidate({
          accountId: 'acc-1',
          signals: [],
          signalsSearched: false,
          knownNeedsCount: undefined,
        })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(await screen.findByTestId('not-searched')).toHaveTextContent(
      /n’ont pas été recherchés.*n’ont pas pu être comptés/,
    )
  })

  it('n’affiche aucun palier quand le score est indisponible — jamais « fit faible » sur rien', () => {
    render(
      <CandidateRow
        candidate={candidate({ score: null, scoreMax: null })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByText(/fit (élevé|moyen|faible)/i)).not.toBeInTheDocument()
    // #3597.8 — un score absent ne fait aucune ligne dans la liste (il se dit dans le détail).
    expect(screen.queryByText(/indisponible/i)).not.toBeInTheDocument()
  })

  it('propose les mêmes gestes gradués que la carte, coût inclus', async () => {
    const onAnalyze = vi.fn()
    const onToggleFollow = vi.fn()
    render(
      <CandidateRow
        defaultOpen
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={onToggleFollow}
        onDismiss={() => {}}
        onAnalyze={onAnalyze}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /suivre ce compte/i }))
    expect(onToggleFollow).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: /construire le dossier/i }))
    expect(onAnalyze).toHaveBeenCalledOnce()
  })

  it('#2166.1 — transmet le logo du compte possédé, jamais un logo inventé pour un candidat neuf', () => {
    avatarProps.length = 0
    render(
      <CandidateRow
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
    expect(avatarProps).toEqual([
      { name: 'Doctolib', logoUrl: 'https://logo.example/doctolib.png', website: 'doctolib.fr' },
    ])

    avatarProps.length = 0
    render(
      <CandidateRow
        candidate={candidate({ name: 'Nouvelle Cible' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(avatarProps).toEqual([{ name: 'Nouvelle Cible', logoUrl: null, website: null }])
  })

  /* #2166.54 — même contrat que `CandidateCard` : la case est optionnelle. */
  it('sans callback, aucune case n’apparaît', () => {
    render(
      <CandidateRow
        candidate={candidate()}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('le clic sur la case appelle `onToggleSelected`', () => {
    const onToggleSelected = vi.fn()
    render(
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
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggleSelected).toHaveBeenCalledTimes(1)
  })
})

describe('CandidateRow — référence comparable (#2166.11, épopée #2806)', () => {
  it('nomme le compte du portefeuille apparié sur le secteur', () => {
    render(
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
    expect(screen.getByText('Decathlon')).toBeInTheDocument()
  })

  it('sans appariement, aucune ligne', () => {
    render(
      <CandidateRow
        candidate={candidate({ name: 'Nouvelle Cible' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByText(/dans ton portefeuille/i)).not.toBeInTheDocument()
  })

  // #3238 (recette prod 02/10) — la ville du SITE qui publie se lit sur la ligne,
  // pas seulement « Lille · 59 » ; une absence ne fait aucune puce.
  it('#3238 — montre les villes de site des offres à côté du siège', () => {
    const withSites = candidate({
      city: 'Lille',
      department: '59',
      signals: [
        { type: 'hiring', label: 'Offre A', date: '2026-06-20', siteCity: 'Lyon' },
        { type: 'hiring', label: 'Offre B', date: '2026-06-08', siteCity: 'Marseille' },
      ] as DiscoverCandidate['signals'],
    })
    render(
      <CandidateRow
        defaultOpen
        candidate={withSites}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.getByText('Lille · 59')).toBeInTheDocument()
    expect(screen.getByText('Sites : Lyon, Marseille')).toBeInTheDocument()
  })

  // #3238 (recette démo 06/10) — la carte REPLIÉE (vue par défaut) ne montrait que « Lille · 59 » : le
  // chip n'existait que dans le détail déplié. Il vit sur la ligne, une seule fois (GA-26), repliée ou non.
  it('#3238 — « Sites : Lyon, Marseille » se lit sur la carte REPLIÉE, et une seule fois quand elle est dépliée', () => {
    const withSites = candidate({
      city: 'Lille',
      department: '59',
      signals: [
        { type: 'hiring', label: 'Offre A', date: '2026-06-20', siteCity: 'Lyon' },
        { type: 'hiring', label: 'Offre B', date: '2026-06-08', siteCity: 'Marseille' },
      ] as DiscoverCandidate['signals'],
    })
    const props = {
      candidate: withSites,
      isFollowed: false,
      onToggleFollow: () => {},
      onDismiss: () => {},
      onAnalyze: () => {},
    }
    const { unmount } = render(<CandidateRow {...props} />)
    expect(screen.getByText('Sites : Lyon, Marseille')).toBeInTheDocument()
    unmount()
    render(<CandidateRow {...props} defaultOpen />)
    expect(screen.getAllByText('Sites : Lyon, Marseille')).toHaveLength(1)
  })

  it('#3238 ⚠️ SAIT DIRE NON — sans ville de site, aucune puce « Sites »', () => {
    render(
      <CandidateRow
        candidate={candidate({ city: 'Lille' })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByText(/^Sites :/)).not.toBeInTheDocument()
  })

  // #3876 (recette prod 08/10, WIOSS WITRON) — « afficher la commune quand elle
  // est connue ; sinon ne rien afficher (pas de libellé vide) ». Déjà là :
  // CandidateRow.tsx:124-127 ne rend la puce que si city OU department existe.
  it('#3876 ⚠️ SAIT DIRE NON — ni ville ni département connus : aucune puce, jamais un libellé vide', () => {
    render(
      <CandidateRow
        candidate={candidate({ city: null, department: null })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    expect(screen.queryByText('·')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\s*·\s*$/)).not.toBeInTheDocument()
  })
})
