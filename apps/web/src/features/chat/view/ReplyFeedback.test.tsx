import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { replyDigest, type ReplyFeedbackAck, type ReplyFeedbackItem } from '@bellum/contracts'
import { ApiError, apiFetch } from '@/lib/api'
import type { ChatResponseContext } from './ContextDisclosure'

const demoFlag = { current: false }
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demoFlag.current }))

// #1946.22 suite — D10 : le verdict donné à Laura mesure le PRODUIT, jamais la
// personne. `trackAssistantAnswerJudged` porte l'écran ET le verdict, rien de
// plus — voir le describe dédié plus bas.
const trackAssistantAnswerJudged = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackAssistantAnswerJudged: (...args: unknown[]) => trackAssistantAnswerJudged(...args),
}))

// #1928.7 × #1928 — les réglages de réponse de la personne : « Garder » les écrit,
// et une longueur déjà réglée retire la proposition.
const replyPrefs: { data: Record<string, string> | undefined } = { data: {} }
const setReplyPreference = vi.fn()
vi.mock('@/features/memory/hooks/useReplyPreferences', () => ({
  useReplyPreferences: () => ({ data: replyPrefs.data, isLoading: false, isError: false }),
  useSetReplyPreference: () => ({ mutate: setReplyPreference, isPending: false, isSuccess: false }),
}))

const { ReplyFeedback } = await import('./ReplyFeedback')
const { resetGivenReplyFeedbackForTests } = await import('../lib/given-reply-feedback')

describe('ReplyFeedback — #1928.7 « Garder » pose la préférence de réponses courtes', () => {
  beforeEach(() => {
    replyPrefs.data = {}
  })

  async function flagTooLong() {
    serve({
      post: {
        item: item({ verdict: 'pas_pertinent', reason: 'trop_long' }),
        preferenceSuggestion: { kind: 'shorter_replies', count: 3 },
      },
    })
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Trop long' }))
  }

  it('après trois « trop long », « Garder des réponses courtes » pose replyLength = short', async () => {
    await flagTooLong()
    const keep = await screen.findByRole('button', { name: 'Garder des réponses courtes' })
    await userEvent.click(keep)
    expect(setReplyPreference).toHaveBeenCalledWith({ key: 'replyLength', value: 'short' })
  })

  it('ne propose plus la préférence quand la longueur des réponses est déjà réglée', async () => {
    replyPrefs.data = { replyLength: 'detailed' }
    await flagTooLong()
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/c’est noté/i)
    expect(status).not.toHaveTextContent(/préférence de réponse/i)
    expect(screen.queryByRole('button', { name: 'Garder des réponses courtes' })).not.toBeInTheDocument()
  })

  it('ne propose rien tant que les réglages ne sont pas lus — inconnu n’est pas « non réglé »', async () => {
    replyPrefs.data = undefined
    await flagTooLong()
    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: 'Garder des réponses courtes' })).not.toBeInTheDocument()
  })
})

const REPLY = 'Priorise EDF cette semaine : le DSI vient de changer.'
const DIGEST = replyDigest(REPLY)
const ACCOUNT = '5b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

function item(partial: Partial<ReplyFeedbackItem> = {}): ReplyFeedbackItem {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    replyDigest: DIGEST,
    verdict: 'utile',
    reason: null,
    category: null,
    accountCorrected: false,
    createdAt: '2026-09-13T08:00:00.000Z',
    ...partial,
  }
}

const apiFetchMock = vi.mocked(apiFetch)

type Call = { path: string; method?: string; body?: Record<string, unknown> }

function serve(opts: { post?: ReplyFeedbackAck | Error; mine?: ReplyFeedbackItem[] } = {}) {
  apiFetchMock.mockImplementation((async (args: Call) => {
    if (args.path === '/reply-feedback/mine') return { items: opts.mine ?? [] }
    if (args.path === '/reply-feedback' && args.method === 'POST') {
      if (opts.post instanceof Error) throw opts.post
      return (
        opts.post ?? {
          item: item({ verdict: (args.body?.['verdict'] as ReplyFeedbackItem['verdict']) ?? 'utile' }),
          preferenceSuggestion: null,
        }
      )
    }
    if (args.path.endsWith('/withdraw')) return { withdrawn: true }
    return {}
  }) as unknown as typeof apiFetch)
}

function postedBody(): Record<string, unknown> {
  const call = apiFetchMock.mock.calls.find(
    ([args]) => (args as Call).method === 'POST' && (args as Call).path === '/reply-feedback',
  )
  return ((call?.[0] as Call | undefined)?.body ?? {}) as Record<string, unknown>
}

