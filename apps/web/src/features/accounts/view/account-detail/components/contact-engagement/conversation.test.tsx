import type { Contact, MessageGrounding } from '@bellum/contracts'
import { act, renderHook, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import { useEngagementConversation } from './conversation'
import { createEngagementDraftStore } from './draft-store'
import type { ContactMessage } from './types'

// P0-05 — a failed generation must be recoverable INLINE (not a transient toast
// that loses the typed angle). The credit is never charged for generation, so
// retrying is free.

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const contact = { id: 'c1', full_name: 'Olivier Roussat' } as unknown as Contact
// `phone` + empty script → no initial draft entry, so the thread starts empty.
const message: ContactMessage = {
  linkedinMessage: '',
  linkedinSequence: [],
  emailSubject: '',
  emailBody: '',
  phoneScript: '',
}

const rolesOf = (entries: { role: string }[]) => entries.map(e => e.role)

/**
 * p10 — « M1 / M2 / M3, stop après 3 messages ». Le fil de conversation est la
 * surface exacte de cette règle : le commercial voit les trois temps dans
 * l'ordre où il les enverra, au lieu d'un M1 seul suivi de rien.
 */
describe('useEngagementConversation — la séquence LinkedIn p10 ouvre le fil', () => {
  beforeEach(() => apiFetch.mockReset())

  it('seed le fil avec M1 puis M2 et M3, dans l’ordre', () => {
    const sequence: ContactMessage = {
      ...message,
      linkedinMessage: 'M1',
      linkedinSequence: ['M2', 'M3'],
    }
    const { result } = renderHook(() => useEngagementConversation({ channel: 'linkedin', contact, message: sequence }))

    expect(result.current.entries.map(entry => ('text' in entry ? entry.text : ''))).toEqual(['M1', 'M2', 'M3'])
  })

  it('n’ajoute rien au fil des autres canaux', () => {
    // La séquence est une règle LinkedIn (p10). L'email a sa propre cadence
    // (p12) et le téléphone son script (p11) — y déverser M2/M3 serait faux.
    const sequence: ContactMessage = {
      ...message,
      emailBody: 'Corps email',
      linkedinSequence: ['M2', 'M3'],
    }
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message: sequence }))

    expect(result.current.entries).toHaveLength(1)
  })

  it('rend un fil identique à avant pour un dossier sans séquence', () => {
    const legacy: ContactMessage = { ...message, linkedinMessage: 'M1 seul' }
    const { result } = renderHook(() => useEngagementConversation({ channel: 'linkedin', contact, message: legacy }))

    expect(result.current.entries).toHaveLength(1)
  })
})

