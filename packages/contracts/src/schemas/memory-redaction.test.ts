import { describe, expect, it } from 'vitest'
import { REDACTED_MEMORY_VALUE, memoryRedactionFamilyNames, redactMemoryFact } from './memory-redaction.js'

/**
 * #1918.1 (masquage) — décision de Louis du 15/09/2026 : une mémoire
 * `workspace` lue par un non-auteur masque ce qui a la FORME d'un secret.
 * Voir `memory-redaction.ts` pour la doctrine complète et `toWireFact`
 * (apps/api/src/modules/memory/memory.service.ts) pour l'appelant réel.
 */
describe('redactMemoryFact', () => {
  it('lit un corpus de familles non vide', () => {
    expect(memoryRedactionFamilyNames().length).toBeGreaterThan(0)
  })

  it('masque un JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYXNpZ25hdHVyZQ'
    expect(redactMemoryFact(`Voici le jeton : ${jwt}`)).toBe(`Voici le jeton : ${REDACTED_MEMORY_VALUE}`)
  })

  it('masque un hôte interne *.railway.internal', () => {
    expect(redactMemoryFact('La base est sur belllum-backend-service.railway.internal:3000')).toBe(
      `La base est sur ${REDACTED_MEMORY_VALUE}`,
    )
  })

  it('masque un IBAN sous sa forme COMPACTE', () => {
    expect(redactMemoryFact('IBAN du client : FR7630006000011234567890189')).toBe(
      `IBAN du client : ${REDACTED_MEMORY_VALUE}`,
    )
  })

  it('masque un IBAN sous sa forme IMPRIMÉE, par groupes de quatre', () => {
    expect(redactMemoryFact('RIB reçu : FR76 3000 6000 0112 3456 7890 189')).toBe(`RIB reçu : ${REDACTED_MEMORY_VALUE}`)
  })

  it('masque un mot de passe dans une URL, en gardant le SCHÉMA et l’HÔTE lisibles', () => {
    expect(redactMemoryFact('DATABASE_URL=postgres://user:hunter2@db.example.com/prod')).toBe(
      `DATABASE_URL=postgres://${REDACTED_MEMORY_VALUE}@db.example.com/prod`,
    )
  })

  it('masque un Redis sans identifiant (mot de passe seul avant le @)', () => {
    expect(redactMemoryFact('redis://:motdepasse@cache.example.com:6379')).toBe(
      `redis://${REDACTED_MEMORY_VALUE}@cache.example.com:6379`,
    )
  })

  it('NE masque PAS un numéro de TVA intracommunautaire — même tête qu’un IBAN, jamais son motif', () => {
    const text = 'Numéro de TVA : FR12345678901'
    expect(redactMemoryFact(text)).toBe(text)
  })

  it('témoin de sur-masquage — la prose professionnelle ordinaire revient INTACTE', () => {
    const text =
      'Objectif : quatre signatures à Toulouse. Contact : jean.dupont@acme.fr, +33 6 12 34 56 78, siret 12345678900011.'
    expect(redactMemoryFact(text)).toBe(text)
  })

  it('est idempotent — appliquer deux fois donne le même résultat', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYXNpZ25hdHVyZQ'
    const once = redactMemoryFact(`Jeton : ${jwt}`)
    expect(redactMemoryFact(once)).toBe(once)
  })

  it('un texte vide ou absent reste tel quel', () => {
    expect(redactMemoryFact('')).toBe('')
  })
})
