import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cardAllowedGestures,
  copilotCardStateSchema,
  type CopilotCardState,
  type OutreachMessage,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useOutreachMessage } from '@/features/outreach/hooks/useOutreachMessages'
import type { CopilotCardWire } from '../api/copilotCardsApi'
import { CopilotCards } from './CopilotCards'

// #2366.2 — la carte ne garde jamais une seconde version figée : elle relit le
// message canonique par identifiant (hook mocké ici, comme les autres écrans
// mockent leurs hooks de lecture plutôt que le client HTTP).
vi.mock('@/features/outreach/hooks/useOutreachMessages', () => ({
  useOutreachMessage: vi.fn(() => ({ data: undefined, isLoading: false })),
}))

// #1952.24 — même mock que `DayClosureCard.test.tsx` : le composant n'utilise
// que `Link`, jamais un routeur complet.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={to.replace(/\$(\w+)/, (_, key: string) => params?.[key] ?? '')}>{children}</a>
  ),
}))

// #2896 / #2449.35-.36 — le niveau d'action RÉGLÉ (une lecture partagée) ;
// mocké comme `useOutreachMessage` : la carte lit un hook, pas le client HTTP.
const actionLevelData = vi.hoisted(() => ({ current: undefined as { level: string | null } | undefined }))
vi.mock('@/features/actions/hooks/useActionLevel', () => ({
  useActionLevel: () => ({ data: actionLevelData.current }),
}))

// #1946.5/.6/.7/.8 — le traceur produit mesure le GESTE (nom d'action + étape),
// jamais la cible de la carte — voir le describe dédié plus bas.
const trackPreparedActionStage = vi.fn()
// #1946.16 — le traceur produit mesure le DEGRÉ d'une modification, jamais son
// texte — voir le describe dédié plus bas.
const trackDraftReused = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackPreparedActionStage: (...args: unknown[]) => trackPreparedActionStage(...args),
  trackDraftReused: (...args: unknown[]) => trackDraftReused(...args),
}))

/**
 * #1998 — LES CARTES D'ACTION OS, À L'ÉCRAN.
 *
 * L'API les calculait, les gouvernait, les persistait et les renvoyait
 * (`data.context.cards`) ; aucun fichier de `apps/web/src` ne les lisait. Laura
 * décrivait donc en PROSE le contenu exact d'une carte, sans un bouton.
 *
 * Ce que ces tests tiennent, et qui est le point du lot :
 *  - la prévisualisation vient du CONTRAT SERVEUR (`card.preview`), pas d'un
 *    sous-ensemble reconstruit au cas par cas ;
 *  - les boutons sont EXACTEMENT `card.allowedGestures` — l'écran ne déduit rien,
 *    donc il ne peut pas rouvrir un geste que la doctrine a fermé ;
 *  - l'état d'après un geste est celui que le SERVEUR renvoie.
 */

const PREVIEW = {
  whatWillHappen: 'Créer un brouillon pour Claire Meunier',
  targetObject: 'Claire Meunier — Directrice SI',
  destination: 'ta messagerie',
  content: 'Objet : suite à votre publication sur la refonte',
  dataUsed: 'Offre d’emploi publiée le 2 septembre',
  costCredits: 2,
  connectionUsed: 'ta messagerie',
  whatWillNotHappen: 'aucun envoi automatique',
}

/** Les huit champs d'après-coup de #1931 : `null` là où le run n'est pas allé, jamais un remplissage. */
function result(overrides: Partial<NonNullable<CopilotCardWire['result']>> = {}) {
  return {
    outcome: 'Le brouillon a été déposé. Aucun message envoyé.',
    occurredAt: null,
    actorName: null,
    targetObject: 'Claire Meunier',
    destination: null,
    connectionUsed: null,
    externalRef: null,
    creditsSpent: null,
    nextStep: null,
    ...overrides,
  }
}

function card(overrides: Partial<CopilotCardWire> = {}): CopilotCardWire {
  return {
    id: 'run-1',
    action: null,
    state: 'prepared',
    allowedGestures: ['confirm', 'reject', 'snooze'],
    preview: PREVIEW,
    result: null,
    snoozedUntil: null,
    expiresAt: null,
    turnId: 'turn-1',
    proposalIndex: 0,
    primary: true,
    accountId: null,
    ...overrides,
  }
}

