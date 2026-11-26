import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { LauraDock } from './LauraDock'

/**
 * #3775.5 — « une seule Laura dans la page Laura ». Le lanceur flottant ouvre
 * la bulle de Laura ; sur `/chat`, l'espace plein écran EST Laura : un second
 * visage par-dessus la saisie est un doublon, et il recouvre le coin du composeur.
 * Ailleurs, le lanceur reste (et ses préférences d'ouverture avec lui).
 */
// Le routeur de test rend en différé : on lui laisse le temps avant d'affirmer une ABSENCE.
const settle = () => new Promise(resolve => setTimeout(resolve, 80))

describe('LauraDock — lanceur flottant et page /chat', () => {
  it('ne pose aucun lanceur sur /chat', async () => {
    renderWithRouter(<LauraDock />, '/chat')
    await settle()
    expect(screen.queryByRole('button', { name: /ouvrir/i })).not.toBeInTheDocument()
  })

  it('ne pose aucun lanceur sur une sous-route de /chat', async () => {
    renderWithRouter(<LauraDock />, '/chat/abc')
    await settle()
    expect(screen.queryByRole('button', { name: /ouvrir/i })).not.toBeInTheDocument()
  })

  it('garde le lanceur sur une autre page', async () => {
    renderWithRouter(<LauraDock />, '/accounts')
    expect(await screen.findByRole('button', { name: /ouvrir/i })).toBeInTheDocument()
  })

  it('ne confond pas /chats avec /chat', async () => {
    renderWithRouter(<LauraDock />, '/chats')
    expect(await screen.findByRole('button', { name: /ouvrir/i })).toBeInTheDocument()
  })
})