describe('useEngagementConversation — inline failure + retry (P0-05)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('surfaces a failed generation as an inline error entry, keeping the prompt', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })

    await waitFor(() => expect(result.current.entries.some(e => e.role === 'error')).toBe(true))
    expect(result.current.entries.filter(e => e.role === 'user')).toHaveLength(1)
    expect(result.current.entries.filter(e => e.role === 'error')).toHaveLength(1)
    expect(result.current.generationStep).toBeNull()
  })

  // #4062.2 — un échec de génération ne perd pas la consigne tapée.
  it('#4062.2 — un échec de génération rend la consigne au champ', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    act(() => result.current.setContext('angle migration cloud'))
    await act(async () => {
      await result.current.generateDraft()
    })
    await waitFor(() => expect(result.current.entries.some(e => e.role === 'error')).toBe(true))
    expect(result.current.context).toBe('angle migration cloud')
  })

  // #3418 / #3550.1 — recette prod 02/10 : deux « Générer » en échec laissaient
  // DEUX blocs identiques (consigne + « La génération du message a échoué »).
  // Une nouvelle tentative remplace la tentative échouée, elle ne s'empile pas.
  it('#3550.1 — une 2e génération en échec ne laisse qu’UN bloc consigne + erreur', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })
    await act(async () => {
      await result.current.generateDraft()
    })
    expect(rolesOf(result.current.entries)).toEqual(['user', 'error'])
  })

  it('#3458 — un refus nommé du moteur garde sa raison dans la bulle d’erreur', async () => {
    const reason = 'packet de contexte insuffisant pour personnaliser'
    apiFetch.mockRejectedValueOnce(new ApiError(reason, 422, 'message_refused'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })

    const entry = result.current.entries.find(e => e.role === 'error') as { reason?: string } | undefined
    expect(entry?.reason).toBe(reason)
  })

  it('#3418 — un NO-GO du compte (409) garde sa phrase, au lieu du message générique', async () => {
    const reason = 'Compte NO-GO : pas de relance sans nouveau motif.'
    apiFetch.mockRejectedValueOnce(new ApiError(reason, 409, 'account_no_go'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })

    const entry = result.current.entries.find(e => e.role === 'error') as { reason?: string } | undefined
    expect(entry?.reason).toBe(reason)
  })

  it('#4609.4 — une session expirée (401/403) se dit « session expirée », jamais « introuvable »', async () => {
    for (const status of [401, 403]) {
      apiFetch.mockRejectedValueOnce(new ApiError('Unauthorized', status))
      const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

      await act(async () => {
        await result.current.generateDraft()
      })

      const entry = result.current.entries.find(e => e.role === 'error') as { reason?: string } | undefined
      expect(entry?.reason).toBe(i18n.t('engagement:generation.sessionExpired'))
      expect(entry?.reason).not.toMatch(/introuvable|not found/i)
    }
  })

  it('#4962 — 503 / 502 / délai dépassé se disent « service momentanément indisponible »', async () => {
    const failures = [
      new ApiError('Service indisponible', 503, 'message_upstream_error'),
      new ApiError('Bad gateway', 502),
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    ]
    for (const failure of failures) {
      apiFetch.mockRejectedValueOnce(failure)
      const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))
      await act(async () => {
        await result.current.generateDraft()
      })
      const entry = result.current.entries.find(e => e.role === 'error') as { reason?: string } | undefined
      expect(entry?.reason).toBe(i18n.t('engagement:generation.unavailable'))
    }
  })

  it('#4962 — un 429 se dit « trop de rédactions en une minute »', async () => {
    apiFetch.mockRejectedValueOnce(new ApiError('Too Many Requests', 429))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))
    await act(async () => {
      await result.current.generateDraft()
    })
    const entry = result.current.entries.find(e => e.role === 'error') as { reason?: string } | undefined
    expect(entry?.reason).toBe(i18n.t('engagement:generation.rateLimited'))
  })

  it('retry replays the stored angle, drops the error, and does not duplicate the prompt', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    act(() => result.current.setContext('angle cybersécurité'))
    await act(async () => {
      await result.current.generateDraft()
    })
    const errorEntry = result.current.entries.find(e => e.role === 'error')
    expect(errorEntry).toBeDefined()
    // The failed attempt stored the angle for a verbatim replay.
    expect((errorEntry as { angle: string }).angle).toBe('angle cybersécurité')

    apiFetch.mockResolvedValue({ success: true, data: { channel: 'phone', subject: '', body: 'Bonjour Olivier…' } })
    await act(async () => {
      await result.current.retryDraft(errorEntry as Parameters<typeof result.current.retryDraft>[0])
    })

    await waitFor(() => expect(result.current.entries.some(e => e.role === 'assistant')).toBe(true))
    expect(result.current.entries.filter(e => e.role === 'error')).toHaveLength(0)
    // Still exactly one prompt bubble — the retry did NOT re-append it.
    expect(result.current.entries.filter(e => e.role === 'user')).toHaveLength(1)
    // Order: prompt then the freshly generated assistant draft.
    expect(rolesOf(result.current.entries)).toEqual(['user', 'assistant'])
  })
})