async function open() {
  await userEvent.click(screen.getByRole('button', { name: /donner un retour/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Réglages de réponse LUS et vides pour chaque test : un test qui les rend
  // inconnus ne doit pas fuir sur le suivant.
  replyPrefs.data = {}
  demoFlag.current = false
  resetGivenReplyFeedbackForTests()
  serve()
  trackAssistantAnswerJudged.mockClear()
})

describe('ReplyFeedback — #1919.1 → .6 un seul geste ouvre les six retours', () => {
  it('le pied de réponse garde UNE icône ; elle ouvre les six choix de l’issue', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    const trigger = screen.getByRole('button', { name: /donner un retour/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Utile' })).not.toBeInTheDocument()

    await open()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    for (const label of [
      'Utile',
      'Pas pertinent',
      'Donnée fausse',
      'Déjà fait',
      'Pas maintenant',
      'Mauvaise priorité',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('ce qui se clique se tabule, et fait 44 px au doigt', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    const choice = screen.getByRole('button', { name: 'Déjà fait' })
    expect(choice.tagName).toBe('BUTTON')
    expect(choice).toHaveAttribute('type', 'button')
    expect(choice.className).toContain('pointer-coarse:min-h-11')
    expect(screen.getByRole('button', { name: /donner un retour/i }).className).toContain('pointer-coarse:min-h-11')
  })
})

describe('ReplyFeedback — ce qui part, et l’accusé (#1919.14, #1919.17)', () => {
  it('« Utile » part avec l’EMPREINTE de la réponse, jamais son texte, et l’accusé dit que c’est pris en compte', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Utile' }))

    await waitFor(() => expect(postedBody()).toEqual({ replyDigest: DIGEST, verdict: 'utile' }))
    expect(JSON.stringify(postedBody())).not.toContain('EDF')
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/c’est noté/i)
    expect(status).toHaveTextContent(/pour toi seulement/i)
  })

  it('#1919.14 — relie le compte, le contact et l’action que la réponse PORTAIT', async () => {
    const context = {
      pending_actions: [
        {
          action: 'prepare_message',
          contact_id: '6b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
          account_id: ACCOUNT,
          channel: 'email',
        },
      ],
    } as unknown as ChatResponseContext
    render(<ReplyFeedback text={REPLY} accountId={null} context={context} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Déjà fait' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({
        replyDigest: DIGEST,
        verdict: 'deja_fait',
        accountId: ACCOUNT,
        contactId: '6b7d0c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
        actionKind: 'prepare_message',
      }),
    )
  })

  it('« Pas maintenant » et « Mauvaise priorité » partent en un clic', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Mauvaise priorité' }))
    await waitFor(() => expect(postedBody()).toEqual({ replyDigest: DIGEST, verdict: 'mauvaise_priorite' }))
  })
})

describe('ReplyFeedback — #1919.8 → .13 les motifs d’un « pas pertinent »', () => {
  it('propose les six motifs de l’issue (et « trop long »), et envoie celui qu’on choisit', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    for (const label of [
      'Mauvais compte',
      'Mauvais contact',
      'Mauvais timing',
      'Hors positionnement',
      'Déjà traité',
      'Autre',
      'Trop long',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: 'Mauvais timing' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({ replyDigest: DIGEST, verdict: 'pas_pertinent', reason: 'mauvais_timing' }),
    )
    // #1919.16 — dit à la personne que ce refus ne devient pas une règle générale.
    expect(await screen.findByRole('status')).toHaveTextContent(/n’en tire pas de règle générale/i)
  })

  // #2444.1 — RÉFUTÉ en prod (sha 4a4e9e07d) : 6 verdicts + 7 sous-motifs = 13
  // catégories, sous la demande « au moins 15 ». Cinq motifs élargis (#2444.1
  // suite) : le test casse si l'un des cinq manque à l'écran ou n'envoie pas.
  it('#2444.1 — cinq motifs élargis rendent « Pas pertinent » à 12 motifs (18 avec les verdicts), et s’envoient', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    for (const label of [
      'Doublon',
      'Source douteuse',
      'Contact parti',
      'Concurrent déjà en place',
      'Budget insuffisant',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('button', { name: 'Source douteuse' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({ replyDigest: DIGEST, verdict: 'pas_pertinent', reason: 'source_douteuse' }),
    )
  })

  it('« Autre » ouvre une précision FACULTATIVE', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Autre' }))
    await userEvent.type(screen.getByRole('textbox', { name: /dis-m’en plus/i }), 'On ne fait pas de régie ici.')
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({
        replyDigest: DIGEST,
        verdict: 'pas_pertinent',
        reason: 'autre',
        note: 'On ne fait pas de régie ici.',
      }),
    )
  })

  // #2444.1 — un axe de précision optionnel, indépendant du verdict/motif.
  it('#2444.1 — « Préciser » propose au moins 15 catégories, aucune par défaut', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Autre' }))
    const category = screen.getByRole('combobox', { name: /préciser/i })
    expect(category).toHaveTextContent('Sans précision')
    await userEvent.click(category)
    expect(await screen.findAllByRole('option')).toHaveLength(17) // 16 catégories + « sans précision »
    await userEvent.click(screen.getByRole('option', { name: 'Bug interface' }))
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({
        replyDigest: DIGEST,
        verdict: 'pas_pertinent',
        reason: 'autre',
        category: 'bug_interface',
      }),
    )
  })
})

