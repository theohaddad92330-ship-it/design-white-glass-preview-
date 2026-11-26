// Décision Louis 12/10 revient sur c88, délibérément : la revue du CV sert à CORRIGER, plus à valider.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CvDetection, ParsedField, RecordFieldAudit } from '@bellum/contracts'
import { toast } from 'sonner'
import { CvReviewPanel } from './CvReviewPanel'
import { useCommitCvParse, useParseCv } from '../../hooks'

vi.mock('../../hooks', () => ({ useParseCv: vi.fn(), useCommitCvParse: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const CV = 'YANIS BERTHIER — Ingénieur plateforme. Kubernetes, Prometheus, Go.'

function field(over: Partial<ParsedField> = {}): ParsedField {
  return {
    detection: 'skills',
    value: ['Kubernetes', 'Go'],
    confidence: 0.9,
    sourceExcerpt: 'Kubernetes, Prometheus, Go.',
    excerptOffset: CV.indexOf('Kubernetes'),
    ...over,
  } as ParsedField
}

/** #2184.37 / #2184.38 — une ligne de « qui a revu ce bloc, et quand ». */
function auditRow(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
  return {
    id: 'a4e6e9f0-0000-4000-8000-000000000001',
    entityType: 'consultant',
    entityId: 'c1',
    field: 'cv_parse.skills',
    oldValue: null,
    newValue: 'human',
    source: 'human',
    actorId: 'a4e6e9f0-0000-4000-8000-0000000000aa',
    actorName: 'Jeanne Martin',
    createdAt: '2026-09-20T10:00:00.000Z',
    rule: 'cv_parse.review',
    ...over,
  }
}

function mount(
  fields: ParsedField[],
  canAcceptAll = true,
  partial = false,
  fieldHistory: Partial<Record<CvDetection, RecordFieldAudit>> = {},
) {
  const mutateAsync = vi.fn().mockResolvedValue({ applied: [], rejected: [], qualified: true })
  vi.mocked(useParseCv).mockReturnValue({
    data: { fields, sourceChars: CV.length, cvText: CV, canAcceptAll, partial, fieldHistory },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useParseCv>)
  vi.mocked(useCommitCvParse).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useCommitCvParse>)
  render(<CvReviewPanel talentId="c1" cvText={CV} onDone={vi.fn()} />)
  return mutateAsync
}

/**
 * L'écran de revue d'un CV parsé (PDF 3 §4.2), monté pour de vrai.
 *
 * Ce que ces tests protègent : la PREUVE reste visible, un champ non trouvé se
 * distingue d'une case vide, et « Tout accepter » se refuse quand il le doit.
 */
describe('CvReviewPanel', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('affiche la citation SOUS chaque champ — c’est ce qui distingue une lecture d’une affirmation', () => {
    mount([field()])
    // Deux fois à l'écran, et c'est le point : le passage EST dans le CV à
    // gauche, et il est CITÉ sous le champ à droite. Le voir aux deux endroits
    // est ce qui rend la vérification immédiate.
    expect(screen.getAllByText(/Kubernetes, Prometheus, Go\./).length).toBeGreaterThanOrEqual(2)
  })

  /**
   * #2542.3 — mesuré en suivant la chaîne #2542 : une lecture PARTIELLE
   * (#1954.16/.30) survit jusqu'ici, mais rien ne l'affichait encore. Sans ce
   * bandeau, un champ « non trouvé » se lit comme confirmé absent du CV —
   * exactement ce que « non mesuré n'est jamais 0 » (GA-18/GA-19) interdit.
   */
  it('#2542.3 — signale une lecture PARTIELLE, jamais un succès silencieux', () => {
    mount([field()], true, true)
    expect(screen.getByText(/lu partiellement|lecture partielle/i)).toBeInTheDocument()
  })

  it('#2542.3 — contrôle négatif : une lecture COMPLÈTE ne montre aucun bandeau', () => {
    mount([field()], true, false)
    expect(screen.queryByText(/lu partiellement|lecture partielle/i)).toBeNull()
  })

  // #3811 — un CV exporté d'un autre SaaS rendait une fiche SANS compétence, et
  // l'écran se taisait : « 0 compétence extraite » se dit, avec le geste à faire.
  it('#3811 — dit « 0 compétence extraite » quand le bloc compétences est vide', () => {
    mount([field({ value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 })])
    expect(screen.getByText(/0 compétence extraite — vérifier le document/)).toBeInTheDocument()
  })

  it('#3811 — contrôle négatif : des compétences lues, aucun avertissement', () => {
    mount([field()])
    expect(screen.queryByText(/0 compétence extraite/)).toBeNull()
  })

  it('#3811 — l’avertissement suit aussi la validation (toast), pas seulement le bandeau', async () => {
    mount([field({ value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 })])
    fireEvent.click(screen.getByText('Enregistrer mes corrections'))
    await waitFor(() => expect(toast.warning).toHaveBeenCalled())
  })

  // #2551 — après l'analyse d'un dossier de compétences : où le placer, qui
  // appeler. Le geste mène au Reverse Market du profil (comptes + interlocuteurs).
  it('#2551 — la validation propose « Où placer ce profil ? » quand l’appelant le branche', async () => {
    const onPlace = vi.fn()
    const mutateAsync = vi.fn().mockResolvedValue({ applied: [], rejected: [], qualified: true })
    vi.mocked(useParseCv).mockReturnValue({
      data: {
        fields: [field()],
        sourceChars: CV.length,
        cvText: CV,
        canAcceptAll: true,
        partial: false,
        fieldHistory: {},
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useParseCv>)
    vi.mocked(useCommitCvParse).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCommitCvParse
    >)
    render(<CvReviewPanel talentId="c1" cvText={CV} onDone={vi.fn()} onPlace={onPlace} />)
    fireEvent.click(screen.getByText('Enregistrer mes corrections'))
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const options = vi.mocked(toast.success).mock.calls[0][1] as { action: { label: string; onClick: () => void } }
    expect(options.action.label).toBe('Où placer ce profil ?')
    options.action.onClick()
    expect(onPlace).toHaveBeenCalled()
  })

  it('DIT « non trouvé dans le CV » plutôt que de laisser une case vide', () => {
    // Un blanc se lit comme un défaut d'affichage.
    mount([field({ detection: 'mobility', value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 })])
    expect(screen.getByText('Non trouvé dans le CV')).toBeInTheDocument()
  })

  /**
   * #1789 — « avoir qu'un bouton valider, qui accepte tout et qualifie, ça
   * sert à rien d'avoir trop de blabla pour rien ».
   *
   * Il y avait DEUX gestes pour le cas simple : « Tout accepter » (qui, en
   * plus, EFFAÇAIT toute correction déjà saisie — `setDecisions({})` remettait
   * tout à zéro) puis « Valider ». Or « Valider » acceptait déjà, tout seul,
   * chaque champ non touché (`decisionFor` retombe sur `accept` par défaut) :
   * le premier bouton n'ajoutait rien, sauf le risque d'écraser une correction.
   * Un champ incertain reste SIGNALÉ (texte, pas bouton bloquant) : le chemin
   * rapide existe, il n'empêche pas de voir qu'il faudrait relire.
   */
  it('#1789 — N’AFFICHE QU’UN bouton, et le champ incertain reste SIGNALÉ sans bloquer', () => {
    mount([field({ confidence: 0.3 })], false)
    expect(screen.queryByText('Tout accepter')).toBeNull()
    expect(screen.getByText(/champ décisif est incertain/)).toBeInTheDocument()
    // Le seul bouton reste utilisable : le signal est une information, pas une porte.
    expect(screen.getByText('Enregistrer mes corrections').closest('button')).not.toBeDisabled()
  })

  /**
   * #1789 — « une correction humaine gagne toujours » doit survivre à
   * l'ACCEPTATION IMPLICITE des autres champs par le bouton unique. C'est
   * exactement le scénario que l'ancien bouton « Tout accepter » cassait :
   * corriger un champ, puis cliquer sur ce qui « accepte tout », effaçait la
   * correction avant même l'envoi.
   */
  it('#1789 — une correction survit au bouton unique qui accepte le reste', async () => {
    const mutateAsync = mount([
      field({ detection: 'skills', value: ['Kubernetes', 'Go'] }),
      field({
        detection: 'job_title',
        value: 'Ingénieur plateforme',
        sourceExcerpt: 'Ingénieur plateforme.',
        excerptOffset: 0,
      }),
    ])

    // Une correction humaine, à la main, sur un seul des deux champs.
    fireEvent.click(within(screen.getByText('Compétences').closest('li') as HTMLElement).getByText('Corriger'))
    fireEvent.change(screen.getByLabelText('Compétences'), { target: { value: 'Kubernetes, Terraform' } })

    // UN SEUL clic — pas de « Tout accepter » préalable.
    fireEvent.click(screen.getByText('Enregistrer mes corrections'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const payload = mutateAsync.mock.calls[0][0] as {
      fields: { detection: string; decision: string; value: unknown }[]
    }
    const skills = payload.fields.find(entry => entry.detection === 'skills')
    const jobTitle = payload.fields.find(entry => entry.detection === 'job_title')

    // La correction saisie à la main n'a pas été écrasée par l'acceptation du reste.
    expect(skills).toMatchObject({ decision: 'correct', value: ['Kubernetes', 'Terraform'] })
    // Le champ non touché est accepté tel quel — c'est le « accepte tout » du bouton unique.
    expect(jobTitle).toMatchObject({ decision: 'accept', value: 'Ingénieur plateforme' })
  })

  it('n’envoie QUE les champs réellement lus', async () => {
    const mutateAsync = mount([
      field(),
      field({ detection: 'mobility', value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 }),
    ])

    fireEvent.click(screen.getByText('Enregistrer mes corrections'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const payload = mutateAsync.mock.calls[0][0] as { fields: { detection: string }[] }
    // Un champ non trouvé n'est pas une décision : l'envoyer écrirait un `null`
    // sur une fiche qui portait peut-être déjà la valeur.
    expect(payload.fields.map(entry => entry.detection)).toEqual(['skills'])
  })

  it('garde le TYPE d’origine quand on corrige une liste', async () => {
    const mutateAsync = mount([field()])

    fireEvent.click(screen.getByText('Corriger'))
    fireEvent.change(screen.getByLabelText('Compétences'), { target: { value: 'Kubernetes, Terraform' } })
    fireEvent.click(screen.getByText('Enregistrer mes corrections'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const payload = mutateAsync.mock.calls[0][0] as { fields: { value: unknown; decision: string }[] }
    expect(payload.fields[0]?.decision).toBe('correct')
    expect(payload.fields[0]?.value).toEqual(['Kubernetes', 'Terraform'])
  })

  it('envoie `null` pour un champ rejeté, et le marque comme tel', async () => {
    const mutateAsync = mount([field()])

    fireEvent.click(screen.getByText('Rejeter'))
    fireEvent.click(screen.getByText('Enregistrer mes corrections'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    const payload = mutateAsync.mock.calls[0][0] as { fields: { value: unknown; decision: string }[] }
    expect(payload.fields[0]).toMatchObject({ decision: 'reject', value: null })
  })

  /**
   * #2184.37 / #2184.38 — traçabilité : qui a déjà revu ce bloc, et quand.
   * Ré-ouvrir la revue d'une fiche déjà qualifiée ne doit pas se lire comme
   * une première lecture : le journal (`fieldHistory`) porte la réponse.
   */
  it('#2184.37/.38 — montre qui a validé un bloc déjà revu, et quand', () => {
    mount([field()], true, false, { skills: auditRow({ actorName: 'Jeanne Martin' }) })
    expect(screen.getByText(/Jeanne Martin/)).toBeInTheDocument()
  })

  it('#2184.37/.38 — contrôle négatif : aucune trace pour un bloc jamais revu', () => {
    // Deux champs, un seul a un historique — l'autre ne doit RIEN afficher, ni
    // un « auteur inconnu » qui laisserait croire à une revue sans nom.
    mount(
      [field(), field({ detection: 'job_title', value: 'Ingénieur plateforme', sourceExcerpt: 'Ingénieur.' })],
      true,
      false,
      { skills: auditRow({ actorName: 'Jeanne Martin' }) },
    )
    expect(screen.getByText(/Jeanne Martin/)).toBeInTheDocument()
    expect(screen.queryByText(/Auteur inconnu/)).toBeNull()
    const jobTitleItem = screen.getByText('Titre métier').closest('li') as HTMLElement
    expect(within(jobTitleItem).queryByText(/Validé par/)).toBeNull()
  })

  it('#2184.37/.38 — un champ SANS historique ne montre aucune trace (première revue)', () => {
    mount([field()])
    expect(screen.queryByText(/Validé par/)).toBeNull()
  })
})

/**
 * #1780 — « VOIR CV SAMUEL ».
 *
 * Un client a importé un CV, ouvert la fiche, et n'a trouvé que « Je lis le
 * CV… ». Le texte du CV est pourtant DÉJÀ en base et déjà chargé par l'écran :
 * le regarder n'a aucune raison d'attendre un appel de modèle, ni d'échouer
 * avec lui. C'est le geste le plus simple de la fiche, et c'était le seul
 * inaccessible.
 */
describe('CvReviewPanel — le CV se lit sans attendre la lecture automatique', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.mocked(useCommitCvParse).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCommitCvParse>)
  })

  it('montre le texte du CV PENDANT que la lecture tourne', () => {
    vi.mocked(useParseCv).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useParseCv>)

    render(<CvReviewPanel talentId="c1" cvText={CV} onDone={vi.fn()} />)

    expect(screen.getByText(/Je lis le CV/)).toBeInTheDocument()
    expect(screen.getByText(/YANIS BERTHIER/)).toBeInTheDocument()
  })

  it('montre le texte du CV même quand la lecture ÉCHOUE', () => {
    vi.mocked(useParseCv).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('lecture indisponible'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useParseCv>)

    render(<CvReviewPanel talentId="c1" cvText={CV} onDone={vi.fn()} />)

    expect(screen.getByText('lecture indisponible')).toBeInTheDocument()
    expect(screen.getByText(/YANIS BERTHIER/)).toBeInTheDocument()
  })

  /**
   * #2542.2 — l'issue #2542 exige, sur un document jamais traité, « un moyen
   * de réessayer ». L'écran d'échec avait le message NOMMÉ mais aucun geste :
   * la seule reprise possible était de fermer la fiche et de la rouvrir.
   */
  it('#2542.2 — propose de RÉESSAYER quand la lecture échoue, sans relance automatique', () => {
    const refetch = vi.fn()
    vi.mocked(useParseCv).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('lecture indisponible'),
      refetch,
    } as unknown as ReturnType<typeof useParseCv>)

    render(<CvReviewPanel talentId="c1" cvText={CV} onDone={vi.fn()} />)

    // Un GESTE humain, jamais une reprise automatique — même doctrine que
    // « un timeout n'est pas un échec : `unknown` arrête la reprise ».
    expect(refetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('ne prétend PAS montrer un CV quand il n’y en a pas', () => {
    vi.mocked(useParseCv).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useParseCv>)

    render(<CvReviewPanel talentId="c1" cvText={null} onDone={vi.fn()} />)

    expect(screen.getByText(/Je lis le CV/)).toBeInTheDocument()
    expect(screen.queryByText(/caractères/)).toBeNull()
  })
})
