import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { findCatalogueSubStep } from '@/features/onboarding/lib/questions'
import type { OnboardingAnswers, OnboardingPrefillMeta } from '@/stores/onboardingStore'
import { SubStepQuestions } from './SubStepQuestions'

/**
 * The prefill badges are the only thing telling a user "this answer is a
 * suggestion, not something you said". They must be legible, carry the source,
 * and turn cautious on low confidence.
 */

const SUB = findCatalogueSubStep('company_info', 'entreprise')

const onChange = vi.fn()

beforeEach(() => {
  onChange.mockReset()
})

async function render(prefillMeta?: OnboardingPrefillMeta): Promise<void> {
  renderWithRouter(
    <>
      <SubStepQuestions
        questions={SUB?.questions ?? []}
        answers={{ esn_name: 'Kicklox', consultant_size: '10-30' }}
        onChange={onChange}
        prefillMeta={prefillMeta}
      />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

/** #2087.29 — comme `render`, mais avec des réponses ARBITRAIRES (pour faire
 *  varier le compte de questions restantes sans toucher aux autres tests). */
async function renderWithAnswers(answers: OnboardingAnswers): Promise<void> {
  renderWithRouter(
    <>
      <SubStepQuestions questions={SUB?.questions ?? []} answers={answers} onChange={onChange} />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

describe('SubStepQuestions — prefill badges', () => {
  it('renders no badge at all for a manually-filled onboarding', async () => {
    await render()
    expect(screen.queryByText(/Prérempli/)).toBeNull()
    expect(screen.queryByText(/À vérifier/)).toBeNull()
  })

  it('badges a prefilled answer with its source', async () => {
    await render({ esn_name: { confidence: 'high', source: 'registry', rationale: 'Dénomination au registre' } })
    expect(screen.getByText('Prérempli · registre')).toBeInTheDocument()
  })

  it('exposes the rationale and the confidence to assistive tech', async () => {
    await render({ esn_name: { confidence: 'high', source: 'registry', rationale: 'Dénomination au registre' } })
    const badge = screen.getByLabelText(/Dénomination au registre/)
    expect(badge).toHaveAccessibleName(/Confiance élevée/)
  })

  it('falls back to a neutral rationale rather than inventing a citation', async () => {
    await render({ consultant_size: { confidence: 'medium', source: 'pappers' } })
    expect(screen.getByLabelText(/Valeur suggérée à partir des données publiques/)).toBeInTheDocument()
  })

  it('switches to the cautious wording on low confidence', async () => {
    await render({ consultant_size: { confidence: 'low', source: 'inference' } })
    expect(screen.getByText('À vérifier · déduction')).toBeInTheDocument()
    expect(screen.queryByText(/^Prérempli/)).toBeNull()
  })

  it('badges only the prefilled question, not its neighbours on the same screen', async () => {
    await render({ esn_name: { confidence: 'high', source: 'registry' } })
    // The sub-step holds two questions; exactly one carries a badge.
    expect(screen.getAllByText(/Prérempli ·/)).toHaveLength(1)
  })

  it('still reports edits upwards (the store is what drops the badge)', async () => {
    await render({ esn_name: { confidence: 'high', source: 'registry' } })
    fireEvent.change(screen.getByDisplayValue('Kicklox'), { target: { value: 'Kicklox SAS' } })
    expect(onChange).toHaveBeenCalledWith('esn_name', 'Kicklox SAS')
  })
})

/**
 * #2028.3 — « bouton confirmer ; bouton corriger ; bouton ignorer ».
 *
 * Le badge était en LECTURE SEULE : il annonçait une valeur devinée et laissait
 * l'utilisateur deviner, lui, ce qu'il était censé en faire. Trois gestes, trois
 * effets distincts, et aucun qui invente une donnée :
 *
 * - **Confirmer** : la valeur suggérée devient SA réponse (le store retire la
 *   provenance sur `setAnswer`, donc le badge disparaît de lui-même) ;
 * - **Corriger** : le focus part dans le champ, et RIEN ne change d'autre — le
 *   badge reste tant que la réponse n'a pas bougé, parce qu'elle est toujours
 *   une suggestion ;
 * - **Ignorer** : la valeur suggérée est retirée, le champ redevient vide.
 *
 * Ce que ces trois boutons ne font PAS : poser une pierre tombale côté serveur.
 * « Une donnée publique changée ultérieurement ne doit pas écraser la
 * correction » (#2028.4) se tient dans le contrat de préremplissage, pas dans
 * ce badge — `applyPrefill` ne touche jamais une réponse déjà remplie.
 */
describe('#2028.3 — les trois gestes du badge de préremplissage', () => {
  it("n'affiche aucune action quand rien n'est prérempli", async () => {
    await render()
    expect(screen.queryByRole('button', { name: /Confirmer/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ignorer/ })).toBeNull()
  })

  it('offre les trois gestes à côté de la valeur préremplie', async () => {
    await render({ consultant_size: { confidence: 'medium', source: 'pappers' } })
    expect(screen.getByRole('button', { name: /Confirmer/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Corriger/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ignorer/ })).toBeInTheDocument()
  })

  it('« Confirmer » fait de la valeur suggérée la réponse de l’utilisateur', async () => {
    await render({ consultant_size: { confidence: 'medium', source: 'pappers' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmer/ }))
    expect(onChange).toHaveBeenCalledWith('consultant_size', '10-30')
  })

  it('« Ignorer » vide la réponse au lieu de garder une valeur devinée', async () => {
    await render({ consultant_size: { confidence: 'low', source: 'inference' } })
    fireEvent.click(screen.getByRole('button', { name: /Ignorer/ }))
    expect(onChange).toHaveBeenCalledWith('consultant_size', '')
  })

  it('« Corriger » rend la main sur le champ sans rien changer', async () => {
    await render({ consultant_size: { confidence: 'medium', source: 'pappers' } })
    fireEvent.click(screen.getByRole('button', { name: /Corriger/ }))
    expect(onChange).not.toHaveBeenCalled()
    // Le focus est parti DANS le champ : la première option de la liste.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '1-10' }))
  })
})

/**
 * #2087.29 — « questions restantes DANS l'étape ». Lu sur les mêmes réponses
 * que le bouton Continuer (`validate`), jamais un second calcul (GA-26).
 */
describe('#2087.29 — compteur de questions restantes dans l’étape', () => {
  it('compte les quatre questions restantes quand rien n’est répondu', async () => {
    // #2640.2 — `esn_website` est le quatrième champ, additif, de cette
    // sous-étape (`entreprise.ts`) : le compteur de départ passe de 3 à 4.
    await renderWithAnswers({})
    expect(screen.getByText('4 questions restantes sur cet écran')).toBeInTheDocument()
  })

  it('décompte à trois questions restantes une fois la première répondue', async () => {
    await renderWithAnswers({ esn_name: 'Kicklox' })
    expect(screen.getByText('3 questions restantes sur cet écran')).toBeInTheDocument()
  })

  it('ne montre plus aucun compteur une fois les quatre répondues', async () => {
    // #2088.12 / #2640.2 — `consultant_count` puis `esn_website` sont les
    // troisième et quatrième champs, additifs, de cette sous-étape
    // (`entreprise.ts`) : le compteur ne se tait qu'une fois les quatre
    // répondues, `render()` (deux réponses fixes) ne suffit plus ici.
    await renderWithAnswers({
      esn_name: 'Kicklox',
      consultant_size: '10-30',
      consultant_count: '42',
      esn_website: 'https://www.kicklox.com',
    })
    expect(screen.queryByText(/restante/)).toBeNull()
  })

  it('#2088.33 — une valeur préremplie jamais confirmée reste comptée comme restante', async () => {
    // Les quatre questions de la sous-étape ont une valeur dans `answers`
    // (comme `render()`, `consultant_count`/`esn_website` restant SANS
    // réponse), mais `esn_name` n'est encore qu'une PROPOSITION : `prefillMeta`
    // la porte toujours, aucun geste humain ne l'a confirmée. Sans ce filtre
    // le compteur dirait « 2 restantes » (consultant_count + esn_website),
    // comme si `esn_name` avait été répondue. Avec le filtre, il passe à
    // TROIS restantes (esn_name non confirmée + consultant_count vide +
    // esn_website vide).
    await render({ esn_name: { confidence: 'high', source: 'registry' } })
    expect(screen.getByText('3 questions restantes sur cet écran')).toBeInTheDocument()
  })
})

/**
 * #2087.24 — l'aide À RÉPONDRE, distincte de la conséquence (#2024.10) et de
 * `RationaleDisclosure` (« Pourquoi cette question ? », repliée). Table
 * `question-help.ts`, indexée par la même clé que `question.key`.
 */
describe('#2087.24 — aide à répondre, sous chaque question qui en porte une', () => {
  it('affiche l’aide sous la question esn_name (table `QUESTION_HELP_KEY`)', async () => {
    await render()
    expect(screen.getByText(/Utilise le nom commercial que tes prospects reconnaissent/)).toBeInTheDocument()
  })

  it('affiche l’aide sous consultant_size aussi — deux questions, deux aides', async () => {
    await render()
    expect(screen.getByText(/Compte les consultants en mission ET en intercontrat/)).toBeInTheDocument()
  })
})

/**
 * #2024.10 / #2025.1 — la conséquence de la réponse est VISIBLE, à côté de la
 * question. Pas une promesse de résultat, pas un pourcentage, pas une
 * probabilité (doctrine `c26_probabilite`) : ce que {{brand}} fait
 * RÉELLEMENT de cette réponse (`lib/question-consequences.ts`, vérifié contre
 * `esnAnswersToProfileData`).
 */
describe('#2024.10 / #2025.1 — la conséquence de la réponse est visible', () => {
  it('affiche, sous chaque question, ce que la réponse change', async () => {
    await render()
    expect(screen.getByText(/Identifie ton entreprise dans le dossier de conquête/)).toBeInTheDocument()
    expect(screen.getByText(/Situe la taille de ton entreprise dans l'analyse de tes comptes/)).toBeInTheDocument()
  })

  it('ne promet ni score ni probabilité', async () => {
    await render()
    expect(screen.queryByText(/%/)).toBeNull()
    expect(screen.queryByText(/probabilit/i)).toBeNull()
  })
})

/**
 * #2027.1 / #2027.2 — quatre états d'incertitude, distincts d'une absence de
 * réponse, sous `available_consultants_band` (#2035.9 : une inconnue de
 * disponibilité reste inconnue).
 */
describe('#2027 — proposer quatre états d’incertitude sur une question marquée allowUnknown', () => {
  const AVAILABILITY_SUB = findCatalogueSubStep('company_info', 'effectif-reel')

  async function renderAvailability(answers: OnboardingAnswers = {}): Promise<void> {
    renderWithRouter(
      <>
        <SubStepQuestions questions={AVAILABILITY_SUB?.questions ?? []} answers={answers} onChange={onChange} />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
  }

  it('affiche les quatre libellés exacts sous la question de disponibilité', async () => {
    await renderAvailability()
    expect(screen.getByRole('button', { name: 'Je ne sais pas encore' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Non applicable' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'À vérifier avec mon équipe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Je préfère répondre plus tard' })).toBeInTheDocument()
  })

  it('ne les affiche PAS sous une question qui ne porte pas allowUnknown (esn_name)', async () => {
    await render()
    expect(screen.queryByRole('button', { name: 'Je ne sais pas encore' })).toBeNull()
  })

  it('choisir « Je ne sais pas encore » persiste cette valeur par le même canal qu’une réponse', async () => {
    await renderAvailability()
    fireEvent.click(screen.getByRole('button', { name: 'Je ne sais pas encore' }))
    expect(onChange).toHaveBeenCalledWith('available_consultants_band', 'Je ne sais pas encore')
  })

  it('marque le bouton actif quand la réponse enregistrée EST l’état choisi', async () => {
    await renderAvailability({ available_consultants_band: 'Non applicable' })
    expect(screen.getByRole('button', { name: 'Non applicable' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Je ne sais pas encore' })).toHaveAttribute('aria-pressed', 'false')
  })
})

/**
 * #2020.2 — Laura donne un EXEMPLE : `tooling_pain` (texte libre) porte
 * désormais trois suggestions cliquables (mécanisme #2088.20, jamais adopté
 * par une vraie question Temps-1 jusqu'ici).
 */
describe('#2020.2 — un exemple cliquable sous une question texte réelle', () => {
  const TOOLING_QUALITE_SUB = findCatalogueSubStep('company_info', 'outillage-qualite')

  it('affiche les trois suggestions sous `tooling_pain` et clique EN FAIT la réponse', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions questions={TOOLING_QUALITE_SUB?.questions ?? []} answers={{}} onChange={onChange} />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    const suggestion = screen.getByRole('button', { name: 'Je ressaisis les mêmes contacts à trois endroits' })
    fireEvent.click(suggestion)
    expect(onChange).toHaveBeenCalledWith('tooling_pain', 'Je ressaisis les mêmes contacts à trois endroits')
  })
})

/**
 * #2035.8 — l'effectif porte sa date, et redevient inconnu en vieillissant :
 * une bande PÉRIMÉE se signale sous la question, jamais en silence.
 */
describe('#2035.8 — fraîcheur d’une bande d’effectif périmée', () => {
  const EFFECTIF_SUB = findCatalogueSubStep('company_info', 'effectif-reel')

  it('affiche le signal de péremption sous la question dont la fraîcheur est `stale`', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={EFFECTIF_SUB?.questions ?? []}
          answers={{ consultants_managed_by_user_band: '1 à 5 consultants' }}
          onChange={onChange}
          effectifFreshness={{
            consultants_managed_by_user_band: { state: 'stale', observedAt: '2026-06-01T00:00:00.000Z', ageDays: 109 },
          }}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.getByTestId('effectif-freshness-stale')).toHaveTextContent('109 jours')
  })

  it('dit NON : aucun signal quand `effectifFreshness` est absent — le rendu historique, à l’octet près', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={EFFECTIF_SUB?.questions ?? []}
          answers={{ consultants_managed_by_user_band: '1 à 5 consultants' }}
          onChange={onChange}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.queryByTestId('effectif-freshness-stale')).toBeNull()
  })

  it('protège le cas légitime : une bande FRAÎCHE (non listée par l’appelant) ne montre rien non plus', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={EFFECTIF_SUB?.questions ?? []}
          answers={{ consultants_managed_by_user_band: '1 à 5 consultants' }}
          onChange={onChange}
          // L'appelant (OnboardingWizard) ne transmet QUE les bandes `stale` —
          // une bande fraîche ou jamais répondue n'apparaît pas dans la map.
          effectifFreshness={{}}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.queryByTestId('effectif-freshness-stale')).toBeNull()
  })
})

/**
 * #2045.15 — un contact ancien n'est pas un accès actif : le réseau
 * personnel déclaré (`reseau-comptage`) se signale exactement comme
 * l'effectif ci-dessus, sous un `data-testid`/texte distincts (deux familles
 * de fraîcheur, deux seuils, jamais confondues à l'écran).
 */
describe('#2045.15 — fraîcheur d’une bande de réseau périmée', () => {
  const RESEAU_SUB = findCatalogueSubStep('target_market', 'reseau-comptage')

  it('affiche le signal de péremption sous la question dont la fraîcheur réseau est `stale`', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={RESEAU_SUB?.questions ?? []}
          answers={{ former_clients_count_band: '6-15' }}
          onChange={onChange}
          reseauFreshness={{
            former_clients_count_band: { state: 'stale', observedAt: '2026-01-01T00:00:00.000Z', ageDays: 266 },
          }}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.getByTestId('reseau-freshness-stale')).toHaveTextContent('266 jours')
  })

  it('dit NON : aucun signal quand `reseauFreshness` est absent — le rendu historique, à l’octet près', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={RESEAU_SUB?.questions ?? []}
          answers={{ former_clients_count_band: '6-15' }}
          onChange={onChange}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.queryByTestId('reseau-freshness-stale')).toBeNull()
  })

  it('ne confond jamais les deux familles : une bande d’effectif stale sur cet écran réseau resterait sur son propre testid', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={RESEAU_SUB?.questions ?? []}
          answers={{ former_clients_count_band: '6-15' }}
          onChange={onChange}
          effectifFreshness={{
            former_clients_count_band: { state: 'stale', observedAt: '2026-06-01T00:00:00.000Z', ageDays: 109 },
          }}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    // La clé est la même chaîne, mais portée par la map RÉSEAU côté appelant
    // réel (OnboardingWizard) — ici on prouve juste que passer la map
    // EFFECTIF sur cette clé ne bascule pas silencieusement en badge réseau.
    expect(screen.getByTestId('effectif-freshness-stale')).toHaveTextContent('109 jours')
    expect(screen.queryByTestId('reseau-freshness-stale')).toBeNull()
  })
})

/**
 * #2021.12 — « pas de formulaire administratif ». La lecture de code (18/09,
 * reconfirmée 23/09) dit déjà que `SubStepQuestions` empile ses questions
 * (`space-y-10`) et que `QuestionField` ne porte qu'une seule `grid-cols`
 * (les CHOIX d'une question, jamais des lignes de champs) — mais cette
 * lecture n'avait encore AUCUN test qui sache dire NON. Le manque n'est pas
 * une mesure de plus, c'est ce cliquet : ⚠️ Preuve ÉCRAN ≠ grep reste vrai
 * (jsdom ne prouve aucune capture d'écran), donc ce test mesure la STRUCTURE
 * du DOM — un formulaire administratif range ses champs en grille
 * (label+input répétés côte à côte) ; ce dépôt les empile l'un sous l'autre,
 * jamais deux côte à côte. L'ÉCRAN reste à recetter par un `recetteur` dédié.
 */
describe('#2021.12 — structure : pas de formulaire administratif', () => {
  const EFFECTIF_SUB = findCatalogueSubStep('company_info', 'effectif-reel')

  it('empile les questions verticalement (space-y-10) — jamais une grille', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions questions={EFFECTIF_SUB?.questions ?? []} answers={{}} onChange={onChange} />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    const classes = [...document.body.querySelectorAll('*')].map(el => el.getAttribute('class') ?? '')
    expect(classes.some(cls => cls.split(' ').includes('space-y-10'))).toBe(true)
  })

  it("dit NON : aucune ligne de question n'est elle-même une grille de champs (grid-cols)", async () => {
    const questions = EFFECTIF_SUB?.questions ?? []
    expect(questions.length).toBeGreaterThan(1) // sinon le test ne prouve rien
    renderWithRouter(
      <>
        <SubStepQuestions questions={questions} answers={{}} onChange={onChange} />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    for (const question of questions) {
      const row = document.getElementById(`onboarding-question-${question.key}`)
      expect(row).not.toBeNull()
      expect(row?.className ?? '').not.toMatch(/grid-cols/)
    }
  })
})

describe('SubStepQuestions — #2021.11 résumé de la réponse précédente', () => {
  it('affiche la ligne compacte quand une réponse précédente est fournie', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={SUB?.questions ?? []}
          answers={{}}
          onChange={onChange}
          previousAnswer={{ labelKey: 'questions.esnName.label', value: 'Kicklox' }}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.getByText(/Kicklox/)).toBeTruthy()
  })

  it('#2021.11 — rien avant la première sous-étape : aucune ligne, jamais un placeholder', async () => {
    renderWithRouter(
      <>
        <SubStepQuestions questions={SUB?.questions ?? []} answers={{}} onChange={onChange} previousAnswer={null} />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
    expect(screen.queryByText(/réponse précédente/i)).toBeNull()
  })
})

