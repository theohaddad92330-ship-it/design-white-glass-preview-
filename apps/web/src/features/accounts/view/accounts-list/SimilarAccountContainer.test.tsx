import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SimilarAccountContainer } from './SimilarAccountContainer'

let suggestions: SimilarAccountSuggestion[] = []

vi.mock('@/features/accounts/hooks/useSimilarAccountsToExplore', () => ({
  useSimilarAccountsToExplore: () => ({ data: suggestions, isLoading: false }),
}))

function suggestion(n: number): SimilarAccountSuggestion {
  return {
    id: `s-${n}`,
    company_name: `Société ${n}`,
    sector: 'Banque — autres intermédiations monétaires (NAF 64.19Z)',
    description: `Description ${n}`,
    score_similarity: 0.9,
    similarity_reasons: ['sector'],
  } as SimilarAccountSuggestion
}

beforeEach(() => {
  suggestions = []
})

/**
 * #1316.5 — « le bloc actuel est trop étroit et coupé ».
 *
 * Dix suggestions dans une colonne de 288 px vivaient derrière un second
 * ascenseur vertical. Le retour donne la sortie : « 2–3 recommandations bien
 * présentées puis un CTA ».
 */
describe('SimilarAccountContainer', () => {
  it('n’affiche que trois suggestions, et annonce le reste (#1316.5)', async () => {
    suggestions = [1, 2, 3, 4, 5, 6].map(suggestion)
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText('Société 1')).toBeInTheDocument()
    expect(screen.getByText('Société 3')).toBeInTheDocument()
    expect(screen.queryByText('Société 4')).not.toBeInTheDocument()
    // Le compte annoncé est celui du RESTE, pas du total : « voir les 6 autres »
    // sur six suggestions dont trois sont déjà à l'écran serait faux.
    expect(screen.getByRole('button', { name: 'Voir les 3 autres suggestions' })).toBeInTheDocument()
  })

  it('ouvre le reste SUR PLACE, sans quitter l’écran (#1316.5)', async () => {
    suggestions = [1, 2, 3, 4, 5, 6].map(suggestion)
    renderWithRouter(<SimilarAccountContainer />)
    await screen.findByText('Société 1')

    await userEvent.click(screen.getByRole('button', { name: 'Voir les 3 autres suggestions' }))

    expect(screen.getByText('Société 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réduire' })).toBeInTheDocument()
  })

  it('ne propose AUCUN repli quand tout tient déjà — la garde sait dire non', async () => {
    suggestions = [1, 2].map(suggestion)
    renderWithRouter(<SimilarAccountContainer />)
    await screen.findByText('Société 1')

    expect(screen.queryByRole('button', { name: /^Voir les .* autres suggestions$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réduire' })).not.toBeInTheDocument()
  })

  it('affiche le secteur LISIBLE, pas la fiche NAF (#1315.3)', async () => {
    suggestions = [suggestion(1)]
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText('Banque')).toBeInTheDocument()
    expect(screen.queryByText(/NAF 64\.19Z/)).not.toBeInTheDocument()
  })
})

/**
 * #1576 — LA RAISON PRINCIPALE, ET LE COMPTE QU'ELLE NOMME.
 *
 * Le symptôme signalé : les trois cartes portaient la MÊME phrase — « Proposé à
 * partir du secteur de tes comptes récents ». Chaque test ci-dessous vérifie
 * qu'une carte dit UNE chose, et qu'elle NOMME un compte du portefeuille.
 */
