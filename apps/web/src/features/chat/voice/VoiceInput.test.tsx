/**
 * #1939.1 / #1912.9 / #1939.3 / #1939.5 / #1939.13 — le micro de la zone de saisie.
 *
 * ⚠️ jsdom n'a ni `MediaRecorder` ni `getUserMedia` : doublures explicites. Ne
 * sont PAS prouvés ici : la vraie invite de permission, le voyant système, iOS.
 */
import type { ElementType, ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_VOICE_MESSAGE_RETENTION_DAYS } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import { chooseOption, getSelect, selectedValue } from '@/test/select'
import { VoiceInput } from './VoiceInput'
import { installVoiceMediaFakes, removeVoiceMediaFakes, voiceMediaStream } from './voice-media-test-fakes'

const statusMock = vi.hoisted(() => vi.fn())
const transcribeMock = vi.hoisted(() => vi.fn())
const refinementsMock = vi.hoisted(() => vi.fn())
vi.mock('./voice-api', () => ({
  fetchVoiceStatus: (...args: unknown[]) => statusMock(...args),
  fetchVoiceRefinements: (...args: unknown[]) => refinementsMock(...args),
  transcribeVoiceMessage: (...args: unknown[]) => transcribeMock(...args),
}))
const openMeterMock = vi.hoisted(() => vi.fn())
vi.mock('./voice-level', async importOriginal => ({
  ...(await importOriginal<typeof import('./voice-level')>()),
  openLevelMeter: (...args: unknown[]) => openMeterMock(...args),
}))
const demo = vi.hoisted(() => ({ current: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), toastMock) }))
const reducedMotion = vi.hoisted(() => ({ current: false }))
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_target: unknown, prop: string) =>
        ({
          children,
          animate: _a,
          transition: _t,
          initial: _i,
          ...props
        }: { children?: ReactNode } & Record<string, unknown>) => {
          const Component = prop as ElementType
          return <Component {...props}>{children}</Component>
        },
    },
  ),
  useReducedMotion: () => reducedMotion.current,
}))

const VOICE_ID = '11111111-1111-4111-8111-111111111111'

let getUserMedia: ReturnType<typeof vi.fn>

function installMedia() {
  getUserMedia = installVoiceMediaFakes()
}

const removeMedia = removeVoiceMediaFakes

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  demo.current = false
  reducedMotion.current = false
  openMeterMock.mockReset().mockReturnValue(null)
  statusMock.mockReset().mockResolvedValue(true)
  refinementsMock.mockReset().mockResolvedValue(null)
  transcribeMock.mockReset().mockResolvedValue({
    text: 'Quels signaux sur Airbus ?',
    voiceObjectId: VOICE_ID,
    uncertainSegments: [],
  })
  toastMock.error.mockReset()
  toastMock.info.mockReset()
  installMedia()
})

afterEach(async () => {
  removeMedia()
  await act(async () => {
    await i18n.changeLanguage('fr')
  })
})

function renderInput(overrides: { disabled?: boolean } = {}) {
  const onTranscribed = vi.fn()
  const view = render(
    <VoiceInput conversationKey="fil-1" disabled={overrides.disabled ?? false} onTranscribed={onTranscribed} />,
  )
  return { onTranscribed, ...view }
}

const MIC_NAME = 'Dicter un message vocal'

async function acceptNoticeAndRecord() {
  fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
  fireEvent.click(await screen.findByRole('button', { name: 'Activer le micro' }))
  await screen.findByRole('button', { name: 'Terminer l’enregistrement et le transcrire' })
}

