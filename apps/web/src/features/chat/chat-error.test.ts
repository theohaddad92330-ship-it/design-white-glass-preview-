import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { chatErrorMessage, chatFailureIsRetryable, type ChatErrorTexts } from './chat-error'

const FALLBACK = 'Erreur de connexion au service IA. Réessaie.'
const NETWORK = 'Connexion perdue — rien n’a été envoyé.'
const SESSION = 'Ta session a expiré. Reconnecte-toi.'

/** Les trois phrases obligatoires, plus la note de plafond quand on la teste. */
function texts(quotaNote?: string): ChatErrorTexts {
  return { fallback: FALLBACK, networkLost: NETWORK, sessionExpired: SESSION, quotaNote }
}

describe('chatErrorMessage', () => {
  it('répète le refus expliqué par le serveur (plafond quotidien)', () => {
    const plafond = 'Plafond du copilote atteint (50 messages sur 24 h).'
    expect(chatErrorMessage(new ApiError(plafond, 429), texts())).toBe(plafond)
  })

  it('garde la phrase générique sur une panne serveur', () => {
    // « Internal server error » n'apprend rien : c'est exactement ce qu'on
    // refuse d'afficher dans le fil.
    expect(chatErrorMessage(new ApiError('Internal server error', 500), texts())).toBe(FALLBACK)
  })

  it("garde la phrase générique quand le 4xx n'explique rien", () => {
    expect(chatErrorMessage(new ApiError('   ', 400), texts())).toBe(FALLBACK)
  })

  /**
   * #1770 — « erreur ??? ». Trois familles d'échec sur quatre tombaient sur LA
   * MÊME phrase, celle d'une panne réseau. Un client dont la session était morte
   * lisait donc « Réessaie » — un conseil qui ne pouvait pas marcher.
   */
  describe('chaque cause dit ce qu’il faut faire (#1770)', () => {
    it('une session morte le DIT, au lieu d’annoncer une panne réseau', () => {
      expect(chatErrorMessage(new ApiError('Unauthorized', 401), texts())).toBe(SESSION)
      expect(chatErrorMessage(new ApiError('Forbidden', 403), texts())).toBe(SESSION)
    })

    it('une coupure de transport le DIT — et dit que rien n’est parti', () => {
      // C'est l'erreur exacte du rapport client : `TypeError: Failed to fetch`
      // sur `POST /ia/chat`, après 15,5 s.
      expect(chatErrorMessage(new TypeError('Failed to fetch'), texts())).toBe(NETWORK)
    })

    it('l’ordre est le bon : une panne de transport n’est PAS une ApiError', () => {
      // Testée après `instanceof ApiError`, elle serait retombée sur le repli
      // générique — c'est-à-dire exactement le défaut d'avant.
      expect(chatErrorMessage(new TypeError('Failed to fetch'), texts())).not.toBe(FALLBACK)
    })

    it('un abandon volontaire n’est pas une panne de réseau', () => {
      // `isNetworkFailure` exclut `AbortError` : une navigation qui annule une
      // requête ne doit pas écrire « connexion perdue » dans le fil.
      const abort = new Error('aborted')
      abort.name = 'AbortError'
      expect(chatErrorMessage(abort, texts())).toBe(FALLBACK)
    })

    it('un refus expliqué reste plus fort que les trois phrases génériques', () => {
      const refus = 'Offre insuffisante pour cette capacité.'
      expect(chatErrorMessage(new ApiError(refus, 402), texts())).toBe(refus)
    })
  })

  /**
   * Le refus au plafond est le SEUL endroit du produit qui parle du plafond —
   * mesuré : aucun écran n'affiche « il te reste N messages ». C'est donc là
   * que se dit ce qui compte, sans quoi la borne reste magique.
   */
  describe('ce que le plafond compte, et ce qu’il ne compte pas', () => {
    const PLAFOND = 'Plafond du copilote atteint (50 messages sur 24 h).'
    const NOTE =
      'Seules tes demandes comptent : quand Laura te pose une question de précision, ta réponse ne consomme rien.'

    it('ajoute la règle au refus du plafond', () => {
      const shown = chatErrorMessage(new ApiError(PLAFOND, 429), texts(NOTE))
      expect(shown).toContain(PLAFOND)
      expect(shown).toContain(NOTE)
    })

    it("n'ajoute rien aux autres refus — la règle ne parle que du plafond", () => {
      expect(chatErrorMessage(new ApiError('Offre insuffisante.', 402), texts(NOTE))).toBe('Offre insuffisante.')
      expect(chatErrorMessage(new ApiError('Internal server error', 500), texts(NOTE))).toBe(FALLBACK)
    })

    it('reste lisible sans la note (appelant qui ne la passe pas)', () => {
      expect(chatErrorMessage(new ApiError(PLAFOND, 429), texts())).toBe(PLAFOND)
    })
  })

  /**
   * #1957.8 → .10 — au plafond, le serveur rend des DONNÉES (plafond, instant
   * de réouverture) : c'est l'appelant, qui connaît la langue et le fuseau de
   * l'écran, qui les dit. La phrase française du serveur ne sert plus que de
   * repli à un corps sans code.
   */
  describe('#1957.8 — le refus au plafond passe ses données à l’appelant', () => {
    const PLAFOND = 'Plafond du copilote atteint (50 messages sur 24 h glissantes).'
    const NOTE = 'Seules tes demandes comptent.'
    const body = (reopensAt: string | null) => ({
      statusCode: 429,
      message: PLAFOND,
      code: 'chat_quota_reached',
      limit: 50,
      reopensAt,
    })
    const refusal = (reopensAt: string | null) => new ApiError(PLAFOND, 429, 'chat_quota_reached', body(reopensAt))
    const quotaReached = vi.fn(
      ({ limit, reopensAt }: { limit: number; reopensAt: Date | null }) =>
        `plafond ${limit} · ${reopensAt ? reopensAt.toISOString() : 'sans heure'}`,
    )

    it('rend le texte de l’appelant, avec le plafond et l’INSTANT lus dans le corps', () => {
      const shown = chatErrorMessage(refusal('2026-09-13T14:32:00.000Z'), { ...texts(), quotaReached })
      expect(shown).toBe('plafond 50 · 2026-09-13T14:32:00.000Z')
    })

    it('garde la règle des sauts à la suite', () => {
      const shown = chatErrorMessage(refusal('2026-09-13T14:32:00.000Z'), { ...texts(NOTE), quotaReached })
      expect(shown).toBe(`plafond 50 · 2026-09-13T14:32:00.000Z ${NOTE}`)
    })

    it('un instant que le serveur n’a pas pu calculer arrive null — jamais une heure devinée', () => {
      expect(chatErrorMessage(refusal(null), { ...texts(), quotaReached })).toBe('plafond 50 · sans heure')
    })

    // décision Louis 13/09 batch 13 — plafond selon le plan
    it('passe la SOURCE du plafond (plan ou opérateur) — absente sur une API d’avant', () => {
      const seen = vi.fn((_refusal: { limit: number; reopensAt: Date | null; limitSource?: string }) => 'vu')
      chatErrorMessage(new ApiError(PLAFOND, 429, 'chat_quota_reached', { ...body(null), limitSource: 'plan' }), {
        ...texts(),
        quotaReached: seen,
      })
      chatErrorMessage(refusal(null), { ...texts(), quotaReached: seen })
      expect(seen.mock.calls[0]?.[0]).toMatchObject({ limit: 50, limitSource: 'plan' })
      expect(seen.mock.calls[1]?.[0]?.limitSource).toBeUndefined()
    })

    it('un 429 SANS le code du plafond (limiteur de débit, ancienne API) garde la phrase du serveur', () => {
      const throttled = new ApiError(PLAFOND, 429, undefined, { statusCode: 429, message: PLAFOND })
      expect(chatErrorMessage(throttled, { ...texts(), quotaReached })).toBe(PLAFOND)
    })

    it('un appelant qui ne sait pas le dire garde la phrase du serveur', () => {
      expect(chatErrorMessage(refusal('2026-09-13T14:32:00.000Z'), texts())).toBe(PLAFOND)
    })
  })
})