describe('SimilarAccountContainer — la raison principale (#1576)', () => {
  const withHeadline = (
    headline: SimilarAccountSuggestion['similarity_headline'],
    over: Partial<SimilarAccountSuggestion> = {},
  ) =>
    [
      {
        ...suggestion(1),
        score_similarity: undefined,
        similarity_reasons: undefined,
        similarity_headline: headline,
        ...over,
      },
    ] as SimilarAccountSuggestion[]

  it('« compte jumeau » nomme le compte gagné', async () => {
    suggestions = withHeadline({ kind: 'twin', referenceAccount: 'Thales' })
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText(/Ressemble à/)).toHaveTextContent('Ressemble à Thales, où tu as gagné une mission')
  })

  it('« environnement technologique » LISTE les technologies et interdit « stack proche » (#1632)', async () => {
    suggestions = withHeadline({ kind: 'tech', referenceAccount: 'Thales', technologies: ['java', 'c++', 'python'] })
    renderWithRouter(<SimilarAccountContainer />)

    const line = await screen.findByText(/Environnement technologique proche de/)
    expect(line).toHaveTextContent('Environnement technologique proche de Thales : java, c++, python')
    expect(screen.queryByText(/stack proche/i)).not.toBeInTheDocument()
  })

  it('nomme la PROVENANCE plutôt que l’aveu anonyme quand rien du profil n’a matché', async () => {
    suggestions = withHeadline({ kind: 'sector', referenceAccount: 'SNCF' })
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText(/Même secteur que/)).toHaveTextContent(
      'Même secteur que SNCF, dans ton portefeuille',
    )
    expect(screen.queryByText('Proposé à partir du secteur de tes comptes récents')).not.toBeInTheDocument()
  })

  it('n’écrit QU’UNE raison : les critères du profil se taisent derrière une raison nommée', async () => {
    suggestions = withHeadline(
      { kind: 'twin', referenceAccount: 'Thales' },
      {
        score_similarity: 0.9,
        similarity_reasons: ['sector', 'geo'],
      },
    )
    renderWithRouter(<SimilarAccountContainer />)

    await screen.findByText(/Ressemble à/)
    expect(screen.queryByText(/même secteur que tes cibles/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Proche de ta cible sur plusieurs critères')).not.toBeInTheDocument()
  })

  it('garde le comportement d’AVANT quand le profil est recoupé et qu’aucune raison forte n’existe', async () => {
    suggestions = withHeadline(
      { kind: 'sector', referenceAccount: 'SNCF' },
      {
        score_similarity: 0.9,
        similarity_reasons: ['sector'],
      },
    )
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText('Proche de ta cible sur plusieurs critères')).toBeInTheDocument()
    expect(screen.queryByText(/Même secteur que SNCF/)).not.toBeInTheDocument()
  })

  it('garde l’aveu d’origine pour une réponse d’API antérieure au champ', async () => {
    suggestions = withHeadline(undefined)
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText('Proposé à partir du secteur de tes comptes récents')).toBeInTheDocument()
  })

  it('met en gras le NOM du compte, et rien d’autre (#1576)', async () => {
    suggestions = withHeadline({ kind: 'twin', referenceAccount: 'Thales' })
    const { container } = renderWithRouter(<SimilarAccountContainer />)
    await screen.findByText(/Ressemble à/)

    const bold = [...container.querySelectorAll('span.font-semibold')].map(node => node.textContent)
    expect(bold).toContain('Thales')
  })
})

/**
 * #1576 — LA PLACE DE LA RAISON DANS LA CARTE.
 *
 * jsdom ne met rien en page : ce test ne peut pas mesurer les 91 px trouvés en
 * production le 08/09/2026. Il tient la seule chose qui SOIT vérifiable ici et
 * qui produit la largeur — la STRUCTURE. Tant que la raison est un enfant de la
 * colonne du milieu, elle partage sa gouttière avec l'avatar et la pastille
 * « Analyser » ; sortie au niveau du bouton, elle a la carte entière.
 */