describe('#4016 L13b — la note libre d’accueil, découpée en faits À REVOIR', () => {
  const OUVERTE = findCatalogueSubStep('goals', 'question-ouverte')

  async function renderOuverte(note: string | undefined): Promise<void> {
    renderWithRouter(
      <>
        <SubStepQuestions
          questions={OUVERTE?.questions ?? []}
          answers={note === undefined ? {} : { uncovered_activity_note: note }}
          onChange={onChange}
        />
        <div data-testid="sentinel" />
      </>,
    )
    await screen.findByTestId('sentinel')
  }

  it('liste chaque fait repéré, étiqueté « à revoir » — jamais comme un fait certain', async () => {
    await renderOuverte('Nous ouvrons un bureau à Lyon en janvier. Mon associé part en juin.')

    const list = screen.getByRole('list', { name: /à revoir/i })
    expect(list).toBeInTheDocument()
    expect(screen.getByText('Nous ouvrons un bureau à Lyon en janvier.')).toBeInTheDocument()
    expect(screen.getByText('Mon associé part en juin.')).toBeInTheDocument()
    expect(screen.getAllByText(/à revoir/i).length).toBeGreaterThan(0)
  })

  it('sait dire NON : sans note, aucune liste — une absence ne fait aucune ligne', async () => {
    await renderOuverte(undefined)
    expect(screen.queryByRole('list', { name: /à revoir/i })).toBeNull()
  })

  it('ne s’affiche pas sous une AUTRE question', async () => {
    await render()
    expect(screen.queryByRole('list', { name: /à revoir/i })).toBeNull()
  })
})
