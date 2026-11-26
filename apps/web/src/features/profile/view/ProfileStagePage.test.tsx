import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnswerMetaMap, EsnAnswers, EsnProfileWorkspaceMeta } from '@bellum/contracts'
import { TEMPS1_STAGES } from '@/features/onboarding/lib/questions'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useAnswerStatus } from '../hooks/useAnswerStatus'
import { useConfirmAnswer } from '../hooks/useConfirmAnswer'
import { useReconfigureOnboarding } from '../hooks/useReconfigureOnboarding'
// #2006.22 — le statut de la réponse se voit
import { StageEditor } from './ProfileStagePage'

vi.mock('../hooks/useAnswerStatus', () => ({ useAnswerStatus: vi.fn() }))
vi.mock('../hooks/useConfirmAnswer', () => ({ useConfirmAnswer: vi.fn() }))
vi.mock('../hooks/useReconfigureOnboarding', () => ({ useReconfigureOnboarding: vi.fn() }))

const NOT_AVAILABLE = { available: false, alreadyRequested: false, pending: false, trigger: vi.fn() }

// Défaut pour TOUS les tests de ce fichier — la plupart ne s'intéressent pas
// au statut de confirmation. Seul le describe `#2006.22` ci-dessous le
// redéfinit par test.
beforeEach(() => {
  vi.mocked(useAnswerStatus).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useAnswerStatus>)
  vi.mocked(useReconfigureOnboarding).mockReturnValue(NOT_AVAILABLE)
  vi.mocked(useConfirmAnswer).mockReturnValue(vi.fn().mockResolvedValue(undefined))
})

const STAGE = TEMPS1_STAGES[0]!
// flaky mesuré le 18/09/2026 — `STAGE` complet (`company_info`, 17 sous-étapes,
// 56 champs verrouillables) faisait dépendre `getAllByRole('button', { name:
// /regex/ })` de la VITESSE MACHINE : le calcul du nom accessible de chaque
// candidat sur un DOM sérialisé à ~289 Ko a mesuré jusqu'à 2,1 s de travail
// SYNCHRONE (donc hors waitFor/MutationObserver — pas un hang), contre 47 ms
// une fois le stage réduit à une seule sous-étape. Ce que #2018.7 protège (un
// champ ENTREPRISE verrouillé propose « Signaler une erreur ») ne dépend pas
// du NOMBRE de champs — `entrepriseStep` (2 champs, tous deux verrouillables)
// le prouve identiquement, sans le DOM géant qui rendait la mesure instable.
const SMALL_STAGE = { ...STAGE, steps: STAGE.steps.slice(0, 1) }
const ANSWERS = {} as EsnAnswers

// #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
describe('StageEditor — #2018.7 signaler une erreur sur un champ verrouillé', () => {
  it('propose « Signaler une erreur » sur un champ ENTREPRISE verrouillé (membre sans team:manage)', async () => {
    const meta: EsnProfileWorkspaceMeta = { shared: true, canEditCompany: false, role: 'member' }
    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={ANSWERS} meta={meta} />)

    const reportButtons = await screen.findAllByRole('button', { name: /signaler une erreur/i })
    expect(reportButtons.length).toBeGreaterThan(0)
  })

  it('ouvre le dialogue de signalement sur ce champ précis', async () => {
    const meta: EsnProfileWorkspaceMeta = { shared: true, canEditCompany: false, role: 'member' }
    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={ANSWERS} meta={meta} />)

    const [firstReport] = await screen.findAllByRole('button', { name: /signaler une erreur/i })
    await userEvent.click(firstReport!)

    expect(await screen.findByText(/signaler une information fausse/i)).toBeInTheDocument()
  })

  it('n’affiche AUCUN bouton signaler pour un propriétaire (peut écrire directement)', () => {
    const meta: EsnProfileWorkspaceMeta = { shared: true, canEditCompany: true, role: 'owner' }
    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={ANSWERS} meta={meta} />)

    expect(screen.queryByRole('button', { name: /signaler une erreur/i })).not.toBeInTheDocument()
  })

  it('n’affiche AUCUN bouton signaler quand le profil n’est pas partagé (espace mono-utilisateur)', () => {
    const meta: EsnProfileWorkspaceMeta = { shared: false, canEditCompany: true, role: 'owner' }
    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={ANSWERS} meta={meta} />)

    expect(screen.queryByRole('button', { name: /signaler une erreur/i })).not.toBeInTheDocument()
  })
})

