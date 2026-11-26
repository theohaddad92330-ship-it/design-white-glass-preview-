import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROFILE_QUESTION_OPTIONS, type EsnAnswers, type WorkspaceRole } from '@bellum/contracts'
import { esnProfileApi } from '@/features/profile/api'
import { ProfileQuestionnaireDialog } from './ProfileQuestionnaireDialog'

/**
 * Le parcours du profil progressif (§21-30) : blocs annoncés AVANT l'effort,
 * questions passables, sauvegarde à chaque étape, synthèse finale.
 *
 * Ce qui est vérifié ici est ce que le rapport exige et qu'un catalogue seul ne
 * prouve pas : que l'écran ANNONCE la contrepartie, qu'il n'écrase jamais une
 * réponse en la passant, et qu'il ne fabrique pas une synthèse de rien.
 */

const h = vi.hoisted(() => ({
  saveAnswer: vi.fn(),
  finish: vi.fn(),
  answers: {} as Partial<EsnAnswers>,
  // #2031.10 — les outils BRANCHÉS que le dialogue reçoit de
  // `useConnectedCapabilities`, sous leur nom (ce que `toolingChoicesFromConnectedTools`
  // lit pour retirer, champ par champ, un choix de `tooling`).
  connectedTools: [] as ReadonlyArray<{ provider: string; family: string; name: string }>,
  // #2031.3 — le rôle avec lequel la personne a été invitée dans l'espace
  // (`GET /workspaces/me`, lu par tout membre via `useTeam`), `null` quand la
  // source n'a pas encore répondu.
  workspaceRole: null as WorkspaceRole | null,
  // #2018.5 — les réglages de notification, LE MÊME hook que
  // Réglages › Notifications (`useNotificationPreferences`) : ce dialogue
  // n'ouvre pas un second chemin d'écriture (GA-26).
  notificationPreferences: { relance_reminders: false, weekly_summary: false } as Record<string, boolean>,
  setPreference: vi.fn(),
}))

vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ data: { answers: h.answers } }),
}))
vi.mock('@/features/onboarding/hooks/useProfileComplement', () => ({
  useProfileComplement: () => ({
    saveAnswer: { mutate: h.saveAnswer },
    finish: { mutate: h.finish, isPending: false },
  }),
}))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({ families: [], tools: h.connectedTools, isLoading: false }),
}))
vi.mock('@/features/notifications/hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: h.notificationPreferences,
    isLoading: false,
    isSaving: false,
    setPreference: h.setPreference,
  }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: h.workspaceRole ? { workspace: { role: h.workspaceRole } } : undefined }),
}))
// #2007.11 — le bouton « passer » persiste désormais la question ignorée.
vi.mock('@/features/profile/api', () => ({
  esnProfileApi: { skipQuestion: vi.fn().mockResolvedValue({ skippedQuestionKeys: [] }) },
}))

// #2626.1 — le dialogue repose désormais les questions que le Temps 1 a
// rendues, et certaines d'entre elles rendent `AnswerReformulation`, qui
// appelle `useMutation`. En production le dialogue vit sous le
// `QueryClientProvider` de l'app ; le harnais de test doit donc le fournir
// aussi, sinon la garde accuse un écran qui va bien.
const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProfileQuestionnaireDialog open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  )

/**
 * Le bouton qui fait avancer le parcours — « Passer », à défaut « C'est parti ».
 *
 * Les boucles qui traversent le questionnaire entier (~200 étapes) cherchaient
 * ces deux boutons par `queryByRole` à CHAQUE étape : le calcul du nom
 * accessible et de la visibilité de tout l'arbre coûtait l'essentiel des
 * ~20 s de chacun de ces tests (394 s cumulées sur un runner CI chargé, le
 * fichier le plus lent de la suite — mesure du 29/09/2026). Les deux boutons
 * sont des `<Button>` au texte nu (aucun `aria-label`), donc leur texte EST
 * leur nom : la recherche par texte trouve le même élément, sans l'arbre
 * d'accessibilité. Les ASSERTIONS de fin, elles, restent par rôle.
 */
