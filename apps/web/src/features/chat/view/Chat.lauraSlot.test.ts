import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Recette salle démo 03/10 — « une bulle de Laura (~220×130) RECOUVRE le début du
 * message d'accueil ». La carte proactive se pose dans l'emplacement du fil
 * (`laura-chat-slot`, #3551), UN enfant de la colonne flex de `<main>` : aucune
 * garde ne l'empêchait d'être comprimé par cette colonne, et la carte, plus haute
 * que lui, débordait sur le fil. Le contrat tenu ici : l'emplacement ne rétrécit
 * jamais (`shrink-0`) et précède le fil dans le flux (jamais en surimpression).
 */
describe('emplacement de la carte de Laura dans /chat', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chat/view/Chat.tsx'), 'utf8')
  const at = source.indexOf('data-testid="laura-chat-slot"')
  const tag = source.slice(source.lastIndexOf('<div', at), source.indexOf('/>', at) + 2)
  const inThread = source.indexOf('data-testid="laura-chat-slot"', at + 1)

  it('la garde lit l’emplacement', () => {
    expect(at).toBeGreaterThan(0)
    expect(tag).toContain('ref={setLauraChatSlot}')
  })

  it('l’emplacement ne rétrécit pas : la carte garde sa hauteur', () => {
    expect(tag).toContain('shrink-0')
  })

  it('aucune position de surimpression sur l’emplacement', () => {
    expect(tag).not.toMatch(/\b(absolute|fixed|sticky)\b/)
  })

  it('il précède le fil (MessagesArea) dans le flux', () => {
    expect(at).toBeLessThan(source.indexOf('<MessagesArea', at))
  })

  // Recette démo 04/10 (#3192.2) — le fil doit prendre l'essentiel de la hauteur.
  it('fil entamé : l’emplacement se range DANS la boîte défilante, plus au-dessus', () => {
    expect(inThread).toBeGreaterThan(source.indexOf('function MessagesArea'))
    expect(inThread).toBeLessThan(source.indexOf('data-testid="chat-messages-list"') + 2000)
    const before = source.slice(source.lastIndexOf('{messages.length', at), at)
    expect(before).toContain('messages.length === 0')
    const inner = source.slice(source.lastIndexOf('{messages.length', inThread), inThread)
    expect(inner).toContain('messages.length > 0')
  })
})

/**
 * Vu en passant (lot V10, 08/10, recette prod Q #3899) — « Bien démarrer 6/7 »
 * (`<ChatTopSlot />`) se rendait SANS condition en tête de la boîte défilante
 * (juste avant l'emplacement de la carte de Laura ci-dessus) : il revenait
 * donc en tête de CHAQUE fil, même un fil déjà commencé. Un fil qui porte
 * déjà des messages n'a plus besoin d'un en-tête d'activation.
 */
describe('« Bien démarrer » (ChatTopSlot) ne revient pas dans un fil déjà commencé', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chat/view/Chat.tsx'), 'utf8')
  const at = source.indexOf('<ChatTopSlot')

  it('la garde lit l’emplacement', () => {
    expect(at).toBeGreaterThan(0)
  })

  it('n’est monté que sans message — jamais inconditionnellement', () => {
    const before = source.slice(source.lastIndexOf('{messages.length', at), at)
    expect(before).toContain('messages.length === 0')
  })

  it('sait dire NON : il précède toujours l’emplacement de la carte de Laura dans le flux', () => {
    expect(at).toBeLessThan(source.indexOf('data-testid="laura-chat-slot"', at))
  })
})