describe('CopilotCards', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('rend les lignes de la PRÉVISUALISATION SERVEUR — sauf le coût, qui ne se lit plus (#4463)', () => {
    render(<CopilotCards cards={[card()]} />)

    expect(screen.getByText('Créer un brouillon pour Claire Meunier')).toBeInTheDocument()
    const preview = screen.getByRole('region', { name: 'Ce que ça va faire' })
    expect(preview).toHaveTextContent('Claire Meunier — Directrice SI')
    expect(preview).toHaveTextContent('ta messagerie')
    expect(preview).toHaveTextContent('Objet : suite à votre publication sur la refonte')
    expect(preview).toHaveTextContent('Offre d’emploi publiée le 2 septembre')
    expect(preview).not.toHaveTextContent(/crédit|Coût/i)
    expect(preview).toHaveTextContent('aucun envoi automatique')
  })

  it('G.3 — un brouillon de messagerie nomme l’outil BRANCHÉ (Gmail), pas « votre messagerie »', () => {
    const action = { action: 'prepare_mail_draft' as const, to: 'c@acme.example', subject: 'Suite', body: 'Bonjour' }
    const generic = { ...PREVIEW, connectionUsed: 'votre messagerie' }
    const { unmount } = render(<CopilotCards cards={[card({ action, preview: generic })]} mailboxName="Gmail" />)
    const region = screen.getByRole('region', { name: 'Ce que ça va faire' })
    expect(region).toHaveTextContent('Gmail')
    expect(region).not.toHaveTextContent('votre messagerie')
    unmount()
    // …et sait dire non : sans nom sûr, ou pour une autre carte, le serveur garde la main.
    render(<CopilotCards cards={[card({ action, preview: generic })]} mailboxName={null} />)
    expect(screen.getByRole('region', { name: 'Ce que ça va faire' })).toHaveTextContent('votre messagerie')
  })

  /**
   * #4463 (crédits implicites, Louis 22/10/2026) — plus AUCUN coût côté client : ni l'estimation avant,
   * ni le réel après, ni « annoncé vs débité » (renverse #1952.23). Le serveur porte toujours
   * `costCredits` / `creditsSpent` ; l'écran ne les lit plus, quelle que soit leur valeur
   * (mesurée, nulle, inconnue) — et il ne s'invente pas un « 0 » ou un « non estimé » à la place.
   */
  it.each([
    ['coût estimé', { preview: { ...PREVIEW, costCredits: 2 } }],
    ['coût non mesuré', { preview: { ...PREVIEW, costCredits: null } }],
    ['coût nul', { preview: { ...PREVIEW, costCredits: 0 } }],
  ])('%s : la prévisualisation ne dit aucun crédit, aucun coût', (_label, overrides) => {
    render(<CopilotCards cards={[card(overrides)]} />)
    const preview = screen.getByRole('region', { name: 'Ce que ça va faire' })
    expect(preview).not.toHaveTextContent(/crédit|Coût|estimé/i)
    expect(document.body.textContent).not.toMatch(/\b0 crédit/)
  })

  it.each([
    ['exécutée, débit réel 1', card({ state: 'executed', result: result({ creditsSpent: 1 }) })],
    ['exécutée, débit réel nul', card({ state: 'executed', result: result({ creditsSpent: 0 }) })],
    ['issue inconnue, réel inconnu', card({ state: 'unknown_outcome', result: result({ creditsSpent: null }) })],
    [
      'exécutée, estimation impossible',
      card({ state: 'executed', preview: { ...PREVIEW, costCredits: null }, result: result({ creditsSpent: 3 }) }),
    ],
  ])('après coup (%s) : ni « annoncé », ni « débité », ni crédit', (_label, executed) => {
    render(<CopilotCards cards={[executed]} />)
    expect(document.body.textContent).not.toMatch(/crédit|Coût annoncé|Coût estimé|réellement débité|non estimé/i)
  })

  it('les boutons sont EXACTEMENT les gestes permis par le serveur', () => {
    render(<CopilotCards cards={[card({ allowedGestures: ['confirm', 'reject', 'snooze'] })]} />)

    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reporter' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
  })

  it('un résultat INCONNU n’offre pas « Réessayer » — un timeout n’est pas un échec', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'unknown_outcome',
            allowedGestures: [],
            result: result({ outcome: 'Pas de réponse du service' }),
          }),
        ]}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expect(screen.getByText('Résultat inconnu')).toBeInTheDocument()
    expect(screen.getByText(/rien n’est rejoué automatiquement/i)).toBeInTheDocument()
  })

  it('une carte PARTIE n’offre pas d’annulation — l’annulation serait plus étroite que l’écriture', () => {
    render(<CopilotCards cards={[card({ state: 'running', allowedGestures: [] })]} />)

    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
    expect(screen.getByText('En cours')).toBeInTheDocument()
  })

  it('un échec offre « Réessayer », et lui seul', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'failed',
            allowedGestures: ['retry'],
            result: result({ outcome: 'Le service n’a pas répondu' }),
          }),
        ]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  it('valider appelle la route et prend l’état que le SERVEUR renvoie', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      card: card({
        state: 'executed',
        allowedGestures: [],
        result: result(),
      }),
    })
    render(<CopilotCards cards={[card()]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => expect(screen.getByText('Exécutée')).toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledWith({ path: '/action-os/cards/run-1/confirm', method: 'POST', body: {} })
    expect(screen.getByText('Le brouillon a été déposé. Aucun message envoyé.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  it('un geste en échec dit pourquoi et LAISSE la carte dans son état', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Cette carte a expiré.'))
    render(<CopilotCards cards={[card()]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Cette carte a expiré.'))
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
    expect(screen.getByText('Préparée')).toBeInTheDocument()
  })

  it('une carte sans prévisualisation ne montre aucun tableau — rien n’est inventé', () => {
    render(
      <CopilotCards cards={[card({ state: 'suggested', preview: null, allowedGestures: ['reject', 'snooze'] })]} />,
    )

    expect(screen.queryByRole('region', { name: 'Ce que ça va faire' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  it('aucune carte : aucun rendu', () => {
    const { container } = render(<CopilotCards cards={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

/**
 * #1952.10 — LE LIEN « OUVRIR », TEL QUE #1930 LE PROMET.
 *
 * `result.externalRef` porte l'identifiant OU le lien (#1930's CTA example :
 * « Ouvrir le brouillon ») — `dispatchMailDraft` y écrit `webUrl ?? draftId`
 * (`action-router.service.ts`). Avant ce lot, la carte l'affichait comme une
 * ligne de texte inerte dans le tableau « Ce qui s'est passé » : une adresse
 * copiable, jamais un geste. La preuve de production du lot exige un LIEN.
 */
describe('CopilotCards — le lien « Ouvrir » d’un résultat', () => {
  it('une référence en URL affiche un lien « Ouvrir », pas seulement son adresse', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'executed',
            allowedGestures: [],
            result: result({ externalRef: 'https://mail.google.com/mail/u/0/#drafts/abc123' }),
          }),
        ]}
      />,
    )

    const open = screen.getByRole('link', { name: 'Ouvrir' })
    expect(open).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#drafts/abc123')
    expect(open).toHaveAttribute('target', '_blank')
    // La ligne de texte brute ne se répète pas à côté du lien (loi 4).
    expect(screen.queryByText('https://mail.google.com/mail/u/0/#drafts/abc123')).not.toBeInTheDocument()
  })

  it('une référence qui n’est pas une URL reste une ligne de texte, jamais un lien', () => {
    render(
      <CopilotCards
        cards={[card({ state: 'executed', allowedGestures: [], result: result({ externalRef: 'routine-key-42' }) })]}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Ouvrir' })).not.toBeInTheDocument()
    expect(screen.getByText('routine-key-42')).toBeInTheDocument()
  })

  it('sans référence, ni ligne ni lien — rien n’est inventé', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(screen.queryByRole('link', { name: 'Ouvrir' })).not.toBeInTheDocument()
  })
})

/**
 * #1952.24 — LE BOUTON « VOIR LE DÉTAIL » D'UN TRAVAIL LONG SUIVI.
 *
 * `result.externalRef` n'est pas réutilisable pour l'analyse de compte suivie :
 * il porte le jobId (lu par le serveur pour interroger le lanceur), jamais une
 * URL. `accountId` est le champ dédié, et le lien ne s'affiche que sur une
 * carte de SUIVI (`action === null`, créée par `trackAnalysisLaunch`) — une
 * carte d'action ordinaire porte déjà ses propres CTA.
 */
describe('CopilotCards — le bouton « voir le détail » de #1952.24', () => {
  it('une carte de suivi avec un compte affiche un lien vers sa page', () => {
    render(<CopilotCards cards={[card({ action: null, accountId: 'acc-42', state: 'executed' })]} />)

    const link = screen.getByRole('link', { name: 'Voir le détail' })
    expect(link).toHaveAttribute('href', '/accounts/acc-42')
  })

  it('sans compte, rien n’est inventé', () => {
    render(<CopilotCards cards={[card({ action: null, accountId: null, state: 'executed' })]} />)
    expect(screen.queryByRole('link', { name: 'Voir le détail' })).not.toBeInTheDocument()
  })

  it('une carte d’action ordinaire garde ses propres CTA, jamais ce lien', () => {
    render(
      <CopilotCards
        cards={[
          card({
            action: { action: 'enrich_contact', contact_id: 'c1', contact_name: 'Claire', organization_name: 'ACME' },
            accountId: 'acc-42',
            state: 'executed',
          }),
        ]}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Voir le détail' })).not.toBeInTheDocument()
  })
})

/**
 * #1943.17 — « CHAMP SUPPORT SI NÉCESSAIRE ».
 *
 * `result.supportSuggested` (posé par `cardResultOf` seulement sur un
 * `unknown_outcome`, l'échec que la personne ne peut pas diagnostiquer seule)
 * ouvre le SEUL dialogue support du produit (`ContactDialog`, #1960.20) —
 * jamais une adresse recopiée ici, qui divergerait de l'espace en marque
 * blanche.
 */
describe('CopilotCards — le bouton support de #1943.17', () => {
  it('un résultat inconnu qui suggère le support affiche le bouton, et l’ouvre', async () => {
    const user = userEvent.setup()
    render(
      <CopilotCards
        cards={[
          card({
            state: 'unknown_outcome',
            allowedGestures: [],
            result: result({ outcome: 'Pas de réponse du service', supportSuggested: true }),
          }),
        ]}
      />,
    )

    const supportButton = screen.getByRole('button', { name: 'Contacter le support' })
    await user.click(supportButton)
    expect(await screen.findByText('support@bellum-it.com')).toBeInTheDocument()
  })

  it('sans suggestion, aucun bouton support — un échec expliqué n’en a pas besoin', () => {
    render(
      <CopilotCards
        cards={[card({ state: 'failed', allowedGestures: [], result: result({ supportSuggested: false }) })]}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Contacter le support' })).not.toBeInTheDocument()
  })

  it('champ absent (résultat écrit avant #1943.17) : rien n’est deviné, aucun bouton', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(screen.queryByRole('button', { name: 'Contacter le support' })).not.toBeInTheDocument()
  })
})

/**
 * #1943.13 / #1943.14 — « CE QUI N'A PAS ÉTÉ FAIT » / « CE QUI A MALGRÉ TOUT
 * RÉUSSI », sur un résultat `partial` (#1943.7).
 *
 * `cardResultOf` ne pose `result.succeeded`/`result.notDone` que sur ce run-là
 * (voir `copilot-card-partial-summary.spec.ts`) ; ce test tient l'AUTRE bout de
 * la chaîne — que l'écran les rende, chacun sous son propre libellé.
 */
describe('CopilotCards — succès partiel, ce qui a marché ET ce qui n’a pas marché (#1943.13 / #1943.14)', () => {
  it('affiche « ce qui a malgré tout réussi » ET « ce qui n’a pas été fait », sous deux lignes distinctes', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'partial',
            allowedGestures: [],
            result: result({
              outcome: '1/2 étapes réussies.',
              succeeded: "Retrouver les coordonnées professionnelles de l'interlocuteur identifié",
              notDone: 'Crédits insuffisants.',
            }),
          }),
        ]}
      />,
    )
    expect(screen.getByText('Ce qui a malgré tout réussi')).toBeInTheDocument()
    expect(
      screen.getByText("Retrouver les coordonnées professionnelles de l'interlocuteur identifié"),
    ).toBeInTheDocument()
    expect(screen.getByText('Ce qui n’a pas été fait')).toBeInTheDocument()
    expect(screen.getByText('Crédits insuffisants.')).toBeInTheDocument()
  })

  it('un résultat SANS ces deux champs (un `done`/`failed` ordinaire) ne rend ni l’une ni l’autre ligne', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(screen.queryByText('Ce qui a malgré tout réussi')).not.toBeInTheDocument()
    expect(screen.queryByText('Ce qui n’a pas été fait')).not.toBeInTheDocument()
  })
})