// #1926.28-.31, #1925 — la matière de « pourquoi ce message » voyage jusqu'au
// brouillon affiché, et les deux gestes de régénération (angle alternatif,
// changement de ton) réutilisent le MÊME chemin `/ia/message` que « Générer ».
describe('useEngagementConversation — pourquoi ce message (#1926.28-.31, #1925)', () => {
  beforeEach(() => apiFetch.mockReset())

  const FULL_RESPONSE = {
    success: true,
    data: {
      channel: 'email',
      subject: 'Objet',
      body: 'Corps du message.',
      rationale: 'Le compte a récemment recruté sur la cybersécurité.',
      alternativeAngle: "L'autre angle : le renouvellement du contrat cloud.",
      brief: { objective: 'ouverture_compte', missing: [] },
      specificity: {
        status: 'specifique',
        count: 2,
        minimum: 2,
        elements: [{ kind: 'precise_contact', value: 'Camille Martin' }],
        unavailable: [],
      },
      toneOptions: [{ id: 'tutoiement', instruction: 'tutoiement' }],
    },
  }

  it('porte rationale / alternativeAngle / brief / specificity / toneOptions sur le brouillon généré', async () => {
    apiFetch.mockResolvedValue(FULL_RESPONSE)
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })

    const draft = result.current.entries.find(e => e.role === 'assistant') as unknown as {
      rationale?: string
      alternativeAngle?: string
      brief?: { objective: string }
      specificity?: { status: string }
      toneOptions?: { id: string }[]
    }
    expect(draft.rationale).toBe(FULL_RESPONSE.data.rationale)
    expect(draft.alternativeAngle).toBe(FULL_RESPONSE.data.alternativeAngle)
    expect(draft.brief?.objective).toBe('ouverture_compte')
    expect(draft.specificity?.status).toBe('specifique')
    expect(draft.toneOptions).toEqual([{ id: 'tutoiement', instruction: 'tutoiement' }])
  })

  it('ne casse rien sur une réponse d’API ancienne, sans aucun de ces champs', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { channel: 'email', subject: 'Objet', body: 'Corps.' } })
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })

    const draft = result.current.entries.find(e => e.role === 'assistant') as unknown as { rationale?: string }
    expect(draft).toBeDefined()
    expect(draft.rationale).toBeUndefined()
  })

  it('« utiliser cet angle » régénère avec l’angle alternatif, verbatim', async () => {
    apiFetch.mockResolvedValue(FULL_RESPONSE)
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))

    await act(async () => {
      await result.current.useAlternativeAngle(FULL_RESPONSE.data.alternativeAngle)
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch.mock.calls[0]?.[0]).toMatchObject({
      body: { contactId: contact.id, channel: 'email', context: FULL_RESPONSE.data.alternativeAngle },
    })
    // Le nouveau brouillon s'ajoute au fil, il ne le remplace pas.
    expect(result.current.entries.filter(e => e.role === 'assistant')).toHaveLength(1)
  })

  it('« changer le ton » AJOUTE l’instruction à l’angle qui a produit le brouillon courant', async () => {
    apiFetch.mockResolvedValueOnce(FULL_RESPONSE)
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))

    act(() => result.current.setContext('migration cloud'))
    await act(async () => {
      await result.current.generateDraft()
    })
    const currentDraft = result.current.entries.find(e => e.role === 'assistant')!

    apiFetch.mockResolvedValueOnce({ success: true, data: { channel: 'email', subject: '', body: 'Version tu.' } })
    await act(async () => {
      await result.current.changeTone(currentDraft as Parameters<typeof result.current.changeTone>[0], {
        id: 'tutoiement',
        instruction: 'tutoiement',
      })
    })

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch.mock.calls[1]?.[0]).toMatchObject({
      body: { contactId: contact.id, channel: 'email', context: 'migration cloud tutoiement' },
    })
  })
})

// #4524.2 — « Sur quoi Laura s'appuie » : les faits cochés partent avec CHAQUE génération du fil ; sans choix, la clé
// est omise et le corps reste celui d'avant.
describe('useEngagementConversation — le choix « Sur quoi Laura s’appuie » (#4524.2)', () => {
  beforeEach(() => apiFetch.mockReset())
  const reply = { success: true, data: { channel: 'email', subject: '', body: 'Brouillon.' } }

  it('envoie `grounding` quand le commercial a choisi', async () => {
    apiFetch.mockResolvedValue(reply)
    const grounding: MessageGrounding = {
      mode: 'facts',
      facts: [{ kind: 'account_signal', label: 'Cession', proof: 'Les Echos' }],
    }
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message, grounding }))
    await act(async () => {
      await result.current.generateDraft()
    })
    expect((apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body.grounding).toEqual(grounding)
  })

  it('sans choix, la clé est omise — corps identique à avant', async () => {
    apiFetch.mockResolvedValue(reply)
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    await act(async () => {
      await result.current.generateDraft()
    })
    expect((apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body).not.toHaveProperty('grounding')
  })
})

// #2204.59-.65 (épopée #2947) — le style CHOISI dans le composer part avec la
// génération ; sans choix, la clé est omise et le corps reste celui d'avant.
// Un changement de CANAL invalide le choix précédent (un style porte un canal).
describe('useEngagementConversation — le style de message (#2204.59-.65)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('envoie `messageStyleTemplateId` une fois choisi', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { channel: 'email', subject: '', body: 'Brouillon.' } })
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    act(() => result.current.setStyleTemplateId('11111111-1111-4111-8111-111111111111'))
    await act(async () => {
      await result.current.generateDraft()
    })
    const body = (apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body
    expect(body.messageStyleTemplateId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('sans style choisi, la clé est omise — corps identique à avant', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { channel: 'email', subject: '', body: 'Brouillon.' } })
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    await act(async () => {
      await result.current.generateDraft()
    })
    const body = (apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body
    expect(body).not.toHaveProperty('messageStyleTemplateId')
  })

  it('changer de canal réinitialise le style choisi — un style porte un canal', async () => {
    const { result, rerender } = renderHook(
      ({ channel }: { channel: 'email' | 'linkedin' }) => useEngagementConversation({ channel, contact, message }),
      { initialProps: { channel: 'email' } },
    )
    act(() => result.current.setStyleTemplateId('11111111-1111-4111-8111-111111111111'))
    expect(result.current.styleTemplateId).toBe('11111111-1111-4111-8111-111111111111')

    rerender({ channel: 'linkedin' })
    expect(result.current.styleTemplateId).toBeNull()
  })
})