describe('SimilarAccountContainer — la raison a la largeur de la carte (#1576)', () => {
  it('la raison est SŒUR de la ligne, pas enfant de la colonne du milieu', async () => {
    suggestions = [
      {
        ...suggestion(1),
        score_similarity: undefined,
        similarity_reasons: undefined,
        similarity_headline: { kind: 'twin', referenceAccount: 'NOVA LOGISTIQUE (client d’exemple)' },
      } as SimilarAccountSuggestion,
    ]
    const { container } = renderWithRouter(<SimilarAccountContainer />)
    await screen.findByText(/Ressemble à/)

    // ⚠️ PAS le premier `span.font-semibold` du document : l'initiale de l'avatar
    // en est un, et le test mesurait alors la LIGNE au lieu de la raison — il
    // passait au vert sur la structure d'avant.
    const bold = [...container.querySelectorAll('span.font-semibold')].find(
      node => node.textContent === 'NOVA LOGISTIQUE (client d’exemple)',
    )!
    const reason = bold.closest('div')!
    const name = screen.getByText('Société 1')
    const pill = screen.getByText('Analyser')

    // Le plus proche ancêtre commun de la raison et du NOM de l'entreprise doit
    // être le bouton lui-même : s'il s'agissait de la colonne du milieu, la
    // raison en hériterait la largeur.
    const button = reason.closest('button')!
    expect(button).toBe(name.closest('button'))
    const middleColumn = name.closest('div.flex-1')!
    expect(middleColumn.contains(reason)).toBe(false)
    // Et elle n'est pas non plus dans la ligne qui porte la pastille.
    expect(pill.closest('span')!.parentElement!.contains(reason)).toBe(false)
  })
})

/**
 * #2040.18 — UN SCORE N'EST JAMAIS NU : CE QUI N'A PAS PU ÊTRE ÉVALUÉ EST NOMMÉ.
 *
 * Le serveur ne publie plus `score_similarity` tant que les trois axes du
 * rapprochement (secteurs, zone, taille) n'étaient pas tous ÉVALUABLES — sinon
 * le scalaire mesure la complétude du questionnaire, pas la proximité du
 * compte. La carte nomme alors les axes muets, et surtout elle ne se contredit
 * plus : « rien ne l'a rapproché de toi » ne peut pas cohabiter avec « même
 * secteur que tes cibles ».
 */
describe('SimilarAccountContainer — ce qui n’a pas pu être évalué est NOMMÉ (#2040.18)', () => {
  it('LIT un corpus non vide — une suggestion est bien rendue', async () => {
    suggestions = [
      { ...suggestion(1), score_similarity: undefined, similarity_unevaluated: ['geo', 'size'] },
    ] as SimilarAccountSuggestion[]
    renderWithRouter(<SimilarAccountContainer />)
    expect(await screen.findByText('Société 1')).toBeInTheDocument()
  })

  it('nomme les axes que le questionnaire n’a pas renseignés, sur la ligne des critères', async () => {
    suggestions = [
      {
        ...suggestion(1),
        score_similarity: undefined,
        similarity_reasons: ['sector'],
        similarity_unevaluated: ['geo', 'size'],
        similarity_confidence: 'partielle',
      },
    ] as SimilarAccountSuggestion[]
    renderWithRouter(<SimilarAccountContainer />)

    expect(
      await screen.findByText(
        /même secteur que tes cibles · non évalué : ta zone, la taille visée — tu ne l’as pas encore renseigné/,
      ),
    ).toBeInTheDocument()
  })

  it('ne se contredit plus : un critère matché SANS score ne se lit pas « rien ne t’en rapproche »', async () => {
    suggestions = [
      {
        ...suggestion(1),
        score_similarity: undefined,
        similarity_reasons: ['sector'],
        similarity_unevaluated: ['geo', 'size'],
      },
    ] as SimilarAccountSuggestion[]
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText('Proche de ta cible sur un critère')).toBeInTheDocument()
    expect(screen.queryByText('Proposé à partir du secteur de tes comptes récents')).not.toBeInTheDocument()
  })

  it('témoin — les trois axes évaluables : rien n’est nommé en creux, la carte est celle d’avant', async () => {
    suggestions = [
      { ...suggestion(1), similarity_confidence: 'etayee', similarity_reasons: ['sector'] },
    ] as SimilarAccountSuggestion[]
    renderWithRouter(<SimilarAccountContainer />)

    expect(await screen.findByText('même secteur que tes cibles')).toBeInTheDocument()
    expect(screen.queryByText(/non évalué/)).not.toBeInTheDocument()
  })
})
