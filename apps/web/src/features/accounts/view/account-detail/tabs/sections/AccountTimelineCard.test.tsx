import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { AccountTimelineCard } from './AccountTimelineCard'

/**
 * #3532 — Historique & preuves, recette prod 01/10 : l'identifiant technique
 * `card_prepare_message` s'affichait tel quel et « 0/0 étape(s) réussie(s) »
 * apparaissait sur une exécution sans étape. Ces tests savent dire NON aux deux.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

function event(over: Record<string, unknown>) {
  return {
    id: 'workflow:r1',
    kind: 'workflow',
    at: '2026-07-15T10:00:00.000Z',
    label: 'card_prepare_message',
    detail: null,
    type: 'done',
    contactId: null,
    steps: null,
    ...over,
  }
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccountTimelineCard accountId="a1" />
    </QueryClientProvider>,
  )
}

describe('AccountTimelineCard — exécutions de workflow', () => {
  beforeEach(() => apiFetch.mockReset())

  it('traduit la clé technique en libellé métier, sans compteur quand il n’y a aucune étape', async () => {
    apiFetch.mockResolvedValue({ events: [event({})] })
    show()
    expect(await screen.findByText('Préparer un message')).toBeInTheDocument()
    expect(screen.queryByText(/card_prepare_message/)).toBeNull()
    expect(screen.queryByText(/0\/0|0 étape/)).toBeNull()
    expect(screen.queryByText(/étape/)).toBeNull()
  })

  it('met en forme une clé inconnue plutôt que de l’afficher brute, et dit le compteur réel', async () => {
    apiFetch.mockResolvedValue({
      events: [event({ label: 'unmapped_workflow_key', steps: { done: 1, total: 2 } })],
    })
    show()
    expect(await screen.findByText('Unmapped workflow key')).toBeInTheDocument()
    expect(screen.getByText('1 étape réussie sur 2')).toBeInTheDocument()
  })

  it('#3532 — le pluriel suit le nombre d’étapes réussies (_one / _other), FR et EN', async () => {
    apiFetch.mockResolvedValue({ events: [event({ steps: { done: 2, total: 2 } })] })
    show()
    expect(await screen.findByText('2 étapes réussies sur 2')).toBeInTheDocument()
    expect(screen.queryByText(/réussie\(s\)|étape\(s\)/)).toBeNull()
    await i18n.changeLanguage('en')
    try {
      await waitFor(() => expect(screen.getByText('2 steps succeeded out of 2')).toBeInTheDocument())
    } finally {
      await i18n.changeLanguage('fr')
    }
  })
})

describe('AccountTimelineCard — #3416.4b libellé selon la langue', () => {
  beforeEach(() => apiFetch.mockReset())

  const named = event({
    id: 'action:9',
    kind: 'action',
    type: 'plan_action_completed',
    label: 'Action faite — Bloqué par les achats',
    labelEn: 'Action done — Blocked by procurement',
  })

  it('lit labelEn quand l’interface est en anglais, label en français', async () => {
    apiFetch.mockResolvedValue({ events: [named] })
    show()
    expect(await screen.findByText('Action faite — Bloqué par les achats')).toBeInTheDocument()
    await i18n.changeLanguage('en')
    try {
      await waitFor(() => expect(screen.getByText('Action done — Blocked by procurement')).toBeInTheDocument())
      expect(screen.queryByText('Action faite — Bloqué par les achats')).toBeNull()
    } finally {
      await i18n.changeLanguage('fr')
    }
  })

  it('retombe sur le français quand labelEn est absent — jamais un libellé vide', async () => {
    apiFetch.mockResolvedValue({ events: [{ ...named, labelEn: undefined }] })
    await i18n.changeLanguage('en')
    try {
      show()
      expect(await screen.findByText('Action faite — Bloqué par les achats')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('fr')
    }
  })
})

describe('AccountTimelineCard — #3405 / #3532 les codes du journal ne s’affichent jamais bruts', () => {
  beforeEach(() => apiFetch.mockReset())

  it('traduit analysis_started, analysis_completed, account_score_changed, message_copied', async () => {
    apiFetch.mockResolvedValue({
      events: [
        'analysis_started',
        'analysis_completed',
        'account_score_changed',
        'message_copied',
        'brand_new_code',
      ].map((code, i) => event({ id: `action:${i}`, kind: 'action', type: code, label: code })),
    })
    show()
    expect(await screen.findByText('Analyse lancée')).toBeInTheDocument()
    expect(screen.getByText('Analyse terminée')).toBeInTheDocument()
    expect(screen.getByText('Score du compte mis à jour')).toBeInTheDocument()
    expect(screen.getByText('Message copié')).toBeInTheDocument()
    expect(screen.getByText('Brand new code')).toBeInTheDocument()
    expect(screen.queryByText(/analysis_|account_score|message_copied/)).toBeNull()
  })

  it("#3405 — un sous-titre qui répète le titre ne s'affiche pas (deux « Analyse lancée » ≠ doublon)", async () => {
    apiFetch.mockResolvedValue({
      events: [
        event({
          id: 'action:1',
          kind: 'action',
          type: 'analysis_started',
          label: 'analysis_started',
          detail: 'Analyse lancée',
        }),
        event({
          id: 'action:2',
          kind: 'action',
          type: 'analysis_started',
          label: 'analysis_started',
          detail: 'analysis_started',
          at: '2026-09-01T10:00:00.000Z',
        }),
        event({
          id: 'action:3',
          kind: 'action',
          type: 'note_added',
          label: 'Note ajoutée',
          detail: 'Rendez-vous à confirmer',
        }),
      ],
    })
    show()
    expect(await screen.findAllByText('Analyse lancée')).toHaveLength(2)
    expect(screen.queryByText('analysis_started')).toBeNull()
    expect(screen.getByText('Rendez-vous à confirmer')).toBeInTheDocument()
  })

  it('#3505 — « Laura a consulté ton CRM », une ligne × N par jour', async () => {
    apiFetch.mockResolvedValue({
      events: Array.from({ length: 12 }, (_, i) =>
        event({
          id: `activity:${i}`,
          kind: 'action',
          type: 'crm_lookup',
          label: 'crm_lookup',
          at: new Date(Date.UTC(2026, 9, 1, 12, 0) - i * 60_000).toISOString(),
        }),
      ),
    })
    show()
    expect(await screen.findByText(/a consulté ton CRM/)).toBeInTheDocument()
    expect(screen.getAllByText(/a consulté ton CRM/)).toHaveLength(1)
    expect(screen.getByText(/· × 12/)).toBeInTheDocument()
    expect(screen.queryByText('crm_lookup')).toBeNull()
  })

  it('garde le libellé serveur quand il existe', async () => {
    apiFetch.mockResolvedValue({
      events: [event({ kind: 'action', type: 'message_sent', label: 'Email envoyé' })],
    })
    show()
    expect(await screen.findByText('Email envoyé')).toBeInTheDocument()
  })
})

/**
 * #3405 / #3546.5 — recette prod 02/10 : les six « Fiche contact ouverte » du
 * 01/10 « n'apparaissaient plus ». Elles existaient, mais le fil n'affichait que
 * les 12 lignes les plus récentes, sans le dire : une absence à l'écran qui
 * n'était qu'une coupe. On ne coupe plus en silence — le reste se nomme et s'ouvre.
 */
