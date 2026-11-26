import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DUREE_SESSION_MS, lireEnrolement, lireSession, signerEnrolement, signerSession } from './session'

/**
 * Le cookie de session : signé, daté, et qui ne se recycle pas d'un usage à
 * l'autre (#1668).
 *
 * ⚠️ T2 de l'issue — « session de 8h01 → 401 » — vit ici : c'est la SIGNATURE
 * qui porte l'échéance, donc c'est ici qu'elle se prouve. Le 401 lui-même est
 * dans `middleware.test.ts`.
 */

const SECRET_ORIGINE = process.env['INTERNAL_API_SECRET']

beforeEach(() => {
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
})

afterEach(() => {
  if (SECRET_ORIGINE === undefined) delete process.env['INTERNAL_API_SECRET']
  else process.env['INTERNAL_API_SECRET'] = SECRET_ORIGINE
})

describe('le cookie de session du back-office (#1668)', () => {
  it('LIT quelque chose — un jeton signé se relit', async () => {
    const jeton = await signerSession('louis@bellum-it.com')
    expect(jeton).toBeTruthy()
    expect(await lireSession(jeton ?? undefined)).toEqual({ email: 'louis@bellum-it.com' })
  })

  it('T2 — une session de 8 h 01 ne vaut plus rien', async () => {
    const emission = Date.now()
    const jeton = await signerSession('louis@bellum-it.com', emission)
    // À 7 h 59 elle vaut encore.
    expect(await lireSession(jeton ?? undefined, emission + DUREE_SESSION_MS - 60_000)).not.toBeNull()
    // À 8 h 01, non — et sans rien à invalider côté serveur.
    expect(await lireSession(jeton ?? undefined, emission + DUREE_SESSION_MS + 60_000)).toBeNull()
  })

  it('sait dire NON — un jeton bricolé est refusé', async () => {
    const jeton = (await signerSession('louis@bellum-it.com')) ?? ''
    const [corps = '', signature = ''] = jeton.split('.')

    // Corps changé, signature d'origine.
    const faux = `${btoa('{"e":"intrus@x.fr","x":9999999999999}').replace(/=+$/, '')}.${signature}`
    expect(await lireSession(faux)).toBeNull()
    // Signature changée, corps d'origine.
    expect(await lireSession(`${corps}.AAAA`)).toBeNull()
    // Formes qui n'ont pas de signature du tout.
    expect(await lireSession('')).toBeNull()
    expect(await lireSession(undefined)).toBeNull()
    expect(await lireSession(corps)).toBeNull()
  })

  it('un jeton d’ENRÔLEMENT ne peut pas servir de session', async () => {
    // Deux usages, une seule clé : sans l'étiquette d'usage dans le message
    // signé, un jeton court d'enrôlement ouvrirait une session de huit heures.
    const enrolement = (await signerEnrolement('louis@bellum-it.com', 'facteur-1')) ?? ''
    expect(await lireSession(enrolement)).toBeNull()
    expect(await lireEnrolement(enrolement)).toEqual({ email: 'louis@bellum-it.com', facteurId: 'facteur-1' })

    const session = (await signerSession('louis@bellum-it.com')) ?? ''
    expect(await lireEnrolement(session)).toBeNull()
  })

  it('change de secret, change de session — la rotation déconnecte', async () => {
    const jeton = (await signerSession('louis@bellum-it.com')) ?? ''
    process.env['INTERNAL_API_SECRET'] = 'un-autre-secret-tout-aussi-long-mais-different'
    expect(await lireSession(jeton)).toBeNull()
  })

  it('sans secret, rien ne se signe et rien ne se lit', async () => {
    // Le back-office ne sert aucune donnée sans `INTERNAL_API_SECRET` : mieux
    // vaut ne pas ouvrir de session que d'en ouvrir une non signée.
    delete process.env['INTERNAL_API_SECRET']
    expect(await signerSession('louis@bellum-it.com')).toBeNull()
    expect(await lireSession('nimporte.quoi')).toBeNull()
  })
})