describe('#1939.1 — le micro n’apparaît que si la capacité existe', () => {
  it('capacité absente côté serveur : aucun bouton', async () => {
    statusMock.mockResolvedValue(false)
    renderInput()
    await waitFor(() => expect(statusMock).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: MIC_NAME })).not.toBeInTheDocument()
  })

  it('navigateur sans enregistreur : aucun bouton, et le serveur n’est même pas interrogé', async () => {
    removeMedia()
    renderInput()
    await act(async () => {})
    expect(statusMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: MIC_NAME })).not.toBeInTheDocument()
  })

  it('#1939.13 — espace de démonstration : aucun bouton, aucun appel', async () => {
    demo.current = true
    renderInput()
    await act(async () => {})
    expect(statusMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: MIC_NAME })).not.toBeInTheDocument()
  })

  it('#1912.9 — bouton icône NOMMÉ, 44 px au doigt (GA-30)', async () => {
    renderInput()
    const mic = await screen.findByRole('button', { name: MIC_NAME })
    expect(mic).toHaveAttribute('type', 'button')
    expect(mic.className).toContain('min-h-11')
    expect(mic.className).toContain('min-w-11')
  })

  it('nommé en anglais quand l’interface est en anglais', async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    renderInput()
    expect(await screen.findByRole('button', { name: 'Record a voice message' })).toBeInTheDocument()
  })

  it('pendant un envoi, le micro est inactif', async () => {
    renderInput({ disabled: true })
    expect(await screen.findByRole('button', { name: MIC_NAME })).toBeDisabled()
  })
})

