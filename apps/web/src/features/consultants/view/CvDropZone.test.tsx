import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '@/lib/api-error'
import { CvDropZone } from './CvDropZone'
import { useCvIntake } from '../hooks'
import { toast } from 'sonner'

/** Une promesse dont le test contrôle le moment de la résolution — pour
 *  observer un état « en cours », AVANT que le serveur n'ait répondu. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

vi.mock('../hooks', () => ({ useCvIntake: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * Le dépôt d'un CV (PDF 3 §3.1 et §3.3), monté pour de vrai.
 *
 * Ce que ces tests protègent : un doublon ARRÊTE le dépôt, il ne le complète
 * pas. Tant que personne n'a dit « ce n'est pas la même personne », rien n'est
 * écrit — et l'affirmation doit venir d'un clic, jamais d'un défaut.
 */
function mockIntake(result: unknown, isPending = false) {
  const mutateAsync = vi.fn().mockResolvedValue(result)
  vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending } as unknown as ReturnType<typeof useCvIntake>)
  return mutateAsync
}

function dropFile(name = 'cv.pdf') {
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' })
  const input = screen.getByLabelText('Choisir un fichier')
  fireEvent.change(input, { target: { files: [file] } })
}

describe('CvDropZone', () => {
  // M2.3 (Meyer 20/10) — un tableur n'est pas un CV : refusé côté écran AVANT tout envoi, avec le renvoi vers Réglages › Import.
  it('M2.3 — un CSV déposé est refusé sans appel serveur, avec le renvoi vers Réglages › Import', async () => {
    const mutateAsync = mockIntake({ outcome: 'created', consultantId: 'c1', extractedChars: 1 })
    render(<CvDropZone />)

    fireEvent.change(screen.getByLabelText('Choisir un fichier'), {
      target: { files: [new File(['a;b;c'], 'contacts.csv', { type: 'text/csv' })] },
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Réglages › Import/)))
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('M2.3 — le sélecteur de fichier ne propose ni CSV ni tableur', () => {
    mockIntake({ outcome: 'created', consultantId: 'c1', extractedChars: 1 })
    render(<CvDropZone />)
    const accept = screen.getByLabelText('Choisir un fichier').getAttribute('accept') ?? ''
    expect(accept).toMatch(/\.pdf/)
    expect(accept).not.toMatch(/csv|xls|tsv|ods/)
  })

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('crée la fiche et emmène dessus quand rien ne ressemble', async () => {
    const mutateAsync = mockIntake({ outcome: 'created', consultantId: 'c1', extractedChars: 420 })
    const onCreated = vi.fn()
    render(<CvDropZone onCreated={onCreated} />)

    dropFile()

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('c1'))
    // Le premier envoi n'affirme JAMAIS que ce n'est pas un doublon.
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ createDespiteDuplicates: false }))
  })

  // #4348.2 — repli LinkedIn : le texte du profil, collé, suit la MÊME route que le fichier.
  it('#4348.2 — le texte d’un profil collé crée la fiche par la même route que le fichier', async () => {
    const mutateAsync = mockIntake({ outcome: 'created', consultantId: 'c9', extractedChars: 120 })
    const onCreated = vi.fn()
    render(<CvDropZone onCreated={onCreated} />)

    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte d’un profil' }))
    expect(screen.getByRole('button', { name: 'Créer la fiche depuis ce texte' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Texte du profil'), { target: { value: 'Jeanne Martin, architecte SAP' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer la fiche depuis ce texte' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('c9'))
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'profil-colle.txt', createDespiteDuplicates: false }),
    )
  })

  it('S’ARRÊTE sur un doublon et montre POURQUOI', async () => {
    mockIntake({
      outcome: 'duplicates',
      duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_email', confidence: 0.95 }],
    })
    const onCreated = vi.fn()
    render(<CvDropZone onCreated={onCreated} />)

    dropFile()

    await waitFor(() => expect(screen.getByText(/ressemble à quelqu/)).toBeInTheDocument())
    // La raison est LISIBLE : « même adresse professionnelle » se vérifie,
    // « doublon possible » ne se vérifie pas.
    expect(screen.getByText(/même adresse professionnelle/)).toBeInTheDocument()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('ne crée qu’après une affirmation EXPLICITE', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'duplicates',
        duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_name', confidence: 0.3 }],
      })
      .mockResolvedValueOnce({ outcome: 'created', consultantId: 'c2', extractedChars: 10 })
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvIntake
    >)
    const onCreated = vi.fn()
    render(<CvDropZone onCreated={onCreated} />)

    dropFile()
    await waitFor(() => expect(screen.getByText(/pas la même personne/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/pas la même personne/))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('c2'))
    expect(mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ createDespiteDuplicates: true }))
  })

  it('#2327.12 — « créer quand même » transmet les fiches ÉCARTÉES, pour que la paire ne revienne plus', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'duplicates',
        state: 'ambiguous',
        duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_name', confidence: 0.3 }],
      })
      .mockResolvedValueOnce({ outcome: 'created', consultantId: 'c2', extractedChars: 10, state: 'new' })
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvIntake
    >)
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()
    await waitFor(() => expect(screen.getByText(/pas la même personne/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/pas la même personne/))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ createDespiteDuplicates: true, dismissedTalentIds: ['a'] }),
      ),
    )
  })

  it('#2327.17 — le CV peut REJOINDRE la fiche existante, sans créer de personne', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'duplicates',
        state: 'resolved',
        duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_email', confidence: 0.95 }],
      })
      .mockResolvedValueOnce({ outcome: 'updated', consultantId: 'a', extractedChars: 10, state: 'updated' })
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvIntake
    >)
    const onCreated = vi.fn()
    render(<CvDropZone onCreated={onCreated} />)

    dropFile()
    const attach = await screen.findByRole('button', { name: /Ajouter ce CV à la fiche de Yanis Berthier/ })
    fireEvent.click(attach)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('a'))
    expect(mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ attachToTalentId: 'a' }))
    expect(mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ createDespiteDuplicates: true }))
  })

  it('annuler ferme la question sans rien créer', async () => {
    mockIntake({
      outcome: 'duplicates',
      duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_phone', confidence: 0.8 }],
    })
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()
    await waitFor(() => expect(screen.getByText(/ressemble à quelqu/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Annuler le dépôt'))

    expect(screen.queryByText(/ressemble à quelqu/)).not.toBeInTheDocument()
  })

  /**
   * #2327.1 / #2327.17 — DÉFAUT recette 17/09 (passage 7) : l'onglet
   * Documents de la fiche talent (`/consultants/<id>`) n'avait aucune zone de
   * dépôt de CV. `CvDropZone` existait, mais `ConsultantFormDialog.tsx:192`
   * ne le rend QUE pour une création (`isCreation && …`) — jamais quand
   * `consultant` est déjà la fiche ouverte. `attachToTalentId` fait dropper
   * un CV DIRECTEMENT sur la fiche COURANTE : le serveur saute la détection de
   * doublon dans ce cas (`cv-intake.service.ts:118-140`, la fiche cible est
   * déjà connue), donc aucune question à poser — c'est un ajout de version.
   */
  it('#2327.1 / #2327.17 — avec `attachToTalentId`, le dépôt rejoint DIRECTEMENT cette fiche', async () => {
    const mutateAsync = mockIntake({ outcome: 'updated', consultantId: 't1', extractedChars: 200, state: 'updated' })
    const onCreated = vi.fn()
    render(<CvDropZone attachToTalentId="t1" onCreated={onCreated} />)

    dropFile()

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('t1'))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ attachToTalentId: 't1' }))
    // Aucune question de doublon à poser : la cible est déjà connue.
    expect(screen.queryByText(/ressemble à quelqu/)).not.toBeInTheDocument()
  })

  it('#2327.1 — avec `attachToTalentId`, le dépôt en masse (qui CRÉE toujours) n’est pas proposé', () => {
    mockIntake({ outcome: 'updated', consultantId: 't1', extractedChars: 200, state: 'updated' })
    render(<CvDropZone attachToTalentId="t1" onCreated={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Charger plusieurs CV' })).not.toBeInTheDocument()
  })
})