/**
 * #1952.32 (#2844) — « CE QUI DOIT ÊTRE VÉRIFIÉ », le champ RÉSULTAT que
 * `CardResult` n'avait pour aucun des sept travaux longs de #1952. Même motif
 * que `succeeded`/`notDone` juste au-dessus : une ligne SEULEMENT quand le
 * serveur l'a posée, jamais devinée.
 */
describe('CopilotCards — « ce qui doit être vérifié » (#1952.32)', () => {
  it('affiche la ligne quand le serveur nomme des contacts à vérifier', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'executed',
            allowedGestures: [],
            result: result({ toVerify: ['Julie Martin — e-mail trouvé, non confirmé'] }),
          }),
        ]}
      />,
    )
    expect(screen.getByText('Ce qui doit être vérifié')).toBeInTheDocument()
    expect(screen.getByText('Julie Martin — e-mail trouvé, non confirmé')).toBeInTheDocument()
  })

  it('champ absent : aucune ligne — jamais « rien à vérifier » deviné', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(screen.queryByText('Ce qui doit être vérifié')).not.toBeInTheDocument()
  })
})

/**
 * #1952.10 — QUAND, EN CLAIR. `result.occurredAt` existait au contrat (#1931's
 * "après chaque action, afficher" : résultat, DATE, acteur…) mais n'était rendu
 * NULLE PART : le second onglet du lot 4 ne pouvait jamais lire « à quelle
 * heure » une carte avait déjà été exécutée.
 */