// #2058.2 / #2058.10 — réfuté en production le 20/09 : `GET /esn-profile`
// rendait déjà `contact_windows: []` et `detail_level: null`, mais AUCUNE des
// cinq sections de ce même écran (`Réglages › Profil`) ne les posait —
// `TEMPS1_QUESTION_KEYS` les ignorait entièrement. Ce test exerce l'ÉCRAN, pas
// le contrat : les deux avaient déjà un test unitaire vert côté
// `profile-questionnaire.ts` (le profil progressif) et restaient invisibles ici.
const ROLE_STAGE = TEMPS1_STAGES.find(s => s.code === 'role')!
const PREFERENCES_STAGE = { ...ROLE_STAGE, steps: ROLE_STAGE.steps.filter(s => s.slug === 'preferences-echanges') }
const OWNER_META: EsnProfileWorkspaceMeta = { shared: false, canEditCompany: true, role: 'owner' }

describe('StageEditor — #2058.2 / #2058.10 les moments acceptés et le niveau de détail se posent', () => {
  it('pose la question des moments acceptés pour être sollicité, avec ses choix', async () => {
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    expect(await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)).toBeInTheDocument()
    expect(screen.getByText('Matin (avant 12h)')).toBeInTheDocument()
  })

  it('pose la question du niveau de détail attendu, avec ses choix', async () => {
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    expect(await screen.findByText(/quel niveau de détail attends-tu des réponses/i)).toBeInTheDocument()
    expect(screen.getByText('Court et dense')).toBeInTheDocument()
  })
})

// #2006.22 — réfuté en production le 20/09 : chaque réponse s'affichait avec
// la même coche, migrée ou confirmée — aucun badge de statut. Ce test exerce
// l'ÉCRAN, pas le contrat (`ANSWER_STATUSES` avait déjà un test unitaire vert
// et restait invisible en production).
const FILLED_ANSWERS = {
  contact_windows: ['Matin (avant 12h)'],
  detail_level: 'Court et dense',
} as EsnAnswers

function confirmedMeta(
  key: string,
  provenanceOverrides: Partial<NonNullable<AnswerMetaMap[string]>['provenance']> = {},
): NonNullable<AnswerMetaMap[string]> {
  return {
    question: { key, label: key, version: 1 },
    questionnaireVersion: 1,
    provenance: {
      source: 'user',
      confidence: 'high',
      observedAt: '2026-09-20T10:00:00.000Z',
      actorId: 'u1',
      ...provenanceOverrides,
    },
    status: 'confirmed',
    branchReason: 'personal_profile',
    consumerAreas: ['audit'],
  }
}

