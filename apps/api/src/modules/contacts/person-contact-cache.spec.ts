import {
  MemoryPersonCacheStore,
  PersonContactCache,
  contactCacheEmptyTtlSeconds,
  contactCacheTtlSeconds,
  linkedinIdentity,
} from './person-contact-cache'

const DAY = 24 * 3600 * 1000
const jean = { firstName: 'Jean', lastName: 'Dupont', organizationName: 'Acme SA', domain: 'acme.fr' }

describe('PersonContactCache', () => {
  let store: MemoryPersonCacheStore
  let cache: PersonContactCache
  beforeEach(() => {
    store = new MemoryPersonCacheStore()
    cache = new PersonContactCache(store)
  })

  it('TTL par défaut : 30 jours, un « rien trouvé » 2 jours', () => {
    expect(contactCacheTtlSeconds()).toBe(30 * 24 * 3600)
    expect(contactCacheEmptyTtlSeconds()).toBe(2 * 24 * 3600)
  })

  it('une réponse déjà payée sert la même question, sans appel', async () => {
    await cache.remember(jean, { provider: 'fullenrich', email: 'jean@acme.fr' }, ['email'])
    const hit = await cache.lookup(jean, ['email'])
    expect(hit).toEqual({ settled: true, provider: 'fullenrich', email: 'jean@acme.fr' })
  })

  it('« only » et « have » se filtrent à la lecture : l’e-mail payé sert aussi la question e-mail seule', async () => {
    await cache.remember(jean, { provider: 'lusha', email: 'jean@acme.fr', phone: '+33612345678' }, ['email', 'phone'])
    const emailOnly = await cache.lookup(jean, ['email'])
    expect(emailOnly).toEqual({ settled: true, provider: 'lusha', email: 'jean@acme.fr' })
    const phoneOnly = await cache.lookup(jean, ['phone'])
    expect(phoneOnly).toEqual({ settled: true, provider: 'lusha', phone: '+33612345678' })
  })

  it('une coordonnée jamais demandée n’est pas réglée : la cascade repart pour elle seule', async () => {
    await cache.remember(jean, { provider: 'hunter', email: 'jean@acme.fr' }, ['email'])
    expect(await cache.lookup(jean, ['email', 'phone'])).toEqual({ settled: false })
  })

  it('la clé est la personne : LinkedIn en tête, variantes d’URL = une personne', async () => {
    await cache.remember(
      { ...jean, linkedinUrl: 'https://www.linkedin.com/in/Jean-Dupont/' },
      { provider: 'kaspr', phone: '+33611111111' },
      ['phone'],
    )
    const other = await cache.lookup(
      { firstName: 'Jean', lastName: 'Dupont', linkedinUrl: 'http://fr.linkedin.com/in/jean-dupont?trk=x' },
      ['phone'],
    )
    expect(other).toMatchObject({ settled: true, phone: '+33611111111' })
    expect(linkedinIdentity('https://fr.linkedin.com/in/jean-dupont?trk=x')).toBe('jean-dupont')
  })

  it('COMMUN (Louis 15/10) : aucune clé ne porte d’espace, seul le préfixe v2 est écrit', async () => {
    await cache.remember(jean, { provider: 'fullenrich', email: 'jean@acme.fr' }, ['email'])
    expect(await cache.lookup(jean, ['email'])).toMatchObject({ settled: true, email: 'jean@acme.fr' })
    const keys = [...store.entries.keys()]
    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every(k => k.startsWith('pcache:contact:v2:'))).toBe(true)
  })

  it('ne relit jamais le v1 (par espace)', async () => {
    const entry = JSON.stringify({ email: 'old@acme.fr', foundAt: { email: Date.now() } })
    await store.set('pcache:contact:v1:x:-:y:ws-1', entry, 60)
    expect(await cache.lookup(jean, ['email'])).toEqual({ settled: false })
  })

  it('l’effacement RGPD purge aussi les clés v1 restantes', async () => {
    const hash = (await import('node:crypto'))
      .createHash('sha256')
      .update('jean|dupont', 'utf8')
      .digest('hex')
      .slice(0, 32)
    await store.set(`pcache:contact:v1:${hash}:-:abc:ws-1`, '{}', 60)
    expect(await cache.purgePerson(jean)).toBeGreaterThanOrEqual(1)
    expect(store.entries.size).toBe(0)
  })

  // LOT (15/10) DATA-A point 5 — la recherche de personnes Apollo (IA) est cachée PAR ORGANISATION : on ne
  // sait pas retrouver une personne dedans, donc tout effacement RGPD (c67) la purge en bloc.
  it('l’effacement RGPD purge aussi le cache de recherche Apollo (rangé par organisation)', async () => {
    await store.set('apollo:search:abc', '[]', 60)
    await store.set('apollo:search:def', '[]', 60)
    await cache.purgePerson(jean)
    expect([...store.entries.keys()].filter(k => k.startsWith('apollo:search:'))).toEqual([])
  })

  it('un « rien trouvé » tient 2 jours, pas plus ; une panne n’est jamais écrite', async () => {
    const t0 = Date.now()
    await cache.remember(jean, {}, ['email'], t0)
    expect(await cache.lookup(jean, ['email'], t0 + DAY)).toEqual({ settled: true })
    expect(await cache.lookup(jean, ['email'], t0 + 3 * DAY)).toEqual({ settled: false })
    // panne : aucune coordonnée « répondue »
    await cache.remember({ ...jean, firstName: 'Paul' }, {}, [])
    expect(await cache.lookup({ ...jean, firstName: 'Paul' }, ['email'])).toEqual({ settled: false })
  })

  it('une valeur trouvée expire à 30 jours même si l’entrée est réécrite', async () => {
    const t0 = Date.now()
    await cache.remember(jean, { provider: 'hunter', email: 'jean@acme.fr' }, ['email'], t0)
    expect(await cache.lookup(jean, ['email'], t0 + 29 * DAY)).toMatchObject({ settled: true })
    expect(await cache.lookup(jean, ['email'], t0 + 31 * DAY)).toEqual({ settled: false })
  })

  it('personne sans identité exploitable : jamais de cache', async () => {
    await cache.remember({ firstName: 'Jean' }, { email: 'x@y.fr' }, ['email'])
    expect(store.entries.size).toBe(0)
    expect(await cache.lookup({ firstName: 'Jean' }, ['email'])).toEqual({ settled: false })
  })

  describe('effacement RGPD (c67)', () => {
    it('une personne effacée n’est plus jamais resservie, dans AUCUN espace', async () => {
      const person = { ...jean, linkedinUrl: 'https://linkedin.com/in/jean-dupont' }
      await cache.remember(person, { provider: 'fullenrich', email: 'jean@acme.fr' }, ['email'])
      await cache.remember(person, { provider: 'lusha', email: 'jean@acme.fr' }, ['email'])
      await cache.remember({ ...jean, firstName: 'Marie', lastName: 'Martin' }, { email: 'marie@acme.fr' }, ['email'])
      const removed = await cache.purgePerson(person)
      expect(removed).toBeGreaterThanOrEqual(2)
      expect(await cache.lookup(person, ['email'])).toEqual({ settled: false })
      expect(await cache.lookup(person, ['email'])).toEqual({ settled: false })
      // une autre personne n'est pas touchée
      expect(await cache.lookup({ ...jean, firstName: 'Marie', lastName: 'Martin' }, ['email'])).toMatchObject({
        settled: true,
      })
    })

    it('la purge retrouve aussi une entrée rangée par nom seul, sans profil', async () => {
      await cache.remember(jean, { email: 'jean@acme.fr' }, ['email'])
      await cache.purgePerson({ firstName: 'JEAN', lastName: 'dupont' })
      expect(await cache.lookup(jean, ['email'])).toEqual({ settled: false })
    })

    it('les clés du cache côté IA se dérivent comme en Python (vecteurs mesurés)', () => {
      const keys = PersonContactCache.iaKeys({
        apolloId: 'ABC123',
        linkedinUrl: 'https://www.linkedin.com/in/jean-dupont/',
        firstName: 'Jean',
        lastName: 'Dupont',
        organizationName: 'Acme SA',
      })
      expect(keys).toEqual(
        expect.arrayContaining([
          'apollo:enrich:caa4a3d557d13a52e0c94b77df1dc524216e89b53cf24d646baeb177d666278c',
          'apollo:enrich:6ae96ad90d03a4134ada736b2fbb9d3ef0e88a41674f0831223ff2747de540d3',
          'salesql:enrich:6ae96ad90d03a4134ada736b2fbb9d3ef0e88a41674f0831223ff2747de540d3',
          'apollo:enrich:9a302c91f419d52b267027c4ae0f64253ffa8be41c8fa9e22da219b368ec9c19',
        ]),
      )
    })

    it('purgeIaKeys supprime ces clés', async () => {
      const key = 'apollo:enrich:6ae96ad90d03a4134ada736b2fbb9d3ef0e88a41674f0831223ff2747de540d3'
      await store.set(key, '{}', 100)
      await cache.purgeIaKeys({ linkedinUrl: 'https://linkedin.com/in/jean-dupont' })
      expect(await store.get(key)).toBeNull()
    })
  })
})
