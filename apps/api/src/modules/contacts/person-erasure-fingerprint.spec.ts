import { createHash } from 'node:crypto'
import { PERSON_ERASURE_HMAC_KEY_ENV, PersonErasureKeyUnavailableError } from '../../common/person-erasure-hmac'
import { isErasedPerson, personErasureFingerprints } from './person-erasure-fingerprint'

const WS = 'ws-1'
const ACCOUNT = 'acc-1'
// Une clé FIXE de test — jamais la valeur posée sur un serveur.
const TEST_KEY = 'test-only-person-erasure-key-0123456789abcdef'

/**
 * #2297 — l'empreinte d'une personne effacée : ce qui empêche sa RECOLLECTE
 * sans rien garder d'elle en clair.
 */
describe('personErasureFingerprints — #2297', () => {
  const saved = process.env[PERSON_ERASURE_HMAC_KEY_ENV]
  beforeEach(() => {
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = TEST_KEY
  })
  afterAll(() => {
    if (saved === undefined) delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    else process.env[PERSON_ERASURE_HMAC_KEY_ENV] = saved
  })

  const claire = {
    fullName: 'Claire Perrin',
    email: 'Claire.Perrin@acme.fr',
    linkedinUrl: 'https://fr.linkedin.com/in/claire-perrin/',
    apolloId: 'AP-42',
    accountId: ACCOUNT,
  }

  it('rend des condensats hexadécimaux de 64 caractères — ceux que la contrainte SQL accepte', () => {
    const prints = personErasureFingerprints(WS, claire)
    expect(prints.length).toBeGreaterThanOrEqual(4)
    for (const print of prints) expect(print).toMatch(/^[0-9a-f]{64}$/)
    expect(prints.join(',')).toMatch(/^[0-9a-f]{64}(,[0-9a-f]{64})*$/)
  })

  it('ne contient AUCUNE donnée de la personne en clair', () => {
    const joined = personErasureFingerprints(WS, claire).join(' ')
    for (const clear of ['claire', 'perrin', 'acme', 'linkedin', 'ap-42']) expect(joined).not.toContain(clear)
  })

  it('reconnaît la même personne sous une autre graphie ou par une seule clé forte', () => {
    const erased = new Set(personErasureFingerprints(WS, claire))
    // Le registre écrit « PERRIN Claire », sans aucune autre clé.
    expect(
      isErasedPerson(personErasureFingerprints(WS, { fullName: 'PERRIN Claire', accountId: ACCOUNT }), erased),
    ).toBe(true)
    // Le fournisseur la rend par son identifiant seul, chez un AUTRE compte.
    expect(
      isErasedPerson(
        personErasureFingerprints(WS, { fullName: 'Claire', apolloId: 'ap-42', accountId: 'acc-2' }),
        erased,
      ),
    ).toBe(true)
    // L'adresse, casse ignorée.
    expect(
      isErasedPerson(personErasureFingerprints(WS, { fullName: 'C. P.', email: 'claire.perrin@ACME.fr' }), erased),
    ).toBe(true)
  })

  it('sait dire NON : un homonyme chez une AUTRE société n’est pas la personne effacée', () => {
    const erased = new Set(personErasureFingerprints(WS, claire))
    expect(
      isErasedPerson(personErasureFingerprints(WS, { fullName: 'Claire Perrin', accountId: 'acc-2' }), erased),
    ).toBe(false)
  })

  it('sait dire NON : la même personne dans un AUTRE espace n’y est pas effacée', () => {
    const erased = new Set(personErasureFingerprints(WS, claire))
    expect(isErasedPerson(personErasureFingerprints('ws-2', claire), erased)).toBe(false)
  })

  // #2297.51 — un condensat SANS secret se vérifiait par dictionnaire : qui
  // tenait la table et devinait l'adresse retrouvait la personne.
  it('#2297.51 — l’empreinte est un HMAC à clé, pas un SHA-256 nu de la clé d’identité', () => {
    const prints = personErasureFingerprints(WS, { email: 'claire.perrin@acme.fr' })
    const bare = createHash('sha256').update(`${WS}|email:claire.perrin@acme.fr`).digest('hex')
    expect(prints).toHaveLength(1)
    expect(prints).not.toContain(bare)
  })

  it('#2297.51 — une autre clé ne reconnaît plus la personne : le secret fait partie de l’empreinte', () => {
    const erased = new Set(personErasureFingerprints(WS, claire))
    process.env[PERSON_ERASURE_HMAC_KEY_ENV] = `${TEST_KEY}-rotated`
    expect(isErasedPerson(personErasureFingerprints(WS, claire), erased)).toBe(false)
  })

  it('#2297.51 — sans clé, aucune empreinte ne se calcule : ni repli, ni liste vide qui laisserait passer', () => {
    delete process.env[PERSON_ERASURE_HMAC_KEY_ENV]
    expect(() => personErasureFingerprints(WS, claire)).toThrow(PersonErasureKeyUnavailableError)
  })

  it('une personne sans aucune clé d’identité n’a pas d’empreinte', () => {
    expect(personErasureFingerprints(WS, { fullName: '  ' })).toEqual([])
    expect(isErasedPerson([], new Set(['x']))).toBe(false)
  })
})