describe('StageEditor — #2006.22 (décision Louis 20/09) le badge reste éteint tant que rien n’est confirmé', () => {
  beforeEach(() => {
    // `renderWithRouter` fournit un `SessionContext` sans utilisateur, donc
    // `useAnswerStatus` (gardée par `enabled: !!user`) ne résout jamais de
    // données — `data` reste `undefined`, exactement l'état d'un compte dont
    // aucune réponse n'a jamais été relue par ce lot d'écriture.
    vi.mocked(useAnswerStatus).mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useAnswerStatus>)
  })

  it('n’affiche AUCUN badge sur une réponse renseignée quand rien n’a jamais été confirmé — même « Non confirmé »', async () => {
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.queryByText(/non confirmé/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^confirmé$/i)).not.toBeInTheDocument()
  })

  it('n’affiche AUCUN badge de statut sur une question restée sans réponse', async () => {
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.queryByText(/non confirmé/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^confirmé$/i)).not.toBeInTheDocument()
  })

  it('dès qu’UNE réponse est réellement confirmée, le badge redevient visible et distingue les deux', async () => {
    vi.mocked(useAnswerStatus).mockReturnValue({
      data: { contact_windows: confirmedMeta('contact_windows') },
    } as unknown as ReturnType<typeof useAnswerStatus>)

    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    // `contact_windows` a été relu confirmé : « Confirmé ». `detail_level`
    // reste `proposed` (aucune entrée pour cette clé) : « Non confirmé ».
    expect(screen.getByText(/^confirmé$/i)).toBeInTheDocument()
    expect(screen.getByText(/non confirmé/i)).toBeInTheDocument()
  })
})

// #2063.2/.3/.4/.5 — la classification de connaissance se voit à côté du
// statut de confirmation, MÊME quand rien n'est confirmé (contrairement au
// badge ci-dessus) : savoir D'OÙ vient une réponse reste utile tout seul.
describe('StageEditor — #2063.2/.3/.4/.5 classer chaque réponse', () => {
  it('nomme « Déduit » pour une réponse dont la source est une inférence, même sans aucune confirmation nulle part', async () => {
    vi.mocked(useAnswerStatus).mockReturnValue({
      data: {
        contact_windows: {
          question: { key: 'contact_windows', label: 'contact_windows', version: 1 },
          questionnaireVersion: 1,
          provenance: { source: 'inference', confidence: 'low', observedAt: null, actorId: null },
          status: 'proposed',
          branchReason: 'personal_profile',
          consumerAreas: ['audit'],
        },
      },
    } as unknown as ReturnType<typeof useAnswerStatus>)

    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.getByText('Déduit')).toBeInTheDocument()
  })

  it('nomme « Prérempli et confirmé » — pas simplement « Importé » — pour un préremplissage du registre RELU', async () => {
    vi.mocked(useAnswerStatus).mockReturnValue({
      data: { contact_windows: confirmedMeta('contact_windows', { source: 'registry' }) },
    } as unknown as ReturnType<typeof useAnswerStatus>)

    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.getByText('Prérempli et confirmé')).toBeInTheDocument()
  })

  it('nomme « Déclaré par toi » pour une réponse tapée et confirmée par l’utilisateur', async () => {
    vi.mocked(useAnswerStatus).mockReturnValue({
      data: { contact_windows: confirmedMeta('contact_windows') },
    } as unknown as ReturnType<typeof useAnswerStatus>)

    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.getByText('Déclaré par toi')).toBeInTheDocument()
  })
})

// #2021 — recette écran 26/09 : depuis cette page (une colonne, sans la carte
// « Besoin d'aide ? »), aucun chemin ne menait au mode guidé (`OnboardingWizard`)
// que l'issue décrit — seul `ReconfigureAnswersSection`, plus bas sur
// `/settings/profile`, l'ouvrait. Même geste (#2022, `useReconfigureOnboarding`),
// rendu trouvable depuis l'éditeur de CHAQUE étape.
describe('StageEditor — #2021 lien vers le mode guidé', () => {
  it('ne montre AUCUN lien tant que le mode guidé n’est pas disponible (questionnaire en cours, démo…)', async () => {
    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    await screen.findByRole('button', { name: /retour/i })
    expect(screen.queryByRole('button', { name: /mode guidé/i })).not.toBeInTheDocument()
  })

  it('propose le lien vers le mode guidé quand il est disponible, et déclenche le MÊME geste que #2022', async () => {
    const trigger = vi.fn().mockResolvedValue(true)
    vi.mocked(useReconfigureOnboarding).mockReturnValue({
      available: true,
      alreadyRequested: false,
      pending: false,
      trigger,
    })

    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    const link = await screen.findByRole('button', { name: /mode guidé/i })
    await act(async () => {
      link.click()
    })

    expect(trigger).toHaveBeenCalledTimes(1)
  })
})