/**
 * #2542.1 — Ludovic Marx (call bêta 17/09) : un CV « bloqué en analyse » ne
 * racontait rien — seul le libellé du bouton changeait. Ces tests prouvent
 * l'appelant RÉEL (`CvDropZone`, pas une fonction pure isolée) : le dépôt
 * affiche ce qu'il SAIT (deux faits vérifiables sur un aller-retour HTTP
 * unique) et ce qu'il NE sait pas, jamais un pourcentage inventé.
 */
describe('#2542.1 — la progression réelle d’un dépôt SEUL', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('« Dépôt reçu » s’affiche avant même la réponse du serveur', async () => {
    const { promise } = deferred<{ outcome: 'created'; consultantId: string; extractedChars: number }>()
    const mutateAsync = vi.fn().mockReturnValue(promise)
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: true } as unknown as ReturnType<
      typeof useCvIntake
    >)
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()

    await waitFor(() => expect(screen.getByText('Dépôt reçu')).toBeInTheDocument())
    // flaky mesuré le 18/09/2026 — une lecture SYNCHRONE juste après le waitFor
    // précédent dépendait de la vitesse machine : la transition « received » →
    // « processing » attend un vrai FileReader (`readAsBase64`, async hors
    // contrôle du test), et sur un runner chargé la lecture arrivait parfois
    // avant que ce FileReader n'ait fini. Remplacé par un waitFor déterministe :
    // on attend l'ÉTAT, jamais une course entre deux boucles async.
    // Ni « franchi » ni inventé pour la suite : la lecture/extraction reste EN
    // COURS tant que le serveur n'a pas répondu.
    await waitFor(() => expect(screen.getByText('Lecture et extraction du document en cours…')).toBeInTheDocument())
    expect(screen.queryByText('Fiche créée')).not.toBeInTheDocument()
  })

  it('« Fiche créée » remplace « en cours » exactement quand le serveur répond', async () => {
    const { promise, resolve } = deferred<{ outcome: 'created'; consultantId: string; extractedChars: number }>()
    const mutateAsync = vi.fn().mockReturnValue(promise)
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: true } as unknown as ReturnType<
      typeof useCvIntake
    >)
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()
    await waitFor(() => expect(screen.getByText('Lecture et extraction du document en cours…')).toBeInTheDocument())

    resolve({ outcome: 'created', consultantId: 'c9', extractedChars: 100 })

    await waitFor(() => expect(screen.getByText('Fiche créée')).toBeInTheDocument())
    expect(screen.queryByText('Lecture et extraction du document en cours…')).not.toBeInTheDocument()
  })

  it('un CV qui REJOINT une fiche existante nomme « Fiche mise à jour », pas « créée »', async () => {
    mockIntake({ outcome: 'updated', consultantId: 'a', extractedChars: 50, state: 'updated' })
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()

    await waitFor(() => expect(screen.getByText('Fiche mise à jour')).toBeInTheDocument())
    expect(screen.queryByText('Fiche créée')).not.toBeInTheDocument()
  })

  it('une erreur NOMMÉE (ApiError du serveur) reste LISIBLE à l’écran, pas seulement en toast éphémère', async () => {
    const message =
      'Le service d’extraction est indisponible pour le moment. Réessaie dans un instant — le fichier n’est pas perdu.'
    const mutateAsync = vi.fn().mockRejectedValue(new ApiError(message, 503))
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvIntake
    >)
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    // Le fait « reçu » reste vrai — l'échec porte sur l'extraction, pas sur le dépôt.
    expect(alert).toHaveTextContent('Dépôt reçu')
  })

  it('une panne de TRANSPORT (pas une ApiError) dit qu’on ne sait pas — jamais un échec inventé, et ne se rejoue pas seule', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvIntake
    >)
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()

    await waitFor(() => expect(screen.getByText(/On ne sait pas si le dépôt est arrivé/)).toBeInTheDocument())
    // `unknown` n'est PAS un échec nommé : jamais le rôle d'alerte réservé aux
    // erreurs que le serveur a réellement expliquées.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })

  it('un doublon efface le bloc de progression — le tiroir « ça ressemble à… » porte déjà l’explication', async () => {
    mockIntake({
      outcome: 'duplicates',
      duplicates: [{ talentId: 'a', fullName: 'Yanis Berthier', reason: 'same_email', confidence: 0.95 }],
    })
    render(<CvDropZone onCreated={vi.fn()} />)

    dropFile()

    await waitFor(() => expect(screen.getByText(/ressemble à quelqu/)).toBeInTheDocument())
    expect(screen.queryByText('Dépôt reçu')).not.toBeInTheDocument()
  })
})