describe('CopilotCards — la date d’après-coup', () => {
  it('un résultat DATÉ affiche quand il a eu lieu', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'executed',
            allowedGestures: [],
            result: result({ occurredAt: '2026-09-15T14:32:00.000Z' }),
          }),
        ]}
      />,
    )
    const resultRegion = screen.getByRole('region', { name: 'Ce qui s’est passé' })
    expect(resultRegion).toHaveTextContent('15')
  })

  it('sans date connue, aucune ligne — jamais une date inventée', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(screen.getByRole('region', { name: 'Ce qui s’est passé' })).not.toHaveTextContent('Quand')
  })
})

/**
 * #2105.39 — L'OUTIL UTILISÉ SURVIT À L'EXÉCUTION.
 *
 * `cards.preview.connection` nommait déjà la capacité avant le clic ; le
 * résultat après-coup n'avait pas la même ligne, alors que le contrat serveur
 * la porte maintenant (`CardResult.connectionUsed`, recopié depuis la
 * prévisualisation par `cardResultOf`).
 */
describe('CopilotCards — l’outil utilisé, après exécution (#2105.39)', () => {
  it('un résultat avec un outil connu affiche « Outil utilisé »', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'executed',
            allowedGestures: [],
            result: result({ connectionUsed: 'ta messagerie' }),
          }),
        ]}
      />,
    )
    const resultRegion = screen.getByRole('region', { name: 'Ce qui s’est passé' })
    expect(resultRegion).toHaveTextContent('Outil utilisé')
    expect(resultRegion).toHaveTextContent('ta messagerie')
  })

  it('sans outil connecté, aucune ligne — jamais un outil inventé', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(screen.getByRole('region', { name: 'Ce qui s’est passé' })).not.toHaveTextContent('Outil utilisé')
  })
})