// #4291.5 — un réglage vit à un seul endroit (GA-26) : le profil d'espace se règle dans Réglages › Règles d'espace.
describe('StageEditor — #4291.5 le profil d’espace ne se repose pas ici', () => {
  it('la page Offre & expertise ne pose plus la question « Comment travailles-tu avec tes clients ? »', async () => {
    const offer = TEMPS1_STAGES.find(s => s.code === 'offer_expertise')!
    const onlyRecruitment = { ...offer, steps: offer.steps.filter(s => s.slug === 'recrutement') }
    const meta: EsnProfileWorkspaceMeta = { shared: false, canEditCompany: true, role: 'owner' }
    renderWithRouter(<StageEditor stage={onlyRecruitment} answers={ANSWERS} meta={meta} />)

    // la question voisine, elle, reste posée (la page a bien rendu) ; celle du profil d'espace n'y est plus
    expect(await screen.findByText(/Proposes-tu aussi du recrutement/)).toBeInTheDocument()
    expect(screen.queryByText(/Comment travailles-tu avec tes clients/)).not.toBeInTheDocument()
  })
})

// #4425.4 — ~50 réponses affichaient « Origine non établie » sans rien offrir :
// l'origine stockée se lit déjà (le libellé suit `answer_meta`), et pour celles
// qui n'en ont pas, un geste « Confirmer » par réponse, qui ne réécrit pas la valeur.
describe('StageEditor — #4425.4 « Confirmer » une réponse sans origine', () => {
  it('propose « Confirmer » sur une réponse renseignée dont l’origine n’est pas établie, et confirme CETTE clé', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useConfirmAnswer).mockReturnValue(confirm)
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.getAllByText('Origine non établie')).toHaveLength(2)
    const buttons = screen.getAllByRole('button', { name: /^Confirmer/ })
    expect(buttons).toHaveLength(2)

    await userEvent.click(buttons[0]!)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith('contact_windows')
  })

  it('une origine STOCKÉE s’affiche et n’appelle aucun geste (déclaré, prérempli…)', async () => {
    vi.mocked(useAnswerStatus).mockReturnValue({
      data: { contact_windows: confirmedMeta('contact_windows'), detail_level: confirmedMeta('detail_level') },
    } as unknown as ReturnType<typeof useAnswerStatus>)
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={FILLED_ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.getAllByText('Déclaré par toi')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).not.toBeInTheDocument()
  })

  it('dit NON : pas de « Confirmer » sur une question sans réponse (on ne confirme pas une absence)', async () => {
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    await screen.findByText(/à quels moments acceptes-tu d'être sollicité/i)
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).not.toBeInTheDocument()
  })

  it('dit NON au verrou de rôle : membre d’un espace partagé, un champ d’entreprise se signale, il ne se confirme pas', async () => {
    const meta: EsnProfileWorkspaceMeta = { shared: true, canEditCompany: false, role: 'member' }
    renderWithRouter(<StageEditor stage={SMALL_STAGE} answers={{ esn_name: 'Acme' } as EsnAnswers} meta={meta} />)

    await screen.findAllByRole('button', { name: /signaler une erreur/i })
    expect(screen.queryByRole('button', { name: /^Confirmer/ })).not.toBeInTheDocument()
  })
})

// Refonte Théo PR12 — chaque question est une carte nommée par sa question (grammaire des Réglages), pas une ligne nue.
describe('StageEditor — refonte Théo : une carte par question', () => {
  it('range chaque question dans une région nommée par son intitulé', async () => {
    renderWithRouter(<StageEditor stage={PREFERENCES_STAGE} answers={ANSWERS} meta={OWNER_META} />)

    expect(
      await screen.findByRole('region', { name: /à quels moments acceptes-tu d'être sollicité/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /quel niveau de détail attends-tu des réponses/i })).toBeInTheDocument()
  })
})