describe('#1939.3 — avant la PREMIÈRE activation, ce qu’on fait de la voix', () => {
  it('conservation (constante du contrat), suppression et réécoute — et le micro n’est PAS demandé avant accord', async () => {
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(`conservé ${CHAT_VOICE_MESSAGE_RETENTION_DAYS} jours, puis supprimé`)
    expect(dialog).toHaveTextContent('peuvent le réécouter')
    expect(getUserMedia).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pas maintenant' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  // #1956.26 — la promesse « il portera la mention dès son premier commit » n'avait
  // pas été tenue (registre du 12/09, réconcilié 16/09) : 0 occurrence de « Assistante
  // IA » dans apps/web/src/features/chat/voice. La notice vue AVANT la première
  // activation est l'endroit — elle dit déjà ce qu'on fait de la voix.
  it('#1956.26 — la notice porte la mention « Assistante IA » (article 50 EU AI Act)', async () => {
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Assistante IA')
  })

  it('accord → micro demandé ; l’activation suivante ne redemande rien', async () => {
    renderInput()
    await acceptNoticeAndRecord()
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler le message vocal sans rien envoyer' }))
    const mic = await screen.findByRole('button', { name: MIC_NAME })
    fireEvent.click(mic)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('#2434.19 — la notice explique aussi comment arrêter l’écoute', async () => {
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('« Terminer » arrête l’écoute et transcrit ce qui a été dit')
  })

  it('#2434.74 / #2434.75 / #2434.77 — la notice NOMME le raffinement non branché (accent, bruit, mélange FR/EN)', async () => {
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('pas encore branchée')
  })

  // #3579.3b — la notice LIT l'état live du serveur : branché, elle ne dit plus « pas encore branchée ».
  it('#3579.3b — accent et bruit branchés côté serveur : la notice le dit, sans « pas encore branchée »', async () => {
    refinementsMock.mockResolvedValue({
      accent: 'robust_model',
      noise: 'robust_model',
      mixedLanguage: 'segment_language',
    })
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveTextContent('modèle de reconnaissance robuste'))
    expect(dialog).not.toHaveTextContent('pas encore branchée')
  })

  it('#3579.3b — état illisible (null) : la notice garde la mention prudente « pas encore branchée »', async () => {
    refinementsMock.mockResolvedValue(null)
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('pas encore branchée')
  })
})

describe('#2434.21 — permission micro déjà refusée : un état distinct et persistant', () => {
  function installDeniedPermission() {
    const query = vi.fn().mockResolvedValue({ state: 'denied', onchange: null })
    Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true })
    return query
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'permissions')
  })

  const HINT = 'Micro refusé — clique sur le cadenas à côté de l’adresse, autorise le micro, puis recharge la page.'

  async function renderDeniedAndTapMic() {
    installDeniedPermission()
    const view = renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    return view
  }

  it('X37 / #3443 — au repos, refus du navigateur : AUCUNE mention en permanence sous le composeur', async () => {
    installDeniedPermission()
    renderInput()
    await act(async () => {})
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: MIC_NAME })).toBeInTheDocument()
  })

  it('X37 / #3443 — la mention n’apparaît qu’APRÈS un geste micro, sans jamais redemander le micro', async () => {
    await renderDeniedAndTapMic()
    expect(await screen.findByText(HINT)).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('X37 / #3443 — la mention disparaît au prochain envoi', async () => {
    const { rerender, onTranscribed } = await renderDeniedAndTapMic()
    await screen.findByText(HINT)
    rerender(<VoiceInput conversationKey="fil-1" disabled onTranscribed={onTranscribed} />)
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('sans l’API Permissions du navigateur (Safari) : le bouton micro ordinaire reste', async () => {
    // Pas de `navigator.permissions` installé ici — repli sur le comportement actuel.
    renderInput()
    expect(await screen.findByRole('button', { name: MIC_NAME })).toBeInTheDocument()
  })

  it('#3541 — la mention se masque : plus jamais un état permanent sans issue', async () => {
    await renderDeniedAndTapMic()
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Masquer ce message' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('#3541 — masquée une fois, elle reste masquée au remontage du composeur (même session)', async () => {
    const first = await renderDeniedAndTapMic()
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Masquer ce message' }))
    first.unmount()
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('#3355 (LAU-UI-307) — la mention se lit comme une PASTILLE intégrée, pas comme du texte brut posé dans la barre', async () => {
    await renderDeniedAndTapMic()
    const status = await screen.findByRole('status')
    expect(status.className).toMatch(/rounded-full/)
    expect(status.className).toMatch(/bellum-surface-2/)
  })
})

describe('#1939.5 / .6 / .7 — pendant l’enregistrement', () => {
  it('indicateur d’écoute, chronomètre sur la durée maximale, « Annuler » disponible', async () => {
    renderInput()
    await acceptNoticeAndRecord()
    expect(screen.getByText('J’écoute')).toBeInTheDocument()
    expect(screen.getByText('0:00 / 1:30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler le message vocal sans rien envoyer' })).toBeInTheDocument()
    expect(screen.getByTestId('voice-listening-indicator')).toHaveAttribute('data-motion', 'breathe')
  })

  it('mouvement réduit demandé : l’indicateur ne se déplace pas (repli `reduced`)', async () => {
    reducedMotion.current = true
    renderInput()
    await acceptNoticeAndRecord()
    expect(screen.getByTestId('voice-listening-indicator')).toHaveAttribute('data-motion', 'reduced')
  })

  it('#2434.83 — « J’écoute » est ANNONCÉ (role="status"), le chronomètre ne l’est pas', async () => {
    renderInput()
    await acceptNoticeAndRecord()
    expect(screen.getByText('J’écoute')).toHaveAttribute('role', 'status')
    // Le test qui dit NON — un chronomètre qui change toutes les 250 ms ne doit
    // JAMAIS porter de live region : le réannoncer à ce rythme harcèlerait.
    expect(screen.getByText('0:00 / 1:30')).not.toHaveAttribute('role', 'status')
  })

  it('« Annuler » coupe le micro et ne transcrit rien', async () => {
    const { onTranscribed } = renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler le message vocal sans rien envoyer' }))
    expect(voiceMediaStream().tracks[0]?.stop).toHaveBeenCalled()
    await act(async () => {})
    expect(transcribeMock).not.toHaveBeenCalled()
    expect(onTranscribed).not.toHaveBeenCalled()
  })
})

describe('#3455 — « la wave enregistre rien » : la dictée prouve que le micro capte', () => {
  it('un niveau mesuré : une jauge visible pendant l’enregistrement', async () => {
    openMeterMock.mockReturnValue({ read: () => 0.2, close: vi.fn() })
    renderInput()
    await acceptNoticeAndRecord()
    await waitFor(() => expect(screen.getByRole('meter')).toBeInTheDocument())
    expect(screen.getByRole('meter')).toHaveAccessibleName()
  })

  it('le test qui dit NON : sans mesure possible (pas de Web Audio), aucune jauge — jamais une jauge à 0', async () => {
    renderInput()
    await acceptNoticeAndRecord()
    expect(screen.getByText('J’écoute')).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })
})

describe('#1939.4 — la transcription est rendue à la saisie', () => {
  it('« Terminer » : le texte et l’enregistrement sont rendus à l’appelant, rien d’autre ne part', async () => {
    const { onTranscribed } = renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() =>
      expect(onTranscribed).toHaveBeenCalledWith({
        text: 'Quels signaux sur Airbus ?',
        voiceObjectId: VOICE_ID,
        uncertainSegments: [],
      }),
    )
  })
})

describe('#2434.74/.75/.77 — la langue transmise à la dictée, et la langue détectée affichée', () => {
  it('le réglage par défaut suit l’interface, et se transmet à la transcription', async () => {
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ language: 'fr' })))
  })

  it('choisir « Détecter automatiquement » envoie `auto`, et le réglage survit à un remontage (retenu par personne)', async () => {
    renderInput()
    await screen.findByLabelText('Langue de la dictée')
    await chooseOption(getSelect('Langue de la dictée'), 'auto')
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ language: 'auto' })))

    renderInput()
    expect(await selectedValue(screen.getAllByLabelText('Langue de la dictée').at(-1)!)).toBe('auto')
  })

  it('la langue détectée n’est PAS annoncée (retour du 30/09 : bruit à chaque message vocal)', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Hello Laura',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
    })
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: /Dicter/ })).toBeTruthy())
    expect(toastMock.info).not.toHaveBeenCalled()
  })
})