/**
 * #2123.36 / #2123.42 / #2123.43 / #2123.44 / #2123.45 — CHAQUE état de carte
 * s'affirme à l'écran, pas seulement `prepared` et `running` (tests ci-dessus).
 * `suggested`, `partial`, `failed`, `snoozed` et `rejected` étaient déclarés au
 * contrat, câblés (`t('cards.state.\${state}')` ci-dessus) et traduits — mais
 * rien n'affirmait le libellé RENDU : on pouvait le casser sans faire rougir
 * la suite.
 *
 * Une garde plutôt que neuf tests qui se ressemblent : elle LIT l'énumération
 * du contrat (`copilotCardStateSchema.options`, 13 valeurs aujourd'hui) — un
 * état ajouté sans son libellé ici fait tomber le premier test ci-dessous, pas
 * juste passer inaperçu. Elle sait dire NON (vérifié en cassant `partial` →
 * `'Partielle-CASSÉE'` pendant l'écriture : le test dédié à `partial` rougit,
 * et lui seul) ; elle ne porte qu'une assertion par état, donc elle n'attrape
 * rien d'autre qu'un libellé absent ou faux — pas les boutons, pas la
 * prévisualisation, déjà couverts par les tests au-dessus.
 */
// ⚠️ Deux libellés ont changé à la fusion du lot #2123 (`prepared` : « À valider »
// → « Préparée » ; `executed` : « Faite » → « Exécutée »). Cette table est écrite
// À LA MAIN, exprès — elle vaut PARCE QU'elle ne lit pas la même source que le
// composant —, donc elle ne suit pas un renommage toute seule : c'est elle qui
// l'a signalé, et c'est son travail.
const STATE_LABELS: Record<CopilotCardState, string> = {
  suggested: 'Suggérée',
  prepared: 'Préparée',
  awaiting_review: 'En attente de validation',
  running: 'En cours',
  executed: 'Exécutée',
  partial: 'Partielle',
  failed: 'Échouée',
  snoozed: 'Reportée',
  rejected: 'Refusée',
  expired: 'Expirée',
  superseded: 'Obsolète',
  unknown_outcome: 'Résultat inconnu',
  blocked: 'Rien n’est parti',
}

describe('CopilotCards — chaque état du contrat se nomme à l’écran', () => {
  it('couvre TOUS les états du contrat — corpus non vide, aucun oublié', () => {
    expect(copilotCardStateSchema.options.length).toBeGreaterThan(0)
    expect(Object.keys(STATE_LABELS).sort()).toEqual([...copilotCardStateSchema.options].sort())
  })

  it.each(copilotCardStateSchema.options)('« %s » affiche son libellé traduit', state => {
    render(<CopilotCards cards={[card({ state, allowedGestures: cardAllowedGestures(state) })]} />)
    expect(screen.getByText(STATE_LABELS[state])).toBeInTheDocument()
  })
})

/**
 * #1930.11 — LE BOUTON « MODIFIER », ET CE QU'IL OUVRE.
 *
 * Le serveur savait modifier depuis #1931 L2 ; l'écran EXCLUAIT le geste faute
 * de surface d'édition. Ces tests tiennent les trois choses qui font le point :
 * le bouton n'apparaît que quand le geste est permis ET qu'il y a quelque chose
 * à réécrire, le formulaire montre les valeurs COURANTES, et l'enregistrement
 * appelle la vraie route avec le patch — jamais une carte reconstruite ici.
 */