/**
 * #2519 — « un bouton Relancer sur la réponse » : il ne s'offre que là où
 * relancer PEUT aboutir. Une panne (transport, flux coupé, 5xx) se relance ; un
 * refus que le serveur a expliqué (plafond, palier) ou une session morte ne se
 * relance pas — le bouton renverrait la même réponse, et creuserait le plafond.
 */
describe('chatFailureIsRetryable (#2519)', () => {
  it.each([
    ['une connexion coupée', new TypeError('Failed to fetch')],
    ['un flux interrompu avant la fin', new ApiError('La réponse s’est interrompue avant la fin.', 0)],
    ['une passerelle sans amont (502)', new ApiError('Bad Gateway', 502)],
    ['un service indisponible (503)', new ApiError('Service Unavailable', 503)],
    ['un délai de passerelle (504)', new ApiError('Gateway Timeout', 504)],
    ['une panne serveur (500)', new ApiError('Internal server error', 500)],
    ['une erreur illisible', new Error('boom')],
  ])('se relance : %s', (_label, error) => {
    expect(chatFailureIsRetryable(error)).toBe(true)
  })

  it.each([
    ['le plafond quotidien (429)', new ApiError('Plafond du copilote atteint.', 429)],
    ['une session morte (401)', new ApiError('Unauthorized', 401)],
    ['un accès refusé (403)', new ApiError('Forbidden', 403)],
    ['une demande refusée (400)', new ApiError('Message trop long.', 400)],
  ])('NON — ne se relance pas : %s', (_label, error) => {
    expect(chatFailureIsRetryable(error)).toBe(false)
  })

  it('NON — un arrêt volontaire ne se relance pas', () => {
    expect(chatFailureIsRetryable(new DOMException('aborted', 'AbortError'))).toBe(false)
  })
})