const buttonByExactText = (pattern: RegExp): HTMLElement | null => {
  const found = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).filter(b =>
    pattern.test((b.textContent ?? '').trim()),
  )
  // Même contrat que `queryByRole` : deux candidats sont une erreur, jamais un choix.
  if (found.length > 1) throw new Error(`plusieurs boutons ${String(pattern)}`)
  return found[0] ?? null
}
const nextStepButton = (): HTMLElement | null =>
  buttonByExactText(/^passer$/i) ?? buttonByExactText(/^c['’]est parti$/i)

describe('ProfileQuestionnaireDialog', () => {
  beforeEach(() => {
    h.saveAnswer.mockClear()
    h.finish.mockClear()
    h.answers = {}
    h.connectedTools = []
    h.workspaceRole = null
    h.notificationPreferences = { relance_reminders: false, weekly_summary: false }
    h.setPreference.mockClear()
    vi.mocked(esnProfileApi.skipQuestion).mockClear()
  })

  it('#2021 — la hauteur maximale du dialogue est en `dvh`, jamais `vh` (GA-29/30)', () => {
    // Sur un navigateur mobile, `vh` inclut la barre d'adresse escamotable :
    // `85vh` dépasse la fenêtre réellement visible et coupe le bas du
    // dialogue (bouton Suivant/Passer) tant que la barre est affichée. `dvh`
    // se recalcule avec la fenêtre visible réelle.
    open()
    const content = document.querySelector('[role="dialog"]')
    expect(content).not.toBeNull()
    expect(content?.className ?? '').not.toMatch(/(?<!d)vh(?![a-z])/)
  })

  it('annonce ce que le bloc améliore AVANT de poser la moindre question', async () => {
    open()
    // Le rapport : « affichage "cela permettra à Bellum de mieux…" avant chaque bloc ».
    expect(screen.getByText(/calibrer ses conseils/i)).toBeInTheDocument()
    // Et aucune question n'est encore posée.
    expect(screen.queryByText(/Quel est ton rôle principal/i)).not.toBeInTheDocument()
  })

  it('enchaîne sur la première question du bloc', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /c'est parti/i }))
    expect(screen.getByText(/Quel est ton rôle principal/i)).toBeInTheDocument()
  })

  it('enregistre la réponse à chaque étape, pas à la fin', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /c'est parti/i }))
    await userEvent.click(screen.getByText('Business Manager'))
    await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
    await waitFor(() => expect(h.saveAnswer).toHaveBeenCalledWith({ user_role: 'Business Manager' }))
  })

  it('« Passer » n’écrase jamais une réponse par du vide', async () => {
    h.answers = { user_role: 'Directeur commercial' }
    open()
    await userEvent.click(screen.getByRole('button', { name: /c'est parti/i }))
    await userEvent.click(screen.getByRole('button', { name: /passer/i }))
    expect(h.saveAnswer).not.toHaveBeenCalled()
  })

  // #2007.11 — le bouton ne persistait RIEN avant ce lot : la question passée
  // n'atteignait jamais le moteur. `answer_meta` ne peut pas porter ce fait
  // (il suppose toujours une valeur) — d'où le champ dédié.
  it('#2007.11 — « Passer » sur une question SANS réponse la note nommément', async () => {
    h.answers = {}
    open()
    await userEvent.click(screen.getByRole('button', { name: /c'est parti/i }))
    await userEvent.click(screen.getByRole('button', { name: /passer/i }))
    await waitFor(() => expect(esnProfileApi.skipQuestion).toHaveBeenCalled())
    expect(vi.mocked(esnProfileApi.skipQuestion).mock.calls[0]?.[0]).toEqual({ key: 'user_role' })
  })

  // #2007.11 — une question DÉJÀ répondue (préremplie ou stockée) ne doit
  // jamais ressortir comme « non évaluable » : ce serait contredire sa
  // propre valeur.
  it('#2007.11 — « Passer » sur une question DÉJÀ répondue ne la marque PAS comme passée', async () => {
    h.answers = { user_role: 'Directeur commercial' }
    open()
    await userEvent.click(screen.getByRole('button', { name: /c'est parti/i }))
    await userEvent.click(screen.getByRole('button', { name: /passer/i }))
    expect(esnProfileApi.skipQuestion).not.toHaveBeenCalled()
  })

  it('affiche un avancement calculé sur les questions réellement posées', async () => {
    const totalShown = (): number => {
      const text = screen.getAllByText(/réponse\(s\) sur (\d+)/i).at(-1)?.textContent ?? ''
      return Number(text.match(/sur (\d+)/)?.[1])
    }

    h.answers = { user_role: 'Business Manager', sales_team_size: '1' }
    const solo = open()
    const soloTotal = totalShown()
    solo.unmount()

    // Une équipe : les 2 questions de coordination reviennent dans le total.
    h.answers = { user_role: 'Business Manager', sales_team_size: '4-6' }
    const team = open()
    const teamTotal = totalShown()
    team.unmount()

    expect(soloTotal).toBeLessThan(teamTotal)
  })

  it('#2031.10 — un total qui perd la question « équipement » quand TOUS ses outils sont déduits', async () => {
    const totalShown = (): number => {
      const text = screen.getAllByText(/réponse\(s\) sur (\d+)/i).at(-1)?.textContent ?? ''
      return Number(text.match(/sur (\d+)/)?.[1])
    }

    h.answers = { user_role: 'Business Manager' }
    h.connectedTools = []
    const none = open()
    const noneTotal = totalShown()
    none.unmount()

    // Chaque nom vient du même vocabulaire que `tooling` — ce que
    // `toolingChoicesFromConnectedTools` doit reconnaître pour TOUS les retirer.
    h.connectedTools = PROFILE_QUESTION_OPTIONS.tooling.map(name => ({ provider: name, family: 'crm', name }))
    const allDeduced = open()
    const allDeducedTotal = totalShown()
    allDeduced.unmount()

    expect(allDeducedTotal).toBe(noneTotal - 1)
  })

  describe('#2031.3 — le rôle invité prérempli role_functions_practiced, champ par champ', () => {
    /** Avance jusqu'à la question `role_functions_practiced` (6e du bloc « role »). */
    const goToRoleFunctionsQuestion = async (): Promise<void> => {
      await userEvent.click(screen.getByRole('button', { name: /c'est parti/i }))
      for (let i = 0; i < 10; i += 1) {
        if (screen.queryByRole('button', { name: 'Vente / prospection' })) return
        await userEvent.click(screen.getByRole('button', { name: /passer/i }))
      }
      throw new Error('role_functions_practiced jamais atteinte')
    }

    it('un rôle « sales » prérempli « Vente / prospection », et la question reste posée ENTIÈRE', async () => {
      h.answers = { user_role: 'Business Manager' }
      h.workspaceRole = 'sales'
      open()
      await goToRoleFunctionsQuestion()
      expect(screen.getByRole('button', { name: 'Vente / prospection' })).toHaveAttribute('aria-pressed', 'true')
      // Aucun booléen ne masque le reste des choix (contre-exemple #2031.10).
      expect(screen.getByRole('button', { name: 'Recrutement / sourcing' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: 'Management / direction' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('accepter la suggestion sans y toucher l’enregistre quand même', async () => {
      h.answers = { user_role: 'Business Manager' }
      h.workspaceRole = 'recruiter'
      open()
      await goToRoleFunctionsQuestion()
      await userEvent.click(screen.getByRole('button', { name: /suivant/i }))
      await waitFor(() =>
        expect(h.saveAnswer).toHaveBeenCalledWith({ role_functions_practiced: ['Recrutement / sourcing'] }),
      )
    })

    it('une réponse déjà donnée n’est JAMAIS écrasée par le rôle invité', async () => {
      h.answers = { user_role: 'Business Manager', role_functions_practiced: ['Management / direction'] }
      h.workspaceRole = 'sales'
      open()
      await goToRoleFunctionsQuestion()
      expect(screen.getByRole('button', { name: 'Management / direction' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Vente / prospection' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('un rôle sans correspondance ne devine rien : la question se pose vide', async () => {
      h.answers = { user_role: 'Business Manager' }
      h.workspaceRole = 'tech_admin'
      open()
      await goToRoleFunctionsQuestion()
      for (const choice of ['Vente / prospection', 'Recrutement / sourcing', 'Management / direction']) {
        expect(screen.getByRole('button', { name: choice })).toHaveAttribute('aria-pressed', 'false')
      }
    })

    it('aucune source lue (rôle null) : la question se pose vide, comme avant ce lot', async () => {
      h.answers = { user_role: 'Business Manager' }
      h.workspaceRole = null
      open()
      await goToRoleFunctionsQuestion()
      expect(screen.getByRole('button', { name: 'Vente / prospection' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  // Le test le plus lourd du fichier : une trentaine de clics, chacun suivi d'un
  // rendu complet du questionnaire.
  //
  // Deux corrections, dans cet ordre. D'abord le délai que `userEvent` insère
  // entre deux événements pour imiter une frappe humaine — à trente clics il
  // domine tout, et on ne teste pas ici la vitesse de frappe d'un humain. Puis
  // le budget : en isolation le fichier entier tient en 6 s, mais la suite
  // complète lance une douzaine de processus en parallèle et celui-ci dépassait
  // encore 20 s (rouge REPRODUCTIBLE sous charge, vert seul). 60 s n'est pas un
  // cache-misère — c'est vingt fois le temps réel du test, et un vrai blocage
  // dépasserait cette marge sans hésiter.
  // #2626.1 — le parcours s'est allongé : après les 6 blocs de profil vient la
  // section « Ce qui reste à affiner », qui repose les 125 questions que le
  // Temps 1 a rendues. Le plafond de la boucle suit le parcours réel ; à 60 il
  // s'arrêtait AVANT la synthèse et la garde accusait un écran qui va bien.
  it('ne fabrique pas une synthèse quand tout a été passé', { timeout: 180000 }, async () => {
    // On saute directement à la fin : aucune réponse stockée, aucun brouillon.
    h.answers = {}
    open()
    const user = userEvent.setup({ delay: null })
    const skipEverything = async () => {
      for (let i = 0; i < 400; i += 1) {
        // #2626.1 — nom EXACT : une question reposée du Temps 1 porte un choix
        // dont le libellé contient « passer », et `/passer/i` en attrapait deux.
        const next = nextStepButton()
        if (next) await user.click(next)
        else break
      }
    }
    await skipEverything()
    expect(screen.getByText(/Voici ce que Bellum a compris/i)).toBeInTheDocument()
    expect(screen.getByText(/tu as tout passé/i)).toBeInTheDocument()
  })

  /**
   * #2018.5 — l'étape notifications, juste avant la synthèse : le MÊME chemin
   * d'écriture que Réglages › Notifications (`useNotificationPreferences`),
   * jamais une seconde donnée sous `EsnAnswers`/`saveAnswer`.
   */
  describe('#2018.5 — étape notifications juste avant la synthèse', () => {
    const goToNotificationsStep = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(screen.getByRole('button', { name: /^c'est parti$/i }))
      // #2626.1 — le catalogue grandit (blocs + questions reportées du Temps 1) :
      // 60 itérations suffisaient au compte de questions d'hier, plus aujourd'hui.
      // Même marge que `skipEverything` ci-dessus plutôt qu'un nombre encore
      // arbitraire. Nom EXACT aussi (même raison que `skipEverything` ci-dessus) :
      // une question reposée du Temps 1 porte un choix dont le libellé contient
      // « passer » (« il faut passer par quelqu'un »), et `/passer/i` en attrapait
      // deux.
      for (let i = 0; i < 400; i += 1) {
        // Le texte du réglage, pas son rôle (même raison que `nextStepButton`) ;
        // l'appelant le reprend ensuite par `getByRole('switch')`.
        if (screen.queryByText(/rappels de relance/i)) return
        const next = nextStepButton()
        if (next) await user.click(next)
        else break
      }
      throw new Error('étape notifications jamais atteinte')
    }

    // Même budget que « ne fabrique pas une synthèse » ci-dessus, même raison :
    // `goToNotificationsStep` porte la même boucle de 400 itérations. Vert et
    // rapide (~15 s) en isolation, rouge REPRODUCTIBLE sous charge (mesuré à
    // l'intégration du 21/09, 20127 ms — 127 ms au-dessus du budget par
    // défaut). 180 s n'assouplit aucune assertion : le câblage vérifié
    // (`useNotificationPreferences`, jamais `saveAnswer`) reste inchangé.
    it(
      'affiche les réglages réels et les change via `useNotificationPreferences`, pas `saveAnswer`',
      { timeout: 180000 },
      async () => {
        h.notificationPreferences = { relance_reminders: false, weekly_summary: true }
        open()
        const user = userEvent.setup({ delay: null })
        await goToNotificationsStep(user)

        const relance = screen.getByRole('switch', { name: /rappels de relance/i })
        const weekly = screen.getByRole('switch', { name: /résumé hebdomadaire/i })
        expect(relance).not.toBeChecked()
        expect(weekly).toBeChecked()

        await user.click(relance)
        expect(h.setPreference).toHaveBeenCalledWith('relance_reminders', true)
        // Jamais écrite dans le profil : ce n'est pas une colonne `esn_profiles`.
        expect(h.saveAnswer).not.toHaveBeenCalled()
      },
    )

    it('« Passer » avance sans appeler `setPreference`', { timeout: 180000 }, async () => {
      open()
      const user = userEvent.setup({ delay: null })
      await goToNotificationsStep(user)
      await user.click(screen.getByRole('button', { name: /^passer$/i }))
      expect(screen.getByText(/Voici ce que Bellum a compris/i)).toBeInTheDocument()
      expect(h.setPreference).not.toHaveBeenCalled()
    })
  })
})