// #2123.61-.68 — les paramètres CHOISIS dans le formulaire partent avec la
// génération ; sans choix, la clé est omise et le corps reste celui d'avant.
describe('useEngagementConversation — les paramètres du message (#2123.61-.68)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('envoie les seuls paramètres renseignés, rognés', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { channel: 'phone', subject: '', body: 'Bonjour Olivier…' } })
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))
    act(() => result.current.setParameters({ objective: 'relance', proof: '  REX assureur ', offer: '' }))
    await act(async () => {
      await result.current.generateDraft()
    })
    const body = (apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body
    expect(body.parameters).toEqual({ objective: 'relance', proof: 'REX assureur' })
  })

  it('témoin : sans paramètre choisi, la clé ne part pas', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { channel: 'phone', subject: '', body: 'Bonjour Olivier…' } })
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))
    await act(async () => {
      await result.current.generateDraft()
    })
    const body = (apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body
    expect(body).not.toHaveProperty('parameters')
  })
})

/**
 * #2123.59 — décision Louis 15/09 : le brouillon se GÉNÈRE dès que l'objectif
 * est choisi (un appel modèle par choix). #3695 (05/10) : la version précédente
 * est CONSERVÉE à chaque nouvel objectif, pour comparer ou revenir. `/ia/message` ne débite aucun crédit : aucun coût à
 * annoncer avant (GA-49/86 ne s'appliquent qu'à un débit).
 */
describe('preset e-mail (#3694)', () => {
  it('ne force aucun rendez-vous, ni en FR ni en EN', () => {
    for (const lng of ['fr', 'en']) {
      const locale = JSON.parse(
        readFileSync(join(__dirname, `../../../../../../i18n/locales/${lng}/engagement.json`), 'utf8'),
      ) as { preset: { email: string } }
      const text = locale.preset.email.toLowerCase()
      expect(text).not.toMatch(/rendez-vous|meeting|appointment|rdv/)
    }
  })
})

