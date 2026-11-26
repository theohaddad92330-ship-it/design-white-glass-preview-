import { HttpException, ServiceUnavailableException } from '@nestjs/common'
import { classifyNetworkFailure, journeyError, journeyErrorException } from './journey-error'
import type { JourneyErrorCode, JourneyErrorInput } from './journey-error'

/**
 * #2084 — la forme commune d'un état d'erreur du parcours d'onboarding.
 *
 * Avant ce fichier, chaque module avait la sienne : un `BadRequestException`
 * brut à 400 pour une panne d'écriture (pas la faute du client), aucune
 * distinction entre « la connexion n'a jamais pu s'établir » (rejouable) et
 * « la requête est partie, la réponse jamais arrivée » (`unknown`, doctrine
 * CLAUDE.md « un timeout n'est pas un échec »), et un `cause` brut qui aurait
 * pu porter n'importe quoi jusqu'au message d'écran.
 */

describe('#2084.7 — classifyNetworkFailure : la seule question qui tranche est « la requête a-t-elle pu PARTIR ? »', () => {
  it('SAIT DIRE NON — UND_ERR_CONNECT_TIMEOUT est une connexion jamais établie : rejouable, PAS `unknown`', () => {
    // Témoin n°2 du lot : si ce test devient rouge, c'est que la connexion
    // jamais établie a été classée `unknown` — exactement le défaut que la
    // doctrine interdit (⚠️ UND_ERR_CONNECT_TIMEOUT n'est pas un timeout au
    // sens qui compte).
    const error = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' })
    expect(classifyNetworkFailure(error)).toBe('retryable')
  })

  it('une connexion refusée (le serveur n’a jamais décroché) est rejouable', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    expect(classifyNetworkFailure(error)).toBe('retryable')
  })

  it('une résolution DNS qui échoue n’a jamais ouvert de connexion : rejouable', () => {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    expect(classifyNetworkFailure(error)).toBe('retryable')
  })

  it('un timeout d’EN-TÊTES arrive une fois la requête PARTIE : `unknown`, non rejouable', () => {
    const error = Object.assign(new Error('headers timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' })
    expect(classifyNetworkFailure(error)).toBe('unknown')
  })

  it('une erreur sans code reconnu reste `unknown` — le défaut sûr : on ne SAIT PAS si ça a pu partir', () => {
    expect(classifyNetworkFailure(new Error('socket hang up'))).toBe('unknown')
    expect(classifyNetworkFailure('boom')).toBe('unknown')
    expect(classifyNetworkFailure(undefined)).toBe('unknown')
  })

  it('descend dans `.cause` — le fetch natif enveloppe le vrai code réseau un cran plus bas', () => {
    const wrapped = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    })
    expect(classifyNetworkFailure(wrapped)).toBe('retryable')
  })
})

const SAMPLE_INPUT_BY_CODE: Record<JourneyErrorCode, JourneyErrorInput> = {
  registry_unavailable: {
    code: 'registry_unavailable',
    whatHappened: "La recherche d'entreprise n'a pas pu interroger le registre.",
    notDone: "le nom saisi n'a pas pu être vérifié contre le registre.",
    nextAction: 'Continue en saisissant les informations toi-même, ou réessaie dans un instant.',
    retryable: true,
  },
  save_failed: {
    code: 'save_failed',
    whatHappened: "L'enregistrement a échoué.",
    preserved: ['ce qui était déjà enregistré reste inchangé'],
    notDone: "cette modification n'a pas été enregistrée.",
    nextAction: 'Réessaie dans un instant.',
    retryable: false,
  },
}

describe('#2084.16-.21 — journeyError : ce qui s’est passé, ce qui reste, ce qui n’a pas été fait, l’action possible', () => {
  it('construit un état complet, jamais nu — code, message lisible, et les quatre champs de la doctrine', () => {
    const state = journeyError(SAMPLE_INPUT_BY_CODE.save_failed)
    expect(state.code).toBe('save_failed')
    expect(state.whatHappened.length).toBeGreaterThan(0)
    expect(state.notDone.length).toBeGreaterThan(0)
    expect(state.nextAction.length).toBeGreaterThan(0)
    expect(state.preserved).toEqual(['ce qui était déjà enregistré reste inchangé'])
    expect(state.message).toContain(state.whatHappened)
    expect(state.retryable).toBe(false)
  })

  it('`preserved` par défaut est un tableau vide — jamais `undefined` (une valeur absente ne se rend jamais nue)', () => {
    const state = journeyError(SAMPLE_INPUT_BY_CODE.registry_unavailable)
    expect(state.preserved).toEqual([])
  })

  it('`supportUrl` par défaut est `null`, jamais inventé', () => {
    const state = journeyError(SAMPLE_INPUT_BY_CODE.save_failed)
    expect(state.supportUrl).toBeNull()
  })

  it('redacte whatHappened et notDone — un secret glissé dans un message construit dynamiquement ne survit pas', () => {
    const state = journeyError({
      ...SAMPLE_INPUT_BY_CODE.save_failed,
      whatHappened: 'Échec Bearer sk_live_abcdef1234567890ABCDEF',
    })
    expect(state.whatHappened).not.toContain('sk_live_abcdef1234567890ABCDEF')
  })

  it('journeyErrorException lève un HttpException 503 dont le corps EST l’état', () => {
    const exception = journeyErrorException(SAMPLE_INPUT_BY_CODE.save_failed)
    expect(exception).toBeInstanceOf(HttpException)
    expect(exception).toBeInstanceOf(ServiceUnavailableException)
    expect(exception.getStatus()).toBe(503)
    const body = exception.getResponse() as ReturnType<typeof journeyError>
    expect(body.code).toBe('save_failed')
    expect(body.retryable).toBe(false)
  })
})

describe('#2084.22 — aucune perte silencieuse : le corpus des codes n’est jamais vide, et chaque code produit un état COMPLET', () => {
  // `Record<JourneyErrorCode, JourneyErrorInput>` force l'exhaustivité au
  // COMPILE : ajouter un `JourneyErrorCode` sans lui donner d'entrée ici fait
  // échouer `tsc`, avant même que le test tourne — c'est la garde qui SAIT DIRE
  // NON (vérifié en ajoutant temporairement un troisième code sans entrée : la
  // compilation échoue avec « Property … is missing »).
  const codes = Object.keys(SAMPLE_INPUT_BY_CODE) as JourneyErrorCode[]

  it('lit un corpus non vide', () => {
    expect(codes.length).toBeGreaterThan(0)
  })

  it('chaque code produit whatHappened, notDone et nextAction non vides', () => {
    for (const code of codes) {
      const state = journeyError(SAMPLE_INPUT_BY_CODE[code])
      expect(state.whatHappened.length).toBeGreaterThan(0)
      expect(state.notDone.length).toBeGreaterThan(0)
      expect(state.nextAction.length).toBeGreaterThan(0)
    }
  })
})