describe('CopilotCards — modifier avant de valider (#1930.11)', () => {
  const DRAFT_ACTION = {
    action: 'prepare_mail_draft' as const,
    to: 'claire@acme.example',
    subject: 'Suite à votre publication',
    body: 'Bonjour Claire,',
  }

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('offre « Modifier » quand le serveur l’autorise et que la proposition a des champs à réécrire', () => {
    render(
      <CopilotCards
        cards={[card({ action: DRAFT_ACTION, allowedGestures: ['confirm', 'reject', 'snooze', 'modify'] })]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
  })

  it('ne l’offre PAS quand la proposition n’a rien de réécrivable — un bouton qui ouvrirait un formulaire vide n’existe pas', () => {
    render(
      <CopilotCards
        cards={[
          card({
            action: { action: 'enrich_contact', contact_id: 'c1', contact_name: 'Claire', organization_name: 'ACME' },
            allowedGestures: ['confirm', 'reject', 'snooze', 'modify'],
          }),
        ]}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
    // Témoin : les autres gestes, eux, sont bien là — la carte n'est pas muette.
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })

  it('ne l’offre PAS quand le serveur ne permet pas le geste — l’écran ne déduit rien de l’état', () => {
    render(<CopilotCards cards={[card({ action: DRAFT_ACTION, allowedGestures: ['confirm', 'reject'] })]} />)
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument()
  })

  it('ouvre un formulaire portant les valeurs COURANTES, et masque les gestes tant qu’on écrit', async () => {
    const user = userEvent.setup()
    render(
      <CopilotCards
        cards={[card({ action: DRAFT_ACTION, allowedGestures: ['confirm', 'reject', 'snooze', 'modify'] })]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(screen.getByLabelText('Objet')).toHaveValue('Suite à votre publication')
    expect(screen.getByLabelText('Message')).toHaveValue('Bonjour Claire,')
    // Valider pendant l'édition validerait l'ANCIENNE version.
    expect(screen.queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument()
  })

  it('enregistre par la vraie route, avec le patch, et prend la carte que le SERVEUR renvoie', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({
      card: card({
        action: { ...DRAFT_ACTION, subject: 'Objet corrigé' },
        state: 'prepared',
        allowedGestures: ['confirm', 'reject', 'snooze', 'modify'],
        preview: { ...PREVIEW, whatWillHappen: 'Créer un brouillon corrigé pour Claire Meunier' },
      }),
    })
    render(
      <CopilotCards
        cards={[card({ action: DRAFT_ACTION, allowedGestures: ['confirm', 'reject', 'snooze', 'modify'] })]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.clear(screen.getByLabelText('Objet'))
    await user.type(screen.getByLabelText('Objet'), 'Objet corrigé')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/action-os/cards/run-1/modify',
          method: 'POST',
          body: { patch: expect.objectContaining({ subject: 'Objet corrigé' }) },
        }),
      )
    })
    // La phrase affichée est celle que le serveur a RECALCULÉE, pas une phrase
    // recomposée à partir du patch.
    expect(await screen.findByText('Créer un brouillon corrigé pour Claire Meunier')).toBeInTheDocument()
  })

  it('garde le formulaire OUVERT quand l’enregistrement échoue — on ne perd pas ce qui vient d’être écrit', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockRejectedValue(new Error('Modification invalide.'))
    render(
      <CopilotCards
        cards={[card({ action: DRAFT_ACTION, allowedGestures: ['confirm', 'reject', 'snooze', 'modify'] })]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Modification invalide.')
    expect(screen.getByLabelText('Objet')).toBeInTheDocument()
  })
})

describe('CopilotCards — le traceur produit (#1946.5/.6/.7/.8)', () => {
  const ACTION = { action: 'prepare_mail_draft' as const, to: 'claire@acme.example', subject: 'x', body: 'y' }

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    trackPreparedActionStage.mockReset()
  })

  it('« préparée » se constate quand le SERVEUR rend l’état `prepared`, avec le NOM de geste — jamais sa cible', () => {
    render(<CopilotCards cards={[card({ action: ACTION, state: 'prepared' })]} />)
    expect(trackPreparedActionStage).toHaveBeenCalledWith('prepare_mail_draft', 'preparee')
    // Jamais la cible (l'adresse, le sujet) — seulement le nom de l'action.
    expect(trackPreparedActionStage).not.toHaveBeenCalledWith(expect.stringContaining('claire@'), expect.anything())
  })

  it('une carte SANS action n’émet rien — pas de nom de geste à mesurer', () => {
    render(<CopilotCards cards={[card({ action: null, state: 'prepared' })]} />)
    expect(trackPreparedActionStage).not.toHaveBeenCalled()
  })

  it('« validée » se constate au CLIC de confirmation, avant même la réponse serveur', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, state: 'executed', allowedGestures: [] }) })
    render(<CopilotCards cards={[card({ action: ACTION })]} />)
    trackPreparedActionStage.mockClear() // ne garder que ce que CE clic déclenche

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(trackPreparedActionStage).toHaveBeenCalledWith('prepare_mail_draft', 'validee')
  })

  it('« exécutée » se constate quand le SERVEUR rend l’état `executed`', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, state: 'executed', allowedGestures: [] }) })
    render(<CopilotCards cards={[card({ action: ACTION })]} />)
    trackPreparedActionStage.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => expect(trackPreparedActionStage).toHaveBeenCalledWith('prepare_mail_draft', 'executee'))
  })

  it('un geste qui ÉCHOUE n’émet jamais « exécutée » — l’état reste `prepared`', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Cette carte a expiré.'))
    render(<CopilotCards cards={[card({ action: ACTION })]} />)
    trackPreparedActionStage.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(trackPreparedActionStage).not.toHaveBeenCalledWith(expect.anything(), 'executee')
  })

  it('« corrigée » se constate APRÈS l’acceptation SERVEUR d’un patch — jamais au clic « Enregistrer » seul', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({
      card: card({ action: { ...ACTION, subject: 'Objet corrigé' }, allowedGestures: ['confirm', 'reject', 'modify'] }),
    })
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'reject', 'modify'] })]} />)
    trackPreparedActionStage.mockClear()

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(trackPreparedActionStage).not.toHaveBeenCalledWith(expect.anything(), 'corrigee')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(trackPreparedActionStage).toHaveBeenCalledWith('prepare_mail_draft', 'corrigee'))
  })

  it('une correction REFUSÉE par le serveur n’émet jamais « corrigée »', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockRejectedValue(new Error('Modification invalide.'))
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'reject', 'modify'] })]} />)
    trackPreparedActionStage.mockClear()

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(trackPreparedActionStage).not.toHaveBeenCalledWith(expect.anything(), 'corrigee')
  })
})

/**
 * #1946.16 — LE BROUILLON REPRIS, MESURÉ SANS EN LIRE LE TEXTE.
 *
 * Tranché sans Louis (decisions-louis-22-09-soir.md §12, aucune recommandation
 * écrite dans la ligne de registre) : la version la plus CONSERVATRICE ne
 * compare que des LONGUEURS de champ, jamais leur contenu — donc deux textes
 * de MÊME longueur mais de contenu différent se lisent « tel quel », ce que le
 * premier test ci-dessous prouve délibérément.
 */
