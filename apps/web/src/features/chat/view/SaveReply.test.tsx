import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SaveReply, replyConclusion } from './SaveReply'

/**
 * « Sauvegarder cette réponse » (§13) réutilise l'endpoint d'épinglage EXISTANT.
 * Ces tests verrouillent les deux promesses : rien n'est écrit avant le clic, et
 * ce qui est épinglé est un extrait VERBATIM de la réponse (jamais un résumé
 * fabriqué côté client).
 */

const mutate = vi.fn()

vi.mock('@/features/memory/hooks/usePinFact', () => ({
  usePinFact: () => ({ mutate, isPending: false }),
}))

// #1946.11 — le traceur produit est doublé pour OBSERVER : la vraie
// implémentation est inerte sans `VITE_PRODUCT_TRACKER_ENABLED`, donc un test
// qui l'appellerait pour de vrai serait vert sans rien mesurer.
const { memoryAdded } = vi.hoisted(() => ({ memoryAdded: vi.fn() }))
vi.mock('@/lib/product-tracker', () => ({ trackMemoryAdded: memoryAdded }))

beforeEach(() => {
  mutate.mockReset()
  memoryAdded.mockClear()
})

const STRUCTURED = [
  'Voici comment attaquer.',
  '',
  '**Objectif :** obtenir un premier échange avec la DSI avant fin septembre.',
  "**Angle d'accroche :** leur appel d'offres SIRH du 12 mars.",
  "**Cas d'usage :** aucune référence comparable dans ta base.",
].join('\n')

describe('replyConclusion', () => {
  it('retient la section Objectif quand la réponse est structurée', () => {
    expect(replyConclusion(STRUCTURED)).toBe('Objectif : obtenir un premier échange avec la DSI avant fin septembre.')
  })

  /**
   * #1924.1 — LA CONCLUSION D'UN CONSEIL EST SON VERDICT.
   *
   * Depuis le 16/09/2026 un conseil se rend en « Verdict / Pourquoi / Ce qui
   * manque / Prochaine action » : il n'a PAS de section « Objectif ». Sans cette
   * lecture, « Sauvegarder cette réponse » épinglerait les quatre sections
   * entières — jusqu'à 2 000 caractères de carte — là où l'utilisateur voulait
   * garder la décision.
   */
  it('retient la section Verdict quand la réponse est un CONSEIL (#1924.1)', () => {
    const advice = [
      'Voici ce que je recommande.',
      '',
      '**Verdict :** oui, mais en régie encadrée, pas au forfait.',
      '**Pourquoi :** leur périmètre bouge encore, le plan 2029 n’est pas arbitré.',
      '**Ce qui manque :** je n’ai pas pu regarder leur pile technique.',
      '**Prochaine action :** qualifier le besoin publié de la filiale.',
    ].join('\n')
    expect(replyConclusion(advice)).toBe('Verdict : oui, mais en régie encadrée, pas au forfait.')
  })

  /**
   * LE TÉMOIN — un PLAN garde sa conclusion d'avant. Si « Verdict » avait été
   * ajouté en écrasant la lecture au lieu de la précéder, ce test rougirait.
   */
  it('retient le texte tel quel quand la réponse ne l’est pas', () => {
    expect(replyConclusion('Le score de TF1 est 8/10.')).toBe('Le score de TF1 est 8/10.')
  })

  it('borne l’extrait au plafond serveur, sur un mot', () => {
    const long = `${'mot '.repeat(700)}fin`
    const pinned = replyConclusion(long)
    expect(pinned.length).toBeLessThanOrEqual(2000)
    expect(pinned.endsWith('…')).toBe(true)
    // Coupé sur un espace : jamais au milieu d'un mot.
    expect(pinned).not.toMatch(/mo…$/)
  })
})

/**
 * #1962.11 à .16 — « ENREGISTRER COMME… », UN CHOIX EXPLICITE.
 *
 * Le bouton épinglait en UN clic, toujours comme un fait personnel : la nature
 * de ce qu'on garde — une règle de l'ESN, une correction du compte, une piste à
 * vérifier — ne se choisissait nulle part depuis le fil. Il ouvre désormais le
 * choix, et chaque option dit QUI verra ce qu'elle enregistre avant le clic.
 */
