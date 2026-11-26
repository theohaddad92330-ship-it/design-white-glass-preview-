import { describe, expect, it } from 'vitest'
import { CHAT_THREAD_TITLE_MAX_LENGTH, CHAT_THREAD_TITLE_SOURCES, chatThreadTitleSchema } from './chat-thread-title.js'

/**
 * #1911.12 / #1955.1 — le titre d'un fil, tel qu'une personne le SAISIT.
 *
 * Une seule définition pour les deux bouts : l'API valide le corps du
 * renommage avec ce schéma, l'écran borne sa saisie avec la même longueur. Deux
 * bornes écrites séparément finissent par dire deux choses — et c'est alors
 * l'utilisateur qui découvre, en validant, que son titre était trop long.
 */
describe('chatThreadTitleSchema', () => {
  it('retire les espaces autour et replie les blancs intérieurs', () => {
    expect(chatThreadTitleSchema.parse('  Préparer   le RDV\nSNCF  ')).toBe('Préparer le RDV SNCF')
  })

  it('sait dire NON — un titre fait seulement de blancs n’est pas un titre', () => {
    expect(chatThreadTitleSchema.safeParse('   \n\t ').success).toBe(false)
    expect(chatThreadTitleSchema.safeParse('').success).toBe(false)
  })

  it('accepte un seul caractère — un sigle suffit à désigner un fil', () => {
    expect(chatThreadTitleSchema.parse('X')).toBe('X')
  })

  it('accepte 120 caractères, refuse le 121e', () => {
    expect(CHAT_THREAD_TITLE_MAX_LENGTH).toBe(120)
    expect(chatThreadTitleSchema.safeParse('a'.repeat(120)).success).toBe(true)
    expect(chatThreadTitleSchema.safeParse('a'.repeat(121)).success).toBe(false)
  })

  it('mesure APRÈS le repli des blancs — des espaces de trop ne font pas refuser un titre court', () => {
    expect(chatThreadTitleSchema.safeParse(`  ${'a'.repeat(120)}   `).success).toBe(true)
  })

  it('refuse ce qui n’est pas une chaîne', () => {
    expect(chatThreadTitleSchema.safeParse(42).success).toBe(false)
    expect(chatThreadTitleSchema.safeParse(null).success).toBe(false)
  })
})

describe('CHAT_THREAD_TITLE_SOURCES', () => {
  it('deux auteurs, et seulement deux : Laura ou la personne', () => {
    expect(CHAT_THREAD_TITLE_SOURCES.options).toEqual(['laura', 'user'])
  })
})