describe('CopilotCards — le brouillon repris (#1946.16)', () => {
  const ACTION = {
    action: 'prepare_mail_draft' as const,
    to: 'claire@acme.example',
    subject: 'Bonjour',
    body: 'Un message.',
  }

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    trackDraftReused.mockReset()
  })

  it('« tel quel » quand rien n’a changé de longueur', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, allowedGestures: ['confirm', 'modify'] }) })
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'modify'] })]} />)

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(trackDraftReused).toHaveBeenCalledWith('/chat', 'tel_quel'))
  })

  it('« tel quel » aussi sur un texte de même LONGUEUR mais différent — la mesure ne lit jamais le contenu', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, allowedGestures: ['confirm', 'modify'] }) })
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'modify'] })]} />)

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.clear(screen.getByLabelText('Objet'))
    await user.type(screen.getByLabelText('Objet'), 'Bonsoir') // 7 lettres, comme « Bonjour »
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(trackDraftReused).toHaveBeenCalledWith('/chat', 'tel_quel'))
  })

  it('« retouché » sur un écart de longueur MODÉRÉ (sous 60 %)', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, allowedGestures: ['confirm', 'modify'] }) })
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'modify'] })]} />)

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.clear(screen.getByLabelText('Objet'))
    await user.type(screen.getByLabelText('Objet'), 'Bonjour à tous!') // 15 lettres contre 7 ⇒ écart 8/15 ≈ 53 %
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(trackDraftReused).toHaveBeenCalledWith('/chat', 'retouche'))
  })

  it('« réécrit » quand un champ est VIDÉ entièrement — écart de longueur maximal', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, allowedGestures: ['confirm', 'modify'] }) })
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'modify'] })]} />)

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.clear(screen.getByLabelText('Message'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(trackDraftReused).toHaveBeenCalledWith('/chat', 'reecrit'))
  })

  it('n’émet RIEN quand le serveur REFUSE le patch — un brouillon refusé n’a rien repris', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockRejectedValue(new Error('Modification invalide.'))
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'modify'] })]} />)

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(trackDraftReused).not.toHaveBeenCalled()
  })

  it('jamais le TEXTE du brouillon dans l’argument émis — seul un mot du vocabulaire fermé', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ card: card({ action: ACTION, allowedGestures: ['confirm', 'modify'] }) })
    render(<CopilotCards cards={[card({ action: ACTION, allowedGestures: ['confirm', 'modify'] })]} />)

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(trackDraftReused).toHaveBeenCalled())
    for (const call of trackDraftReused.mock.calls) {
      expect(['tel_quel', 'retouche', 'reecrit']).toContain(call[1])
      expect(call[1]).not.toEqual(expect.stringContaining('Bonjour'))
      expect(call[1]).not.toEqual(expect.stringContaining('claire@'))
    }
  })
})

/**
 * #2366.1 / #2366.2 — LA CARTE RELIT LE MESSAGE CANONIQUE, ELLE NE GARDE PAS
 * UNE SECONDE VERSION FIGÉE.
 *
 * `result.content` (déjà testé plus haut) reste le texte produit AU MOMENT de
 * la génération — ce qui manquait : rien ne permettait de savoir qu'une
 * édition faite ailleurs (le centre d'approbation Outreach, #2382) existait.
 * `result.outreachMessageId`, quand il est là, fait relire l'objet à jour —
 * le MÊME que la fiche Contact affiche (#2366.1).
 */
function outreachMessage(overrides: Partial<OutreachMessage> = {}): OutreachMessage {
  return {
    id: 'msg-1',
    contact_id: 'contact-1',
    contact_name: 'Claire Meunier',
    contact_role: null,
    account_name: null,
    channel: 'email',
    intent: 'open_relationship',
    source: 'laura',
    reason: null,
    status: 'needs_review',
    sequence_id: null,
    sequence_step_id: null,
    asset_id: null,
    owner_id: 'user-1',
    current_version: 1,
    message_style_template_id: null,
    message_style_template_version: null,
    subject: 'Suite',
    body: 'Bonjour Claire, suite à…',
    versions: [],
    approval: null,
    view: null,
    blockers: [],
    risks: [],
    can_approve: true,
    required_permission: 'messages:send',
    created_at: '2026-09-20T09:00:00.000Z',
    updated_at: '2026-09-20T09:00:00.000Z',
    ...overrides,
  }
}

describe('CopilotCards — le message canonique se relit (#2366.1 / #2366.2)', () => {
  beforeEach(() => {
    vi.mocked(useOutreachMessage).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useOutreachMessage>)
  })

  it('sans identifiant canonique, aucune relecture — le hook n’est même pas interrogé', () => {
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)
    expect(useOutreachMessage).not.toHaveBeenCalled()
  })

  it('avec un identifiant, la carte affiche l’état ET le corps À JOUR du message canonique', () => {
    vi.mocked(useOutreachMessage).mockReturnValue({
      data: outreachMessage({ status: 'approved', body: 'Bonjour Claire, texte MODIFIÉ dans le centre.' }),
      isLoading: false,
    } as unknown as ReturnType<typeof useOutreachMessage>)
    render(
      <CopilotCards
        cards={[
          card({
            state: 'executed',
            allowedGestures: [],
            result: result({ content: 'Bonjour Claire, texte FIGÉ à la génération.', outreachMessageId: 'msg-1' }),
          }),
        ]}
      />,
    )
    expect(useOutreachMessage).toHaveBeenCalledWith('msg-1')
    // …le texte À JOUR est là, pas le texte figé de `content` (une SECONDE
    // version que le fil ne doit jamais garder pour lui — #2366.2).
    expect(screen.getByText('Bonjour Claire, texte MODIFIÉ dans le centre.')).toBeInTheDocument()
    expect(screen.getByText('Validé')).toBeInTheDocument()
  })

  it('tant que la relecture n’a rien rendu, rien ne s’affiche — jamais un contenu deviné', () => {
    render(
      <CopilotCards
        cards={[
          card({
            state: 'executed',
            allowedGestures: [],
            result: result({ outreachMessageId: 'msg-1' }),
          }),
        ]}
      />,
    )
    expect(screen.queryByTestId('outreach-message-live')).not.toBeInTheDocument()
  })
})