describe('useEngagementConversation — choisir un objectif génère le brouillon (#2123.59)', () => {
  beforeEach(() => apiFetch.mockReset())
  const draft = (body: string) => ({ success: true, data: { channel: 'phone', subject: '', body } })
  const texts = (entries: { role: string }[]) => entries.map(entry => ('text' in entry ? entry.text : entry.role))

  it('le choix d’un objectif lance UNE génération avec cet objectif, sans bulle de consigne', async () => {
    apiFetch.mockResolvedValue(draft('Brouillon de relance'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const body = (apiFetch.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body
    expect(body.parameters).toEqual({ objective: 'relance' })
    expect(texts(result.current.entries)).toEqual(['Brouillon de relance'])
    expect(result.current.parameters).toEqual({ objective: 'relance' })
  })

  it('changer d’objectif CONSERVE le brouillon précédent — comparer, revenir (#3695)', async () => {
    apiFetch.mockResolvedValueOnce(draft('Brouillon A')).mockResolvedValueOnce(draft('Brouillon B'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })
    await act(async () => {
      await result.current.chooseParameters({ objective: 'nurturing' })
    })

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(texts(result.current.entries)).toEqual(['Brouillon A', 'Brouillon B'])
  })

  it('SAIT DIRE NON — un autre paramètre, le même objectif ou un objectif vidé ne lancent rien', async () => {
    apiFetch.mockResolvedValue(draft('Brouillon'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    act(() => {
      expect(result.current.chooseParameters({ proof: 'REX assureur' })).toBeNull()
    })
    act(() => {
      expect(result.current.chooseParameters({ proof: 'REX assureur', objective: '' })).toBeNull()
    })
    await act(async () => {
      await result.current.chooseParameters({ proof: 'REX assureur', objective: 'relance' })
    })
    act(() => {
      expect(result.current.chooseParameters({ proof: 'Autre preuve', objective: 'relance' })).toBeNull()
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('l’APPELANT — le composer du dossier branche le choix sur la génération, pas sur le simple setter', () => {
    const panel = readFileSync(join(__dirname, 'EngagementPanel.tsx'), 'utf8')
    expect(panel.length).toBeGreaterThan(1000)
    expect(panel).toContain('conversation.chooseParameters(next)')
    expect(panel).not.toContain('onParametersChange={conversation.setParameters}')
  })

  it('un brouillon demandé À LA MAIN reste dans le fil — seul le brouillon d’objectif se remplace', async () => {
    apiFetch.mockResolvedValueOnce(draft('Brouillon manuel')).mockResolvedValueOnce(draft('Brouillon objectif'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.generateDraft()
    })
    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })

    await waitFor(() => expect(texts(result.current.entries)).toContain('Brouillon objectif'))
    expect(texts(result.current.entries)).toContain('Brouillon manuel')
  })
})

/**
 * #3696 — lire, corriger et reprendre un message dans un espace stable : une
 * correction manuelle n'est jamais écrasée par une variante, fermer le panneau
 * ne jette rien, un autre contact n'hérite jamais du brouillon d'un autre.
 */
describe('useEngagementConversation — corrections et reprise (#3696)', () => {
  beforeEach(() => apiFetch.mockReset())
  const draft = (body: string) => ({ success: true, data: { channel: 'phone', subject: '', body } })
  const texts = (entries: { role: string }[]) => entries.map(entry => ('text' in entry ? entry.text : entry.role))

  it('#3696.3 — un brouillon d’objectif corrigé à la main n’est PAS remplacé par la variante suivante', async () => {
    apiFetch.mockResolvedValueOnce(draft('Brouillon A')).mockResolvedValueOnce(draft('Brouillon B'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })
    const first = result.current.entries[0]!
    act(() => result.current.editEntry(first.id, { subject: '', body: 'Brouillon A corrigé' }))
    await act(async () => {
      await result.current.chooseParameters({ objective: 'nurturing' })
    })

    expect(texts(result.current.entries)).toEqual(['Brouillon A', 'Brouillon B'])
    expect(result.current.entries[0]).toMatchObject({ edited: { body: 'Brouillon A corrigé' } })
  })

  it('#3696.4 — fermer puis rouvrir rend le fil, la correction, la saisie et le brief', async () => {
    apiFetch.mockResolvedValueOnce(draft('Brouillon A'))
    const drafts = createEngagementDraftStore()
    const first = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message, drafts }))
    await act(async () => {
      await first.result.current.chooseParameters({ objective: 'relance' })
    })
    act(() => first.result.current.editEntry(first.result.current.entries[0]!.id, { subject: '', body: 'Corrigé' }))
    act(() => first.result.current.setContext('angle tapé non envoyé'))
    // « Fermer » : le panneau se démonte, aucun MESSAGE n'est envoyé — mais le
    // brouillon est désormais enregistré côté serveur (#3694.7), un second
    // appel `apiFetch` (la sauvegarde, jamais une génération).
    first.unmount()

    const second = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message, drafts }))

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(second.result.current.entries[0]).toMatchObject({ text: 'Brouillon A', edited: { body: 'Corrigé' } })
    expect(second.result.current.context).toBe('angle tapé non envoyé')
    expect(second.result.current.parameters).toEqual({ objective: 'relance' })
  })

  it('#3696.5 — changer de contact n’attribue JAMAIS le brouillon (ni le brief) de l’ancien au nouveau', async () => {
    apiFetch.mockResolvedValueOnce(draft('Brouillon pour Olivier'))
    const drafts = createEngagementDraftStore()
    const other = { id: 'c2', full_name: 'Autre Contact' } as unknown as Contact
    const { result, rerender } = renderHook(
      ({ who }: { who: Contact }) => useEngagementConversation({ channel: 'phone', contact: who, message, drafts }),
      { initialProps: { who: contact } },
    )
    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })
    expect(texts(result.current.entries)).toEqual(['Brouillon pour Olivier'])

    rerender({ who: other })

    await waitFor(() => expect(result.current.entries).toEqual([]))
    expect(result.current.parameters).toEqual({})
    expect(drafts.get('c2:phone')?.entries ?? []).toEqual([])
    // Revenir au premier contact retrouve SON brouillon, pas celui d'un autre.
    rerender({ who: contact })
    await waitFor(() => expect(texts(result.current.entries)).toEqual(['Brouillon pour Olivier']))
  })

  it('#3696.5 — une réponse tardive d’un ancien contact ne remplace pas le fil du nouveau', async () => {
    let resolveLate: (value: unknown) => void = () => undefined
    apiFetch.mockReturnValueOnce(new Promise(resolve => (resolveLate = resolve)))
    const other = { id: 'c2', full_name: 'Autre Contact' } as unknown as Contact
    const { result, rerender } = renderHook(
      ({ who }: { who: Contact }) => useEngagementConversation({ channel: 'phone', contact: who, message }),
      { initialProps: { who: contact } },
    )
    let pending: Promise<void> | null = null
    act(() => {
      pending = result.current.chooseParameters({ objective: 'relance' })
    })
    rerender({ who: other })
    await act(async () => {
      resolveLate(draft('Réponse tardive'))
      await pending
    })

    expect(texts(result.current.entries)).toEqual([])
  })
})