describe('AccountTimelineCard — rien ne disparaît sans le dire', () => {
  beforeEach(() => apiFetch.mockReset())

  const actions = Array.from({ length: 15 }, (_, i) =>
    event({
      id: `action:${i}`,
      kind: 'action',
      type: 'plan_action_contact_opened',
      label: `Fiche contact ouverte · Contact ${i}`,
      at: new Date(Date.UTC(2026, 9, 1, 12, 0) - i * 86_400_000).toISOString(),
    }),
  )

  it('nomme combien de lignes plus anciennes sont repliées et les ouvre au clic', async () => {
    apiFetch.mockResolvedValue({ events: actions })
    show()
    expect(await screen.findByText('Fiche contact ouverte · Contact 0')).toBeInTheDocument()
    expect(screen.queryByText('Fiche contact ouverte · Contact 14')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voir les 3 lignes plus anciennes' }))
    expect(screen.getByText('Fiche contact ouverte · Contact 14')).toBeInTheDocument()
  })

  it('aucun bouton quand tout tient dans le fil', async () => {
    apiFetch.mockResolvedValue({ events: actions.slice(0, 5) })
    show()
    await screen.findByText('Fiche contact ouverte · Contact 0')
    expect(screen.queryByRole('button', { name: /plus anciennes/ })).toBeNull()
  })
})
