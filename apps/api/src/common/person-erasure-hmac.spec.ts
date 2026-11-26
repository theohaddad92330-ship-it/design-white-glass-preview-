import { ServiceUnavailableException } from '@nestjs/common'
import { createHash, createHmac } from 'node:crypto'
import {
  PERSON_ERASURE_HMAC_KEY_ENV,
  PersonErasureKeyUnavailableError,
  isPersonErasureKeyConfigured,
  personErasureDigest,
} from './person-erasure-hmac'

// Une clé FIXE de test — jamais la valeur posée sur un serveur.
const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'

/**
 * #2297.51 — les empreintes d'effacement sont des HMAC-SHA-256 à clé DÉDIÉE,
 * jamais un SHA-256 nu, et sans clé rien ne se calcule.
 */
describe('personErasureDigest — #2297.51', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  afterEach(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })

  it('le nom de la variable est celui posé sur le serveur', () => {
    expect(PERSON_ERASURE_HMAC_KEY_ENV).toBe('PERSON_ERASURE_HMAC_KEY')
  })

  it('rend un HMAC-SHA-256 de l’espace et de la clé d’identité — pas un SHA-256 nu', () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const digest = personErasureDigest('ws-1', 'email:claire.perrin@acme.fr')

    expect(digest).toBe(createHmac('sha256', TEST_KEY).update('ws-1|email:claire.perrin@acme.fr').digest('hex'))
    expect(digest).not.toBe(createHash('sha256').update('ws-1|email:claire.perrin@acme.fr').digest('hex'))
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('une autre clé donne une autre empreinte : sans la clé, un dictionnaire ne vérifie rien', () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    const withTestKey = personErasureDigest('ws-1', 'name:claire perrin')
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = `${TEST_KEY}-other`
    expect(personErasureDigest('ws-1', 'name:claire perrin')).not.toBe(withTestKey)
  })

  it('sans clé : AUCUNE empreinte — une indisponibilité (503), jamais un repli sur SHA-256', () => {
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    expect(isPersonErasureKeyConfigured()).toBe(false)
    expect(() => personErasureDigest('ws-1', 'name:claire perrin')).toThrow(PersonErasureKeyUnavailableError)
    expect(new PersonErasureKeyUnavailableError()).toBeInstanceOf(ServiceUnavailableException)
  })

  it('une clé trop courte (< 32 caractères) vaut une clé absente', () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = 'short-secret-value'
    expect(isPersonErasureKeyConfigured()).toBe(false)
    expect(() => personErasureDigest('ws-1', 'name:claire perrin')).toThrow(PersonErasureKeyUnavailableError)
  })

  it('l’erreur nomme la variable, jamais sa valeur', () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = 'short-secret-value'
    let caught: unknown
    try {
      personErasureDigest('ws-1', 'name:claire perrin')
    } catch (error) {
      caught = error
    }
    const said = JSON.stringify((caught as ServiceUnavailableException).getResponse()) + String(caught)
    expect(said).toContain('PERSON_ERASURE_HMAC_KEY')
    expect(said).not.toContain('short-secret-value')
  })

  it('avec une clé suffisante, le service se dit configuré', () => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
    expect(isPersonErasureKeyConfigured()).toBe(true)
  })
})