/**
 * #2183.4 — « charger un dossier de CV », pas fichier par fichier.
 *
 * `webkitdirectory` ne respecte pas `accept` : un dossier réel contient des
 * fichiers qui ne sont pas des CV (`.DS_Store`, captures d'écran). Le test
 * prouve que ceux-ci n'atteignent jamais le serveur — ni comptés comme un
 * échec, ni comme un fichier traité.
 */
describe('#2183.4 — charger un dossier entier', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('affiche un bouton dédié, distinct de « Charger plusieurs CV »', () => {
    mockIntake({ outcome: 'created', consultantId: 'c1', extractedChars: 10 })
    render(<CvDropZone onCreated={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Charger un dossier de CV' })).toBeInTheDocument()
  })

  it('n’envoie que les formats de CV reconnus du dossier, jamais les fichiers système', async () => {
    const mutateAsync = mockIntake({ outcome: 'created', consultantId: 'c1', extractedChars: 10 })
    render(<CvDropZone onCreated={vi.fn()} />)

    const input = screen.getByLabelText('Charger un dossier de CV')
    const files = [
      new File(['%PDF'], 'cv-a.pdf', { type: 'application/pdf' }),
      new File(['ds'], '.DS_Store'),
      new File(['%PDF'], 'cv-b.pdf', { type: 'application/pdf' }),
    ]
    fireEvent.change(input, { target: { files } })

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ filename: 'cv-a.pdf' }))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ filename: 'cv-b.pdf' }))
  })

  it('n’est pas proposé quand la cible est déjà connue (`attachToTalentId`)', () => {
    mockIntake({ outcome: 'updated', consultantId: 't1', extractedChars: 200, state: 'updated' })
    render(<CvDropZone attachToTalentId="t1" onCreated={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Charger un dossier de CV' })).not.toBeInTheDocument()
  })
})