describe('#2434.40 — Whisper ne rend aucun score par mot : les passages douteux s’annoncent', () => {
  it('les segments sous le seuil (rendus par le serveur) sont signalés — la saisie reste éditable', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Prépare une relance pour Nova Logistique',
      voiceObjectId: VOICE_ID,
      uncertainSegments: ['pour Nova Logistique'],
    })
    const { onTranscribed } = renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() =>
      expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('pour Nova Logistique'), expect.anything()),
    )
    // #1939.4 — le texte reste posé dans la saisie, éditable, jamais bloqué par le doute.
    expect(onTranscribed).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Prépare une relance pour Nova Logistique' }),
    )
  })

  it('aucun segment douteux : aucune annonce', async () => {
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    expect(toastMock.info).not.toHaveBeenCalled()
  })
})

describe('#2434.40 / #2434.85 — le mot incertain est SOULIGNÉ, jamais un pourcentage', () => {
  it('affiche les mots marqués incertains par le fournisseur, et rien quand aucun ne l’est', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Prépare une relance pour Belhadi',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
      words: [
        { text: 'Prépare', uncertain: false },
        { text: 'Belhadi', uncertain: true },
      ],
    })
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await screen.findByText('Belhadi')
    // Le test qui dit NON : un mot marqué confiant n'apparaît pas dans la liste soulignée.
    expect(screen.queryByText('42%')).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('sans `words` dans la réponse (compte rendu de rendez-vous, ancien serveur) : rien d’affiché, rien de deviné', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Bonjour',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
    })
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(transcribeMock).toHaveBeenCalled())
    expect(screen.queryByText('À vérifier avant d’envoyer :')).not.toBeInTheDocument()
  })

  it('change de fil : les mots soulignés du fil précédent disparaissent', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Belhadi',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
      words: [{ text: 'Belhadi', uncertain: true }],
    })
    const onTranscribed = vi.fn()
    const { rerender } = render(<VoiceInput conversationKey="fil-1" disabled={false} onTranscribed={onTranscribed} />)
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await screen.findByText('Belhadi')
    rerender(<VoiceInput conversationKey="fil-2" disabled={false} onTranscribed={onTranscribed} />)
    expect(screen.queryByText('Belhadi')).not.toBeInTheDocument()
  })
})

describe('#1939.2 / #1939.13 — les refus disent une phrase humaine', () => {
  it('permission du micro refusée : message clair', async () => {
    getUserMedia.mockRejectedValue(new DOMException('refusé', 'NotAllowedError'))
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: 'Activer le micro' }))
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('Accès au micro refusé'), expect.anything()),
    )
  })

  it.each([
    [429, 'Ce que tu as tapé reste dans la saisie'],
    [503, 'Les messages vocaux sont indisponibles pour le moment'],
    [413, 'au plus 90 secondes'],
    [400, 'Je n’ai pas pu transcrire cet enregistrement'],
  ] as const)('HTTP %i → « %s… »', async (status, phrase) => {
    transcribeMock.mockRejectedValue(new ApiError('refus du serveur en français', status))
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining(phrase), expect.anything()),
    )
    expect(toastMock.error).not.toHaveBeenCalledWith(expect.stringContaining('refus du serveur'), expect.anything())
  })
})