describe('SaveReply — « Enregistrer comme… » (#1962.11)', () => {
  it('n’épingle rien au rendu, et n’ouvre pas le choix tout seul', () => {
    render(<SaveReply text={STRUCTURED} accountId="acc-1" />)
    expect(screen.getByRole('button', { name: /Sauvegarder cette réponse/ })).toBeInTheDocument()
    expect(screen.queryByText('Enregistrer comme…')).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('le bouton OUVRE le choix — il n’épingle plus rien à lui seul', () => {
    render(<SaveReply text={STRUCTURED} accountId="acc-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    expect(screen.getByText('Enregistrer comme…')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('« Fait » : personnel, en un clic (#1962.12)', async () => {
    render(<SaveReply text={STRUCTURED} accountId="acc-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Fait/ }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0]).toEqual({
      fact: 'Objectif : obtenir un premier échange avec la DSI avant fin septembre.',
      accountId: 'acc-1',
      kind: 'fact',
      // V2 §20 : la provenance est un FAIT — cet élément vient d'une réponse du
      // copilote, pas d'une saisie à la main.
      origin: 'copilot',
      // #1918.6 — il ne partage rien avec l'espace. « Toi uniquement », visible
      // et changeable dans Réglages › Mémoire.
      scope: 'user',
    })
  })

  it('« Règle d’ESN » : partagée, et l’option le DIT avant le clic (#1962.13)', async () => {
    render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    const option = screen.getByRole('button', { name: /Règle d’ESN/ })
    expect(option).toHaveTextContent('Toute ton ESN')
    fireEvent.click(option)
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0]).toEqual({
      fact: 'Priorise Doctolib.',
      accountId: null,
      kind: 'workspace_rule',
      origin: 'copilot',
      scope: 'workspace',
    })
  })

  it('« Information à vérifier » : une hypothèse, gardée pour soi (#1962.15)', async () => {
    render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hypothèse à vérifier/ }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0]).toMatchObject({ kind: 'hypothesis', scope: 'user' })
  })

  it('« Préférence » : gardée pour soi (#1962.16)', async () => {
    render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Préférence/ }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0]).toMatchObject({ kind: 'preference', scope: 'user' })
  })

  it('« Correction terrain » n’est offerte QUE sur un fil de compte — sinon elle ne corrige rien (#1962.14)', async () => {
    const { unmount } = render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    expect(screen.queryByRole('button', { name: /Correction terrain/ })).toBeNull()
    unmount()

    render(<SaveReply text="Priorise Doctolib." accountId="acc-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Correction terrain/ }))
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    expect(mutate.mock.calls[0][0]).toMatchObject({ kind: 'correction', accountId: 'acc-1', scope: 'workspace' })
  })

  it('passe en « Sauvegardé » en NOMMANT la nature, et ne peut pas être ré-épinglé', async () => {
    mutate.mockImplementation((_input, options) => options?.onSuccess?.())
    render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hypothèse à vérifier/ }))
    // #5032.10 — une icône nommée : la nature enregistrée se lit dans son nom accessible.
    const saved = await screen.findByRole('button', { name: 'Enregistré comme « Hypothèse à vérifier »' })
    expect(saved).toBeDisabled()
    // Le choix se referme : rien ne reste ouvert sur une réponse déjà gardée.
    expect(screen.queryByText('Enregistrer comme…')).toBeNull()
  })

  /**
   * #1946.11 — « garder cette réponse » est l'un des trois gestes qui posent
   * une mémoire. Il émet au SUCCÈS, avec l'écran seul : ce qui est épinglé est
   * un extrait VERBATIM d'une réponse, donc du contenu — il ne sort jamais.
   */
  it('#1946.11 — une réponse réellement gardée dit l’écran, jamais l’extrait', async () => {
    mutate.mockImplementation((_input, options) => options?.onSuccess?.())
    render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    // #1962.11 — le premier clic OUVRE le choix de la nature ; c'est le second,
    // sur une nature, qui épingle. L'émission suit l'épinglage, pas l'ouverture.
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hypothèse à vérifier/ }))
    await waitFor(() => expect(memoryAdded).toHaveBeenCalledTimes(1))
    expect(memoryAdded).toHaveBeenCalledWith('/chat')
  })

  /** LE TÉMOIN : un clic dont l'épinglage n'aboutit pas n'émet rien. */
  it('#1946.11 — un épinglage qui n’aboutit pas n’émet rien', () => {
    render(<SaveReply text="Priorise Doctolib." accountId={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cette réponse/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hypothèse à vérifier/ }))
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(memoryAdded).not.toHaveBeenCalled()
  })

  it('ne s’affiche pas sur une réponse vide', () => {
    const { container } = render(<SaveReply text="   " accountId={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