/**
 * #2183.43 — « temps restant » a un APPELANT : `estimateRemainingMs` existait
 * déjà (`cfd96f846`, agent interrompu) mais personne ne l'appelait ici.
 *
 * Horodatages contrôlés via `Date.now` — jamais l'horloge réelle (leçon du
 * 21/09, un test qui en dépend est flaky par construction).
 */
describe('#2183.43 — le temps restant du lot', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extrapole sur le PREMIER fichier terminé, pas avant', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    const first = deferred<{ outcome: string; consultantId: string }>()
    const second = deferred<{ outcome: string; consultantId: string }>()
    const mutateAsync = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    vi.mocked(useCvIntake).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvIntake
    >)
    render(<CvDropZone onCreated={vi.fn()} />)

    const input = screen.getByLabelText('Charger plusieurs CV')
    const files = [
      new File(['%PDF'], 'cv-a.pdf', { type: 'application/pdf' }),
      new File(['%PDF'], 'cv-b.pdf', { type: 'application/pdf' }),
    ]
    fireEvent.change(input, { target: { files } })

    // Rien à extrapoler tant qu'aucun fichier n'est fini.
    expect(screen.queryByText(/restante/)).not.toBeInTheDocument()

    now = 5000 // 4 s écoulées pour le premier fichier.
    first.resolve({ outcome: 'created', consultantId: 'c1' })

    // 4 s pour 1 fichier ⇒ 4 s/fichier ⇒ 1 restant ⇒ ≈ 4 s.
    await waitFor(() => expect(screen.getByText('≈ 4 secondes restantes')).toBeInTheDocument())

    second.resolve({ outcome: 'created', consultantId: 'c2' })
    await waitFor(() => expect(screen.getByText('2 sur 2 traités')).toBeInTheDocument())
    // Le lot est fini : plus rien à attendre.
    expect(screen.queryByText(/restante/)).not.toBeInTheDocument()
  })
})