// #2434.28 / #2434.29 — le toast (`sonner`) disparaît seul au bout de quelques
// secondes (`TOAST_PROBLEM_MS`) : la raison de l'échec doit rester lisible sans
// courir après le toast, jusqu'à la prochaine tentative — un état PERSISTANT,
// à la différence du refus de permission (#2434.21, déjà son propre état) qui
// reste géré séparément.
describe('#2434.28 / #2434.29 — l’échec reste visible après le toast, distinct hors-ligne', () => {
  it('#2434.28 — une erreur générique reste affichée à côté du micro, au-delà du toast', async () => {
    transcribeMock.mockRejectedValue(new ApiError('refus du serveur en français', 400))
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await screen.findByRole('button', { name: MIC_NAME })
    const message = await screen.findByText(
      'Je n’ai pas pu transcrire cet enregistrement. Rapproche-toi du micro et réessaie, ou tape ta question.',
    )
    expect(message).toBeInTheDocument()
    // #2434.83 — annoncée aux lecteurs d'écran, pas seulement visible.
    expect(message.closest('[role="status"]')).not.toBeNull()
  })

  it('#2434.29 — une panne réseau porte une mention distincte « hors-ligne »', async () => {
    transcribeMock.mockRejectedValue(new TypeError('Failed to fetch'))
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await screen.findByRole('button', { name: MIC_NAME })
    expect(
      await screen.findByText(
        'Connexion perdue — l’enregistrement n’a pas été envoyé. Vérifie ta connexion, puis réessaie.',
      ),
    ).toBeInTheDocument()
  })

  it('retenter (réappuyer sur le micro) efface la mention persistante', async () => {
    transcribeMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderInput()
    await acceptNoticeAndRecord()
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await screen.findByText(
      'Connexion perdue — l’enregistrement n’a pas été envoyé. Vérifie ta connexion, puis réessaie.',
    )

    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Connexion perdue — l’enregistrement n’a pas été envoyé. Vérifie ta connexion, puis réessaie.',
        ),
      ).not.toBeInTheDocument(),
    )
  })

  it('le refus de permission (#2434.21) garde son propre état, jamais cette mention générique', async () => {
    getUserMedia.mockRejectedValue(new DOMException('refusé', 'NotAllowedError'))
    renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: 'Activer le micro' }))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(
      screen.queryByText(
        'Accès au micro refusé. Autorise le micro pour ce site dans les réglages de ton navigateur, ou tape ta question.',
      ),
    ).not.toBeInTheDocument()
  })
})

describe('#4536.1 — revient sur #2434.1 : la dictée ne fait QUE dicter', () => {
  it('aucun interrupteur « conversation continue » : un seul micro à côté du sélecteur de langue', async () => {
    renderInput()
    await screen.findByRole('button', { name: MIC_NAME })
    expect(screen.queryByRole('button', { name: /conversation vocale continue/i })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-pressed]')).toBeNull()
  })

  it('#1939.10 / #3457 — une transcription pose le texte UNE fois (`onTranscribed`), rien d’autre ne part', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Bonjour',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
      words: [],
    })
    const { onTranscribed } = renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: 'Activer le micro' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledTimes(1))
  })

  // #2319.58 — aucun `start()` depuis un effet React : le micro ne se rouvre jamais seul.
  it('le micro ne se ROUVRE JAMAIS tout seul après une dictée', async () => {
    transcribeMock.mockResolvedValue({
      text: 'Bonjour',
      voiceObjectId: VOICE_ID,
      uncertainSegments: [],
      words: [],
    })
    const { onTranscribed, rerender } = renderInput()
    fireEvent.click(await screen.findByRole('button', { name: MIC_NAME }))
    fireEvent.click(await screen.findByRole('button', { name: 'Activer le micro' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Terminer l’enregistrement et le transcrire' }))
    await waitFor(() => expect(onTranscribed).toHaveBeenCalled())
    rerender(<VoiceInput conversationKey="fil-1" disabled onTranscribed={onTranscribed} />)
    rerender(<VoiceInput conversationKey="fil-1" disabled={false} onTranscribed={onTranscribed} />)
    await act(async () => {})
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: MIC_NAME })).toBeInTheDocument()
  })
})