/**
 * #1950.4 / .7 / .10 / .12 / .13 — LE PLAN DIT SON OBJECTIF. Tranché sans Louis
 * (décision §12) : la barre de plan EXISTANTE porte le résumé que Laura a
 * nommé (`context.plan_brief`) ; une liste absente ne fait AUCUNE ligne ; la
 * « durée » est l'horizon DATÉ des étapes (#1950.10), jamais une estimation.
 */
describe('CopilotCards — le résumé du plan (#1950.4 / .7 / .10 / .12 / .13)', () => {
  const twoSteps = () => [
    card({ id: 'run-1', proposalIndex: 0 }),
    card({
      id: 'run-2',
      proposalIndex: 1,
      action: { action: 'schedule_reminder', contact_id: 'c-1', at: '2026-10-02T09:00:00Z' },
    }),
  ]

  it('nomme l’objectif, les résultats attendus, ce qui manque et ce qui ne sera pas fait', () => {
    render(
      <CopilotCards
        cards={twoSteps()}
        brief={{
          objective: 'Relancer Eric chez ACTIA avant son comité',
          expected_results: ['Un brouillon prêt', 'Un rappel posé'],
          missing_data: ['Le numéro direct d’Eric'],
          impossible: ['Envoyer l’e-mail à ta place'],
        }}
      />,
    )
    const plan = screen.getByRole('region', { name: /Plan de/ })
    expect(plan).toHaveTextContent('Objectif : Relancer Eric chez ACTIA avant son comité')
    expect(plan).toHaveTextContent('Résultats attendus : Un brouillon prêt, Un rappel posé')
    expect(plan).toHaveTextContent('Données manquantes : Le numéro direct d’Eric')
    expect(plan).toHaveTextContent('Ne sera pas fait : Envoyer l’e-mail à ta place')
    // #1950.10 — l'horizon DATÉ, lu sur le rappel du plan.
    expect(plan).toHaveTextContent(/Le plan court jusqu’au 2 octobre/)
  })

  it('une absence ne fait AUCUNE ligne', () => {
    render(
      <CopilotCards
        cards={[card({ id: 'run-1', proposalIndex: 0 }), card({ id: 'run-2', proposalIndex: 1 })]}
        brief={{ objective: 'Relancer ACTIA' }}
      />,
    )
    const plan = screen.getByRole('region', { name: /Plan de/ })
    expect(plan).toHaveTextContent('Objectif : Relancer ACTIA')
    expect(plan).not.toHaveTextContent(/Résultats attendus|Données manquantes|Ne sera pas fait|court jusqu/)
  })
})

// #2896 — le niveau d'action visible au moment où l'action devient possible, et
// dans la prévisualisation avant exécution.
describe('#2449.35 / #2449.36 — le niveau d’action sur la carte', () => {
  beforeEach(() => {
    actionLevelData.current = undefined
  })

  it('#2449.35 — une carte qu’on peut valider NOMME le niveau réglé, et mène au réglage', () => {
    actionLevelData.current = { level: 'prepare' }
    render(<CopilotCards cards={[card()]} />)

    expect(screen.getByText(/Niveau d'action : Préparer/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Changer le niveau d'action/ })).toHaveAttribute(
      'href',
      '/settings/laura-mode',
    )
  })

  it('#2449.35 — sans réglage, le défaut est dit comme un DÉFAUT', () => {
    actionLevelData.current = { level: null }
    render(<CopilotCards cards={[card()]} />)

    expect(screen.getByText(/Niveau d'action : Exécuter \(par défaut\)/)).toBeInTheDocument()
  })

  it('#2449.36 — la prévisualisation dit ce que ce niveau fera au clic', () => {
    actionLevelData.current = { level: 'respond_only' }
    render(<CopilotCards cards={[card()]} />)

    const preview = screen.getByRole('region', { name: 'Ce que ça va faire' })
    expect(preview).toHaveTextContent('Niveau d')
    expect(preview).toHaveTextContent('Elle ne touche à rien')
  })

  it('NON : une carte qu’on ne peut plus valider ne parle pas de niveau', () => {
    actionLevelData.current = { level: 'prepare' }
    render(<CopilotCards cards={[card({ state: 'executed', allowedGestures: [], result: result() })]} />)

    expect(screen.queryByText(/Niveau d'action/)).toBeNull()
  })

  it('NON : un niveau non lu ne s’affiche pas — ni défaut deviné, ni ligne vide', () => {
    render(<CopilotCards cards={[card()]} />)

    expect(screen.queryByText(/Niveau d'action/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Ce que ça va faire' })).not.toHaveTextContent('Niveau d')
  })
})
