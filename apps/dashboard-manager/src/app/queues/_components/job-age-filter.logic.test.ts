import { describe, expect, it } from 'vitest'
import type { QueueJob } from '@/lib/queues'
import {
  AGE_BUCKET_KEYS,
  ageBucketDeJob,
  compterParAnciennete,
  filtrerParAnciennete,
  libelleAgeInconnu,
} from './job-age-filter.logic'

/**
 * #1673.3 — LA logique du filtre « ancienneté » de la file des jobs. Aucune
 * horloge lue ici : `now` est un PARAMÈTRE (comme partout ailleurs dans ce
 * module — `queues.logic.ts` refuse déjà `new Date()`), pour que le serveur
 * et l'hydratation client calculent la même chose depuis la même ancre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FILTRE NE DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Les paliers (< 1 h / 1 h-24 h / > 24 h) sont un découpage de LECTURE — pour
 * retrouver un job — jamais un seuil de GRAVITÉ. Celui-ci reste #1647 (la
 * file de décision, `queue_stuck`) : deux dérivations du même seuil
 * divergeraient au premier ajustement (GA-26). Ce fichier ne qualifie rien
 * d'« incident », il classe une durée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ET LE FILTRE NE PORTE QUE SUR LA PAGE CHARGÉE
 * ─────────────────────────────────────────────────────────────────────────
 * BullMQ ne filtre pas par âge côté serveur (hors périmètre de ce lot :
 * ajouter cette capacité toucherait `apps/api` au-delà de `admin.service.ts`).
 * Les compteurs de ce module portent donc sur les jobs déjà CHARGÉS, jamais
 * sur la file entière — et c'est dit à l'écran, pas seulement ici.
 */

function job(partiel: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    name: 'analyze',
    data: {},
    attemptsMade: 0,
    timestamp: 1_700_000_000_000,
    processedOn: null,
    finishedOn: null,
    failedReason: null,
    stackTail: null,
    ...partiel,
  }
}

const NOW = 1_700_000_000_000 + 2 * 60 * 60 * 1000 // +2h de l'horodatage par défaut du fixture

describe('ageBucketDeJob — trois paliers, et un âge non mesurable n’en devient AUCUN', () => {
  it('classe un job de moins d’une heure en "recent"', () => {
    expect(ageBucketDeJob(NOW - 30 * 60 * 1000, NOW)).toBe('recent')
  })

  it('classe un job d’exactement 2 h en "aujourdhui" (entre 1 h et 24 h)', () => {
    expect(ageBucketDeJob(NOW - 2 * 60 * 60 * 1000, NOW)).toBe('aujourdhui')
  })

  it('classe un job de 3 jours en "ancien"', () => {
    expect(ageBucketDeJob(NOW - 3 * 24 * 60 * 60 * 1000, NOW)).toBe('ancien')
  })

  it('un horodatage `null` (non mesurable) ne matche AUCUN palier — jamais "recent" par défaut', () => {
    expect(ageBucketDeJob(null, NOW)).toBeNull()
  })

  it('sait dire NON sur une horloge incohérente : un horodatage dans le futur n’est pas mesurable non plus', () => {
    expect(ageBucketDeJob(NOW + 60_000, NOW)).toBeNull()
  })

  it('accepte pile la frontière de 1 h dans le palier suivant (borne incluse à droite du seuil précédent)', () => {
    expect(ageBucketDeJob(NOW - 60 * 60 * 1000, NOW)).toBe('aujourdhui')
    expect(ageBucketDeJob(NOW - 24 * 60 * 60 * 1000, NOW)).toBe('ancien')
  })
})

describe('filtrerParAnciennete — "tous" ne filtre rien ; un palier ne rend QUE les âges mesurés qui matchent', () => {
  const jobs = [
    job({ id: 'a', timestamp: NOW - 10 * 60 * 1000 }), // recent
    job({ id: 'b', timestamp: NOW - 5 * 60 * 60 * 1000 }), // aujourdhui
    job({ id: 'c', timestamp: NOW - 2 * 24 * 60 * 60 * 1000 }), // ancien
    job({ id: 'd', timestamp: null }), // non mesurable
  ]

  it('"tous" rend TOUS les jobs, y compris ceux dont l’âge n’est pas mesurable', () => {
    expect(filtrerParAnciennete(jobs, 'tous', NOW).map(j => j.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('un palier précis exclut les autres paliers ET les âges non mesurables', () => {
    expect(filtrerParAnciennete(jobs, 'recent', NOW).map(j => j.id)).toEqual(['a'])
    expect(filtrerParAnciennete(jobs, 'ancien', NOW).map(j => j.id)).toEqual(['c'])
  })

  it('sait dire NON : un palier sans aucun job correspondant rend un tableau vide, pas une erreur', () => {
    expect(filtrerParAnciennete([job({ timestamp: NOW })], 'ancien', NOW)).toEqual([])
  })
})

describe('compterParAnciennete — chaque palier compte SES jobs, sur la page chargée', () => {
  it('mesure les trois paliers correctement, "tous" valant la taille totale', () => {
    const jobs = [
      job({ id: 'a', timestamp: NOW - 10 * 60 * 1000 }),
      job({ id: 'b', timestamp: NOW - 10 * 60 * 60 * 1000 }),
      job({ id: 'c', timestamp: NOW - 10 * 60 * 60 * 1000 }),
      job({ id: 'd', timestamp: null }),
    ]
    const comptes = compterParAnciennete(jobs, NOW)
    expect(comptes).toEqual({ tous: 4, recent: 1, aujourdhui: 2, ancien: 0 })
  })

  it('une page sans aucun job rend des zéros MESURÉS — la page est vide, ce n’est pas "non mesuré"', () => {
    expect(compterParAnciennete([], NOW)).toEqual({ tous: 0, recent: 0, aujourdhui: 0, ancien: 0 })
  })
})

describe('libelleAgeInconnu — ce qui n’a pas pu être classé est NOMMÉ, jamais absorbé dans "recent"', () => {
  it('rend `null` quand tout est mesurable — rien à dire', () => {
    expect(libelleAgeInconnu(0, 'fr')).toBeNull()
    expect(libelleAgeInconnu(0, 'en')).toBeNull()
  })

  it('nomme le compte en FR et en EN, singulier et pluriel', () => {
    expect(libelleAgeInconnu(1, 'fr')).toMatch(/1 job.*horodatage/)
    expect(libelleAgeInconnu(3, 'fr')).toMatch(/3 jobs.*horodatage/)
    expect(libelleAgeInconnu(1, 'en')).toMatch(/1 job.*timestamp/)
    expect(libelleAgeInconnu(3, 'en')).toMatch(/3 jobs.*timestamp/)
  })
})

describe('AGE_BUCKET_KEYS — le vocabulaire fermé que l’URL doit valider', () => {
  it('commence par "tous", le défaut', () => {
    expect(AGE_BUCKET_KEYS[0]).toBe('tous')
  })

  it('contient exactement les quatre clés attendues', () => {
    expect(AGE_BUCKET_KEYS).toEqual(['tous', 'recent', 'aujourdhui', 'ancien'])
  })
})
