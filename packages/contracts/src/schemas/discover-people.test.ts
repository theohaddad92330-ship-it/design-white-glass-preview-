import { describe, expect, it } from 'vitest'
import { discoverCandidateSchema, discoverPersonSchema, resolvePersonFact } from './discover.js'

/**
 * #2544.2 — LE CONTRAT « PERSONNES » DE DÉCOUVRIR.
 *
 * Il naît d'un constat mesuré sur une réponse RÉELLE du registre public
 * (ARQUUS, 18/09/2026) : chaque mandataire y porte son nom, ses prénoms, sa
 * qualité, sa nationalité et son type — et AUCUN champ d'adresse,
 * d'établissement ou de SIRET. Le mandat est attaché à l'unité légale, au
 * SIREN, jamais à un site.
 *
 * Trois interdits en découlent, et chacun a son test capable de dire NON :
 *
 * 1. le registre ne peut PAS servir à dire « cette personne travaille à tel
 *    endroit » — le contrat refuse un lieu de travail d'origine `registry`
 *    plutôt que de compter sur la discipline de l'appelant ;
 * 2. un champ absent se lit « inconnu », jamais « 0 » ni une chaîne vide ;
 * 3. aucun attribut protégé ne peut voyager clandestinement : le schéma est
 *    fermé, et une nationalité (que la source PUBLIE pourtant) est rejetée.
 */

const NAME = { value: 'Camille Ferrand', origin: 'registry', observedAt: '2026-09-18T08:00:00.000Z' } as const

describe('#2544.2 — une personne porte des faits ATTESTÉS, jamais des valeurs nues', () => {
  it('exige une provenance ET une date de constat sur le nom', () => {
    expect(discoverPersonSchema.safeParse({ name: NAME }).success).toBe(true)
    // Un nom nu ne dit pas d'où il vient : il ne peut pas être affiché honnêtement.
    expect(discoverPersonSchema.safeParse({ name: 'Camille Ferrand' }).success).toBe(false)
    expect(discoverPersonSchema.safeParse({ name: { value: 'Camille Ferrand' } }).success).toBe(false)
    expect(discoverPersonSchema.safeParse({ name: { value: 'Camille Ferrand', origin: 'registry' } }).success).toBe(
      false,
    )
  })

  it('refuse une valeur VIDE déguisée en fait : une chaîne blanche n’est pas un nom', () => {
    expect(discoverPersonSchema.safeParse({ name: { ...NAME, value: '' } }).success).toBe(false)
  })

  it('ferme la porte aux attributs protégés, même publiés par la source', () => {
    // Le registre publie `nationalite` sur chaque mandataire. Elle n'entre pas.
    expect(discoverPersonSchema.safeParse({ name: NAME, nationality: 'Française' }).success).toBe(false)
    expect(discoverPersonSchema.safeParse({ name: NAME, photoUrl: 'https://exemple.test/p.jpg' }).success).toBe(false)
    expect(discoverPersonSchema.safeParse({ name: NAME, age: 51 }).success).toBe(false)
  })
})

/**
 * ⚠️ #2613 (20/09/2026) — LE BLOC « ce qu'on ignore est NOMMÉ » A ÉTÉ RETIRÉ,
 * avec la fonction qu'il testait (`discoverPersonUnknownFields`).
 *
 * Décision de Louis : « on affiche pas ce qu'on a pas, on va pas mettre non
 * mesuré et tout ça, ça envoie juste un signal negatif à l'user qui est pas
 * utile. » Portée : partout dans les LISTES, mais un SCORE garde ses axes.
 * `CandidatePeople` était son seul appelant et n'écrit plus « Non su : … ».
 *
 * Ce qui TIENT encore, et que les tests ci-dessous vérifient toujours : un
 * champ absent reste ABSENT — ni chaîne vide, ni valeur par défaut, ni `0` —,
 * un critère protégé n'entre pas, et le lieu d'une personne n'est pas celui de
 * l'entreprise. Ce n'est pas une régression : ne remets pas le bloc.
 */
describe('#2544.2 / #2613 — un champ absent reste absent, il ne se remplit pas', () => {
  it('laisse le mandat et le lieu de travail INDÉFINIS, jamais vides ni à zéro', () => {
    const person = discoverPersonSchema.parse({ name: NAME })
    expect(person.role).toBeUndefined()
    expect(person.workplace).toBeUndefined()
  })
})

describe('#2544.2 — l’ÉTABLISSEMENT d’une personne n’est pas celui de l’entreprise', () => {
  it('REFUSE un lieu de travail attribué au registre public', () => {
    // C'est le cœur de l'arbitrage : le registre rattache un mandataire au
    // SIREN, jamais à un établissement. « Ce dirigeant travaille à Garchizy »
    // n'est pas une lecture du registre, c'est une invention.
    const parsed = discoverPersonSchema.safeParse({
      name: NAME,
      workplace: { city: 'Garchizy', origin: 'registry', observedAt: '2026-09-18T08:00:00.000Z' },
    })
    expect(parsed.success).toBe(false)
  })

  it('accepte un lieu de travail CONSTATÉ, avec le SIRET qui le distingue d’un siège recopié', () => {
    const parsed = discoverPersonSchema.safeParse({
      name: NAME,
      workplace: {
        city: 'Garchizy',
        siret: '31448233900074',
        origin: 'human',
        observedAt: '2026-09-18T08:00:00.000Z',
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une ville vide : un lieu sans ville n’est pas un lieu', () => {
    const parsed = discoverPersonSchema.safeParse({
      name: NAME,
      workplace: { city: '', origin: 'human', observedAt: '2026-09-18T08:00:00.000Z' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('#2544.2 — une correction humaine gagne TOUJOURS, quelle que soit sa date', () => {
  const human = { value: 'Camille Ferrand', origin: 'human', observedAt: '2020-01-01T00:00:00.000Z' } as const
  const registry = { value: 'C. FERRAND', origin: 'registry', observedAt: '2026-09-18T08:00:00.000Z' } as const
  const provider = { value: 'Camille F.', origin: 'provider', observedAt: '2026-09-17T08:00:00.000Z' } as const

  it('choisit l’humain même quand il est le plus ANCIEN des trois', () => {
    expect(resolvePersonFact([registry, provider, human])?.value).toBe('Camille Ferrand')
  })

  it('à défaut d’humain, choisit le constat le plus RÉCENT', () => {
    expect(resolvePersonFact([provider, registry])?.value).toBe('C. FERRAND')
  })

  it('ne devine rien quand il n’y a rien : `null`, jamais un marque-place', () => {
    expect(resolvePersonFact([])).toBeNull()
  })
})

describe('#2544.2 — le candidat porte les personnes, et reste valide sans elles', () => {
  const base = {
    name: 'ARQUUS',
    siren: '542045766',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
  }

  it('accepte une réponse d’avant ce déploiement, sans la clé', () => {
    expect(discoverCandidateSchema.parse(base).people).toBeUndefined()
  })

  it('porte les personnes nommées par le registre, sans jamais leur inventer un lieu', () => {
    const parsed = discoverCandidateSchema.parse({ ...base, people: [{ name: NAME }] })
    expect(parsed.people?.[0]?.name.value).toBe('Camille Ferrand')
    expect(parsed.people?.[0]?.workplace).toBeUndefined()
    // La ville du candidat décrit l'ÉTABLISSEMENT, pas la personne : les deux
    // ne se recopient jamais l'une dans l'autre.
    expect(parsed.city).toBeNull()
  })
})
