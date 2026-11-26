/**
 * 9.3 — « Réécouter » un message vocal : une URL signée de cinq minutes, lue
 * au clic, jamais gardée (ni cache, ni stockage local).
 *
 * ⚠️ jsdom ne lit pas d'audio : on prouve la source posée sur `<audio>`, jamais
 * qu'un son sort d'un haut-parleur.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { VoiceReplay } from './VoiceReplay'

const playbackMock = vi.hoisted(() => vi.fn())
vi.mock('./voice-api', () => ({ fetchVoicePlayback: (...args: unknown[]) => playbackMock(...args) }))

const REPLAY_NAME = 'Réécouter ce message vocal'

function signed(url: string) {
  return { url, expiresAt: '2026-09-13T10:05:00Z', fileName: 'message-vocal.webm' }
}

beforeEach(() => {
  playbackMock.mockReset()
})

describe('9.3 — réécouter', () => {
  it('le clic demande l’URL signée de CE message et la pose sur un lecteur audio', async () => {
    playbackMock.mockResolvedValue(signed('https://stockage.example/objet?jeton=abc'))
    render(<VoiceReplay messageId="m-voice" />)
    fireEvent.click(screen.getByRole('button', { name: REPLAY_NAME }))
    await waitFor(() => expect(document.querySelector('audio')).not.toBeNull())
    expect(playbackMock).toHaveBeenCalledWith('m-voice')
    expect(document.querySelector('audio')?.getAttribute('src')).toBe('https://stockage.example/objet?jeton=abc')
  })

  it('404 → « L’enregistrement n’est plus disponible. »', async () => {
    playbackMock.mockRejectedValue(new ApiError('Aucun enregistrement conservé pour ce message', 404))
    render(<VoiceReplay messageId="m-voice" />)
    fireEvent.click(screen.getByRole('button', { name: REPLAY_NAME }))
    expect(await screen.findByText('L’enregistrement n’est plus disponible.')).toBeInTheDocument()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('autre panne → invitation à réessayer, jamais « plus disponible »', async () => {
    playbackMock.mockRejectedValue(new ApiError('Internal server error', 500))
    render(<VoiceReplay messageId="m-voice" />)
    fireEvent.click(screen.getByRole('button', { name: REPLAY_NAME }))
    expect(await screen.findByText('Impossible de charger l’enregistrement. Réessaie.')).toBeInTheDocument()
    expect(screen.queryByText('L’enregistrement n’est plus disponible.')).not.toBeInTheDocument()
  })

  it('URL signée jamais gardée : fin de lecture → lecteur retiré, nouveau clic → nouvelle demande', async () => {
    playbackMock
      .mockResolvedValueOnce(signed('https://stockage.example/objet?jeton=premier'))
      .mockResolvedValueOnce(signed('https://stockage.example/objet?jeton=second'))
    render(<VoiceReplay messageId="m-voice" />)
    fireEvent.click(screen.getByRole('button', { name: REPLAY_NAME }))
    await waitFor(() => expect(document.querySelector('audio')).not.toBeNull())

    fireEvent.ended(document.querySelector('audio') as HTMLAudioElement)
    await waitFor(() => expect(document.querySelector('audio')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: REPLAY_NAME }))
    await waitFor(() =>
      expect(document.querySelector('audio')?.getAttribute('src')).toBe('https://stockage.example/objet?jeton=second'),
    )
    expect(playbackMock).toHaveBeenCalledTimes(2)
  })
})