/**
 * #3696.8 — « Fermer » n'interrompt pas une génération en vol : sa réponse est
 * rangée sous le contact et le canal qui l'ont demandée, et l'écran DIT qu'elle
 * court encore. Elle ne remplace jamais le texte d'un autre fil.
 */
describe('useEngagementConversation — la génération continue après « Fermer » (#3696.8)', () => {
  beforeEach(() => apiFetch.mockReset())
  const draft = (body: string) => ({ success: true, data: { channel: 'phone', subject: '', body } })
  const texts = (entries: { role: string }[]) => entries.map(entry => ('text' in entry ? entry.text : entry.role))
  const deferred = () => {
    let resolve: (value: unknown) => void = () => undefined
    const promise = new Promise(done => (resolve = done))
    return { promise, resolve }
  }

  it('la réponse tardive est rangée sous SA clé, le panneau rouvert la retrouve sans second appel', async () => {
    const late = deferred()
    apiFetch.mockReturnValueOnce(late.promise)
    const drafts = createEngagementDraftStore()
    const first = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message, drafts }))
    let pending: Promise<void> | null = null
    act(() => {
      pending = first.result.current.chooseParameters({ objective: 'relance' })
    })
    expect(drafts.isPending('c1:phone')).toBe(true)
    first.unmount() // « Fermer » pendant que Laura rédige.
    expect(drafts.isContactPending('c1')).toBe(true)

    await act(async () => {
      late.resolve(draft('Arrivé après la fermeture'))
      await pending
    })

    expect(drafts.isPending('c1:phone')).toBe(false)
    const second = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message, drafts }))
    expect(texts(second.result.current.entries)).toEqual(['Arrivé après la fermeture'])
    expect(second.result.current.generationStep).toBeNull()
    // La génération n'est JAMAIS rejouée à la réouverture (toujours un seul
    // appel `/ia/message`) ; #3694.7 en ajoute un second, la sauvegarde du
    // brouillon à la fermeture — pas une seconde génération.
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('rouvert PENDANT la génération : le panneau dit qu’elle continue, puis adopte la réponse', async () => {
    const late = deferred()
    apiFetch.mockReturnValueOnce(late.promise)
    const drafts = createEngagementDraftStore()
    const first = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message, drafts }))
    let pending: Promise<void> | null = null
    act(() => {
      pending = first.result.current.chooseParameters({ objective: 'relance' })
    })
    first.unmount()
    const second = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message, drafts }))
    expect(second.result.current.generationStep).not.toBeNull()
    expect(second.result.current.entries).toEqual([])

    await act(async () => {
      late.resolve(draft('Réponse adoptée'))
      await pending
    })

    await waitFor(() => expect(texts(second.result.current.entries)).toEqual(['Réponse adoptée']))
    expect(second.result.current.generationStep).toBeNull()
  })

  it('un changement de contact range la réponse tardive chez l’ANCIEN contact, jamais chez le nouveau', async () => {
    const late = deferred()
    apiFetch.mockReturnValueOnce(late.promise)
    const drafts = createEngagementDraftStore()
    const other = { id: 'c2', full_name: 'Autre Contact' } as unknown as Contact
    const { result, rerender } = renderHook(
      ({ who }: { who: Contact }) => useEngagementConversation({ channel: 'phone', contact: who, message, drafts }),
      { initialProps: { who: contact } },
    )
    let pending: Promise<void> | null = null
    act(() => {
      pending = result.current.chooseParameters({ objective: 'relance' })
    })
    rerender({ who: other })
    await act(async () => {
      late.resolve(draft('Pour Olivier'))
      await pending
    })

    expect(texts(result.current.entries)).toEqual([])
    expect(texts(drafts.get('c1:phone')?.entries ?? [])).toEqual(['Pour Olivier'])
    expect(drafts.get('c2:phone')?.entries ?? []).toEqual([])
  })

  it('SAIT DIRE NON — une génération remplacée par une plus récente du même fil n’est jamais rangée', async () => {
    const stale = deferred()
    apiFetch.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(draft('Récente'))
    const drafts = createEngagementDraftStore()
    const { result, unmount } = renderHook(() =>
      useEngagementConversation({ channel: 'phone', contact, message, drafts }),
    )
    let first: Promise<void> | null = null
    act(() => {
      first = result.current.chooseParameters({ objective: 'relance' })
    })
    await act(async () => {
      await result.current.chooseParameters({ objective: 'nurturing' })
    })
    unmount()
    await act(async () => {
      stale.resolve(draft('Périmée'))
      await first
    })

    expect(texts(drafts.get('c1:phone')?.entries ?? [])).toEqual(['Récente'])
    expect(drafts.isPending('c1:phone')).toBe(false)
  })
})

