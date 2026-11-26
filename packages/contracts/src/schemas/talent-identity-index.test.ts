import { describe, expect, it } from 'vitest'
import {
  findTalentDuplicates,
  indexTalentIdentities,
  type TalentIdentity,
  type TalentIdentityCandidate,
} from './talent-duplicates.js'

/**
 * Incident boucle API (05/10/2026) — un import ZIP de 688 CV comparait chaque
 * CV au vivier ENTIER (jusqu'à 5 000 fiches, une normalisation Unicode par
 * champ et par fiche), d'un bloc, sur la boucle de l'API. L'index range le
 * vivier UNE fois par clé normalisée ; une recherche ne relit que les fiches
 * qui partagent au moins une clé avec le candidat.
 *
 * Ce que ces tests protègent : l'index rend EXACTEMENT ce que rend
 * `findTalentDuplicates` sur le vivier entier — mêmes fiches, même ordre,
 * mêmes raisons — et il ne relit pas les fiches sans clé commune.
 */
const WS = 'w1'

function talent(over: Partial<TalentIdentity> & { id: string }): TalentIdentity {
  return { workspaceId: WS, fullName: null, email: null, phone: null, lastEmployer: null, ...over }
}

function candidate(over: Partial<TalentIdentityCandidate> = {}): TalentIdentityCandidate {
  return { workspaceId: WS, fullName: null, email: null, phone: null, lastEmployer: null, ...over }
}

const POOL: TalentIdentity[] = [
  talent({ id: 'a', fullName: 'Yanis Berthier', email: 'yanis@example.fr', lastEmployer: 'Delta' }),
  talent({ id: 'b', fullName: 'Élodie Martin', phone: '+33 6 12 34 56 78', location: 'Lyon' }),
  talent({ id: 'c', documentHashes: ['ABC123'], experienceKeys: ['acme 2019 2021 ingenieur plateforme'] }),
  talent({ id: 'd', externalIds: ['boond:42'], publicProfileUrl: 'https://www.example.org/in/yb/' }),
  talent({ id: 'e', fullName: 'Yanis Berthier', lastEmployer: 'Gamma' }),
  talent({ id: 'f', email: 'autre@example.fr', workspaceId: 'w2' }),
]

const CANDIDATES: TalentIdentityCandidate[] = [
  candidate({ email: ' YANIS@example.fr ' }),
  candidate({ fullName: 'yanis  berthier', lastEmployer: 'delta' }),
  candidate({ phone: '06 12 34 56 78' }),
  candidate({ documentHashes: ['abc123'] }),
  candidate({ experienceKeys: ['acme 2019 2021 ingenieur plateforme', 'x 2001 2002 aa bb'] }),
  candidate({ externalIds: ['BOOND:42'] }),
  candidate({ publicProfileUrl: 'http://example.org/in/yb?x=1' }),
  candidate({ fullName: 'Elodie Martin', location: 'lyon' }),
  candidate({ email: 'autre@example.fr' }),
  candidate({ email: 'personne@example.fr', phone: '0700000000' }),
  candidate({ selfId: 'a', email: 'yanis@example.fr' }),
]

describe('indexTalentIdentities (incident 05/10/2026)', () => {
  it('rend exactement ce que rend findTalentDuplicates sur le vivier entier', () => {
    const index = indexTalentIdentities(POOL)
    for (const c of CANDIDATES) expect(index.find(c)).toEqual(findTalentDuplicates(c, POOL))
    // Le jeu d'essai n'est pas vide de sens : il produit bien des rapprochements.
    expect(CANDIDATES.filter(c => index.find(c).length > 0).length).toBeGreaterThanOrEqual(7)
  })

  it('ne relit PAS les fiches qui ne partagent aucune clé avec le candidat', () => {
    let reads = 0
    const watched = Array.from({ length: 200 }, (_, i) => {
      const identity = talent({ id: `t${i}`, email: `t${i}@example.fr`, fullName: `Personne ${i}` })
      return new Proxy(identity, {
        get(target, key, receiver) {
          if (key === 'email') reads += 1
          return Reflect.get(target, key, receiver) as unknown
        },
      })
    })
    const index = indexTalentIdentities(watched)
    reads = 0
    const found = index.find(candidate({ email: 't7@example.fr' }))
    expect(found.map(match => match.talentId)).toEqual(['t7'])
    expect(reads).toBeLessThanOrEqual(2)
  })

  it('une fiche AJOUTÉE (ou complétée) après coup est retrouvée', () => {
    const index = indexTalentIdentities(POOL)
    expect(index.find(candidate({ email: 'neuf@example.fr' }))).toEqual([])
    index.add(talent({ id: 'g', email: 'neuf@example.fr' }))
    expect(index.find(candidate({ email: 'neuf@example.fr' })).map(m => m.talentId)).toEqual(['g'])

    index.add(talent({ id: 'c', documentHashes: ['ABC123', 'NOUVEAU'], experienceKeys: [] }))
    expect(index.find(candidate({ documentHashes: ['nouveau'] })).map(m => m.talentId)).toEqual(['c'])
    expect(index.find(candidate({ documentHashes: ['abc123'] })).map(m => m.talentId)).toEqual(['c'])
  })
})