describe('ReplyFeedback — #1919.7 « Donnée fausse » demande la correction et son périmètre', () => {
  it('rien ne part tant que la personne n’a pas dit ce qui est faux ; sans compte, pas de dossier à corriger', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    const review = screen.getByRole('button', { name: 'Vérifier' })
    expect(review).toBeDisabled()
    expect(screen.queryByRole('radio', { name: /dossier de ce compte/i })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.type(screen.getByRole('textbox', { name: /la bonne information/i }), 'Claire Martin')
    await userEvent.click(review)
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        correction: { field: 'Le DSI', value: 'Claire Martin', scope: 'reply' },
      }),
    )
  })

  it('#2444.5 — propose une prévisualisation avec la portée avant l’envoi, rien ne part avant confirmation', async () => {
    render(<ReplyFeedback text={REPLY} accountId={ACCOUNT} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.type(screen.getByRole('textbox', { name: /la bonne information/i }), 'Claire Martin')
    await userEvent.click(screen.getByRole('radio', { name: /dossier de ce compte/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    // La preview montre le champ, la valeur et la portée — rien n'est encore parti.
    expect(screen.getByText('Le DSI')).toBeInTheDocument()
    expect(screen.getByText('Claire Martin')).toBeInTheDocument()
    expect(screen.getByText(/dossier de ce compte/i)).toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', path: '/reply-feedback' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        accountId: ACCOUNT,
        correction: { field: 'Le DSI', value: 'Claire Martin', scope: 'account' },
      }),
    )
  })

  it('avec un compte, la correction peut aller au DOSSIER — et l’accusé le dit', async () => {
    serve({ post: { item: item({ verdict: 'donnee_fausse', accountCorrected: true }), preferenceSuggestion: null } })
    render(<ReplyFeedback text={REPLY} accountId={ACCOUNT} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.click(screen.getByRole('radio', { name: /dossier de ce compte/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() =>
      expect(postedBody()).toEqual({
        replyDigest: DIGEST,
        verdict: 'donnee_fausse',
        accountId: ACCOUNT,
        correction: { field: 'Le DSI', scope: 'account' },
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/dossier du compte/i)
  })

  it('#2444.6 — après la correction, « Réessayer avec la correction » relance le même geste que le menu Réessayer', async () => {
    serve({ post: { item: item({ verdict: 'donnee_fausse', accountCorrected: false }), preferenceSuggestion: null } })
    const onRetryWithCorrection = vi.fn()
    render(
      <ReplyFeedback text={REPLY} accountId={null} context={undefined} onRetryWithCorrection={onRetryWithCorrection} />,
    )
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    const retry = await screen.findByRole('button', { name: 'Réessayer avec la correction' })
    expect(screen.getByText(/coût non annoncé/i)).toBeInTheDocument()
    await userEvent.click(retry)
    expect(onRetryWithCorrection).toHaveBeenCalledTimes(1)
  })

  it('#2444.6 — sans geste de réessai possible (fil vierge), aucun bouton « Réessayer avec la correction »', async () => {
    serve({ post: { item: item({ verdict: 'donnee_fausse', accountCorrected: false }), preferenceSuggestion: null } })
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: 'Réessayer avec la correction' })).not.toBeInTheDocument()
  })

  it('sait dire NON — sans le droit de corriger le dossier, on le dit au lieu de prétendre', async () => {
    serve({ post: new ApiError('Rôle insuffisant pour cette action', 403) })
    render(<ReplyFeedback text={REPLY} accountId={ACCOUNT} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.click(screen.getByRole('radio', { name: /dossier de ce compte/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/pas le droit/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('une panne se dit — jamais un accusé sur un retour perdu', async () => {
    serve({ post: new Error('network') })
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Utile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/n’a pas pu être enregistré/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('ReplyFeedback — #1928.7 et la mémoire visible', () => {
  it('#1928.7 — après trois « trop long », Laura propose une préférence de réponse', async () => {
    serve({
      post: {
        item: item({ verdict: 'pas_pertinent', reason: 'trop_long' }),
        preferenceSuggestion: { kind: 'shorter_replies', count: 3 },
      },
    })
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Trop long' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/3 fois/)
    expect(status).toHaveTextContent(/préférence de réponse/i)
  })

  it('#1919.14 / #1919.17 — un retour déjà donné se revoit sous la réponse RELUE, et se retire', async () => {
    serve({ mine: [item({ verdict: 'pas_pertinent', reason: 'mauvais_timing' })] })
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)

    const trigger = await screen.findByRole('button', { name: /ton retour sur cette réponse : pas pertinent/i })
    expect(within(trigger).getByText('Pas pertinent')).toBeInTheDocument()

    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('button', { name: /retirer mon retour/i }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/reply-feedback/a1b2c3d4-0000-4000-8000-000000000001/withdraw',
          method: 'POST',
        }),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/retiré/i)
    expect(screen.getByRole('button', { name: /donner un retour/i })).toBeInTheDocument()
  })

  it('une relecture ratée n’affiche rien — ni « aucun retour », ni une panne sous chaque réponse', async () => {
    apiFetchMock.mockRejectedValue(new Error('down'))
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /donner un retour/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ReplyFeedback — démonstration', () => {
  it('aucun appel réseau, et l’accusé dit que le retour n’est pas gardé', async () => {
    demoFlag.current = true
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Utile' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/n’est pas gardé/i)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})

describe('ReplyFeedback — D10 (14/09/2026) : le verdict donné à Laura est mesuré', () => {
  it('« Utile » émet trackAssistantAnswerJudged(écran, verdict) — rien d’autre', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Utile' }))
    await waitFor(() => expect(trackAssistantAnswerJudged).toHaveBeenCalledTimes(1))
    expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', 'utile')
    // #1946.22 — aucun contenu, aucun identifiant de personne : seuls deux
    // arguments existent, et ni le texte de la réponse ni l'identifiant du
    // compte/contact n'y figurent.
    expect(trackAssistantAnswerJudged.mock.calls[0]).toHaveLength(2)
    expect(JSON.stringify(trackAssistantAnswerJudged.mock.calls[0])).not.toContain('EDF')
    expect(JSON.stringify(trackAssistantAnswerJudged.mock.calls[0])).not.toContain(ACCOUNT)
  })

  it('« Pas pertinent » sans motif émet le verdict « pas_pertinent », un seul appel', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer sans motif' }))
    await waitFor(() => expect(trackAssistantAnswerJudged).toHaveBeenCalledTimes(1))
    expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', 'pas_pertinent')
  })

  it('« Pas pertinent » AVEC motif émet toujours le verdict « pas_pertinent » — pas le motif', async () => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Pas pertinent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mauvais timing' }))
    await waitFor(() => expect(trackAssistantAnswerJudged).toHaveBeenCalledTimes(1))
    expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', 'pas_pertinent')
  })

  it('« Donnée fausse » émet le verdict, jamais le champ ni la correction saisie', async () => {
    render(<ReplyFeedback text={REPLY} accountId={ACCOUNT} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Donnée fausse' }))
    await userEvent.type(screen.getByRole('textbox', { name: /qu’est-ce qui est faux/i }), 'Le DSI')
    await userEvent.type(screen.getByRole('textbox', { name: /la bonne information/i }), 'Claire Martin')
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }))
    await waitFor(() => expect(trackAssistantAnswerJudged).toHaveBeenCalledTimes(1))
    expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', 'donnee_fausse')
    expect(JSON.stringify(trackAssistantAnswerJudged.mock.calls[0])).not.toContain('Claire Martin')
  })

  it.each([
    ['Déjà fait', 'deja_fait'],
    ['Pas maintenant', 'pas_maintenant'],
    ['Mauvaise priorité', 'mauvaise_priorite'],
  ] as const)('« %s » émet le verdict « %s »', async (label, verdict) => {
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(trackAssistantAnswerJudged).toHaveBeenCalledTimes(1))
    expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', verdict)
  })

  it('une panne réseau n’empêche pas la mesure — le verdict a bien été DONNÉ', async () => {
    serve({ post: new Error('network') })
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Utile' }))
    await screen.findByRole('alert')
    expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', 'utile')
  })

  it('même en démonstration, la mesure ANONYME part — sans appel réseau du retour lui-même', async () => {
    demoFlag.current = true
    render(<ReplyFeedback text={REPLY} accountId={null} context={undefined} />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Utile' }))
    await waitFor(() => expect(trackAssistantAnswerJudged).toHaveBeenCalledWith('/chat', 'utile'))
    expect(apiFetchMock).not.toHaveBeenCalled()
  })
})