describe('#3633 — le QCM d’approche cadre la génération de l’e-mail suggéré', () => {
  beforeEach(() => apiFetch.mockReset())

  it('envoie l’angle choisi en contexte et les réponses en paramètres, au MÊME /ia/message', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { channel: 'email', subject: 'Objet', body: 'Corps' } })
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))

    await act(async () => {
      await result.current.generateFromApproach({
        angle: 'Accroche sur un signal récent du compte.',
        parameters: { objective: 'valider_contexte', constraints: 'Ton direct.' },
      })
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const call = apiFetch.mock.calls[0]?.[0] as { path: string; body: Record<string, unknown> }
    expect(call.path).toBe('/ia/message')
    expect(call.body).toMatchObject({
      contactId: 'c1',
      channel: 'email',
      context: 'Accroche sur un signal récent du compte.',
      parameters: { objective: 'valider_contexte', constraints: 'Ton direct.' },
    })
    // Les réponses restent choisies pour la suite du fil (« Paramètres du message »).
    expect(result.current.parameters.objective).toBe('valider_contexte')
    await waitFor(() => expect(result.current.entries.some(e => e.role === 'assistant')).toBe(true))
  })
})

describe('useEngagementConversation — traçabilité des versions (#3695.4-.5)', () => {
  beforeEach(() => apiFetch.mockReset())
  const draft = (body: string) => ({ success: true, data: { channel: 'email', subject: 'Objet', body } })
  const assistants = (entries: { role: string }[]) =>
    entries.filter(entry => entry.role === 'assistant') as unknown as {
      text: string
      unchanged?: boolean
      usedStyleId?: string
      usedTemplate?: { source: string; version: number }
    }[]

  it('#3695.5 — une variante au texte IDENTIQUE à la précédente est marquée inchangée, jamais « adaptée »', async () => {
    apiFetch.mockResolvedValue(draft('Même texte.'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })
    await act(async () => {
      await result.current.chooseParameters({ objective: 'positionnement_expertise' })
    })
    const [first, second] = assistants(result.current.entries)
    expect(first?.unchanged).toBeUndefined()
    expect(second?.unchanged).toBe(true)
  })

  it('#3695.5 — SAIT DIRE NON : une variante au texte différent n’est pas marquée inchangée', async () => {
    apiFetch.mockResolvedValueOnce(draft('Texte A.')).mockResolvedValueOnce(draft('Texte B.'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })
    await act(async () => {
      await result.current.chooseParameters({ objective: 'nurturing' })
    })
    expect(assistants(result.current.entries).map(entry => entry.unchanged)).toEqual([undefined, undefined])
  })

  it('#3695.5 — la comparaison se fait avec le texte que le commercial a CORRIGÉ, pas l’original', async () => {
    apiFetch.mockResolvedValue(draft('Texte généré.'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    await act(async () => {
      await result.current.chooseParameters({ objective: 'relance' })
    })
    const id = assistants(result.current.entries)[0] as unknown as { id: string }
    act(() => result.current.editEntry(id.id, { subject: 'Objet', body: 'Texte retouché à la main.' }))
    await act(async () => {
      await result.current.chooseParameters({ objective: 'nurturing' })
    })
    expect(assistants(result.current.entries)[1]?.unchanged).toBeUndefined()
  })

  it('#3695.4 — le style choisi est tracé sur le brouillon, parce que le serveur l’a vérifié (sinon 4xx, pas de brouillon)', async () => {
    apiFetch.mockResolvedValue(draft('Brouillon.'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    act(() => result.current.setStyleTemplateId('11111111-1111-4111-8111-111111111111'))
    await act(async () => {
      await result.current.generateDraft()
    })
    expect(assistants(result.current.entries)[0]?.usedStyleId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('#3695.4 — un style refusé par le serveur ne laisse AUCUNE trace « appliqué » : le fil porte l’erreur', async () => {
    apiFetch.mockRejectedValueOnce(new Error('style introuvable'))
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    act(() => result.current.setStyleTemplateId('11111111-1111-4111-8111-111111111111'))
    await act(async () => {
      await result.current.generateDraft()
    })
    expect(assistants(result.current.entries)).toHaveLength(0)
    expect(result.current.entries.some(entry => entry.role === 'error')).toBe(true)
  })

  it('#3695.4 — un modèle approuvé insère son texte EXACT et trace source + version', () => {
    const { result } = renderHook(() => useEngagementConversation({ channel: 'email', contact, message }))
    act(() => result.current.useApprovedTemplate({ source: 'Playbook ESN', version: 3, renderedText: 'Texte validé.' }))
    const [entry] = assistants(result.current.entries)
    expect(entry?.text).toBe('Texte validé.')
    expect(entry?.usedTemplate).toEqual({ source: 'Playbook ESN', version: 3 })
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

/**
 * #3263.46/.48 — un CTA qui ouvre le fil avec un objectif déjà choisi (« préparer l'approche »,
 * « créer une introduction ») le pré-sélectionne dans le composeur, sans fabriquer de génération
 * que le commercial n'a pas demandée (seul un CHANGEMENT d'objectif via `chooseParameters` en lance une).
 */
describe('useEngagementConversation — objectif porté à l’ouverture (#3263.46/.48)', () => {
  beforeEach(() => apiFetch.mockReset())

  it('pré-sélectionne l’objectif porté par le CTA quand rien n’est encore restauré', () => {
    const { result } = renderHook(() =>
      useEngagementConversation({
        channel: 'email',
        contact,
        message,
        initialParameters: { objective: 'introduction', cta: 'demander_intro' },
      }),
    )

    expect(result.current.parameters).toEqual({ objective: 'introduction', cta: 'demander_intro' })
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON — un fil déjà restauré n’est jamais écrasé par l’objectif du CTA', () => {
    const drafts = createEngagementDraftStore()
    drafts.set('c1:email', { entries: [], context: '', parameters: { objective: 'relance' } })
    const { result } = renderHook(() =>
      useEngagementConversation({
        channel: 'email',
        contact,
        message,
        drafts,
        initialParameters: { objective: 'introduction' },
      }),
    )

    expect(result.current.parameters).toEqual({ objective: 'relance' })
  })
})

// #4333 — « Générer les messages » s'ouvre DÉJÀ RÉDIGÉ par Laura (décision Louis 19/10) :
// un fil vide ne demande pas à la personne de cliquer pour voir le texte.
describe('useEngagementConversation — rédigé à l’ouverture (#4333)', () => {
  beforeEach(() => apiFetch.mockReset())
  const draft = (body: string) => ({ success: true, data: { channel: 'phone', subject: '', body } })
  const texts = (entries: { role: string }[]) => entries.map(entry => ('text' in entry ? entry.text : entry.role))

  it('#4333 — fil vide + lecture serveur terminée : Laura rédige sans geste, UNE seule fois', async () => {
    apiFetch.mockResolvedValueOnce(draft('Pitch d’appel rédigé'))
    const { result, rerender } = renderHook(() =>
      useEngagementConversation({ channel: 'phone', contact, message, autoDraft: true }),
    )

    await waitFor(() => expect(texts(result.current.entries)).toContain('Pitch d’appel rédigé'))
    rerender()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('#4333 — la lecture du brouillon serveur n’est pas terminée : rien ne part encore', () => {
    renderHook(() =>
      useEngagementConversation({ channel: 'phone', contact, message, autoDraft: true, draftHydrated: false }),
    )

    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#4333 — un fil déjà rédigé par l’analyse n’est jamais réécrit', () => {
    const written = { ...message, phoneScript: 'Script de l’analyse' }
    renderHook(() => useEngagementConversation({ channel: 'phone', contact, message: written, autoDraft: true }))

    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#4333 — échec de rédaction : l’erreur est dite dans le fil, sans texte inventé, sans boucle', async () => {
    apiFetch.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() =>
      useEngagementConversation({ channel: 'phone', contact, message, autoDraft: true }),
    )

    await waitFor(() => expect(result.current.entries.some(e => e.role === 'error')).toBe(true))
    expect(result.current.entries.some(e => e.role === 'assistant')).toBe(false)
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('#4415.2 — l’angle de l’étape ouvre le champ PRÉ-REMPLI et part dans la génération (champ vide = rouge)', async () => {
    apiFetch.mockResolvedValueOnce(draft('Mail rédigé'))
    const { result } = renderHook(() =>
      useEngagementConversation({
        channel: 'phone',
        contact,
        message,
        autoDraft: true,
        initialContext: 'Relancer le DSI après le salon',
      }),
    )

    expect(result.current.context).toBe('Relancer le DSI après le salon')
    await waitFor(() => expect(texts(result.current.entries)).toContain('Mail rédigé'))
    expect(JSON.stringify(apiFetch.mock.calls[0])).toContain('Relancer le DSI après le salon')
  })

  it('#4415.2 — sans angle d’étape, le champ reste vide (comportement historique)', () => {
    const { result } = renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    expect(result.current.context).toBe('')
  })

  it('#4333 — sans l’option, le comportement historique est inchangé (aucun appel)', () => {
    renderHook(() => useEngagementConversation({ channel: 'phone', contact, message }))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})
