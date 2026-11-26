import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { DiscoverCallListRow } from '../../discover/lib/discover-call-list'

// #2386.6 — la collision entre commerciaux : UN aller-retour groupé, jamais
// un par contact. Résout `{}` par défaut (aucune collision) pour que les
// suites existantes, qui ne testent pas ce comportement, restent inchangées.
const { solicitations } = vi.hoisted(() => ({ solicitations: vi.fn().mockResolvedValue({}) }))
vi.mock('../../contacts/api', () => ({ contactsApi: { solicitations } }))

// #2386.A/.7 — « Capturer chaque outcome » : le MÊME formulaire que la fiche
// contact (LogActivityDialog → POST /activities), rouvert depuis la session.
const { logActivity } = vi.hoisted(() => ({ logActivity: vi.fn().mockResolvedValue({ id: 'act-1' }) }))
vi.mock('../../activities/api', () => ({ activitiesApi: { log: logActivity } }))

// #2386.9 — la session persistée : best-effort, résout par défaut pour que
// les suites existantes (qui ne testent pas cette télémétrie) restent
// inchangées.
const { startSession, recordSessionEvent } = vi.hoisted(() => ({
  startSession: vi.fn().mockResolvedValue({ id: 'psess-1' }),
  recordSessionEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../api', () => ({ prospectingSessionsApi: { start: startSession, recordEvent: recordSessionEvent } }))

const { ProspectingSessionDialog } = await import('./ProspectingSessionDialog')

function row(overrides: Partial<DiscoverCallListRow> = {}): DiscoverCallListRow {
  return {
    key: overrides.key ?? 'k1',
    siren: '123456789',
    accountId: 'acc-1',
    portfolioState: 'new',
    company: 'ACME',
    website: null,
    reason: 'Poste DSI ouvert',
    signal: null,
    city: null,
    department: null,
    contactLocation: null,
    confidence: null,
    contactId: 'contact-1',
    fullName: 'Marie Dupont',
    title: 'DSI',
    level: null,
    expertise: null,
    email: 'marie@acme.fr',
    phone: '0102030405',
    unknown: [],
    ...overrides,
  }
}

function renderDialog(rows: DiscoverCallListRow[], onExport = vi.fn()) {
  renderWithRouter(<ProspectingSessionDialog open onOpenChange={() => {}} rows={rows} onExport={onExport} />)
  return { onExport }
}

beforeEach(() => {
  solicitations.mockReset()
  solicitations.mockResolvedValue({})
  logActivity.mockReset()
  logActivity.mockResolvedValue({ id: 'act-1' })
  startSession.mockReset()
  startSession.mockResolvedValue({ id: 'psess-1' })
  recordSessionEvent.mockReset()
  recordSessionEvent.mockResolvedValue(undefined)
})

describe('ProspectingSessionDialog — #2375.2 le formulaire, avant toute génération', () => {
  it('demande durée, objectif et mode avant de générer', async () => {
    renderDialog([row()])
    expect(await screen.findByLabelText('Durée disponible (minutes)')).toBeInTheDocument()
    expect(screen.getByLabelText('Objectif de la session')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appels' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réseau professionnel' })).toBeInTheDocument()
    // Rien de généré tant qu'on n'a pas cliqué.
    expect(screen.queryByText('Session prête')).not.toBeInTheDocument()
  })
})

describe('ProspectingSessionDialog — #2375.1/.3/.4 la session générée', () => {
  it('affiche la session avec pitch et canal par contact', async () => {
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(screen.getByText('Session prête')).toBeInTheDocument()
    expect(screen.getByText('Poste DSI ouvert')).toBeInTheDocument()
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
  })
})

describe('ProspectingSessionDialog — #2375.7 signale les contacts incomplets', () => {
  it('affiche le compte numéros/e-mails/à vérifier, et propose deux gestes', async () => {
    const user = userEvent.setup()
    renderDialog([row({ key: '1' }), row({ key: '2', phone: null })])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    // row 2 (téléphone absent) porte un e-mail : 1 numéro dispo, 1 e-mail seul.
    expect(
      screen.getByText(/1 numéros disponibles\. 1 e-mails uniquement\. 0 identités à vérifier\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Commencer avec les disponibles' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Conserver le reste pour le réseau professionnel' })).toBeInTheDocument()
  })

  it('« Commencer avec les disponibles » retire les contacts sans coordonnée pour le canal', async () => {
    const user = userEvent.setup()
    renderDialog([row({ key: '1', fullName: 'Prêt' }), row({ key: '2', fullName: 'Pas prêt', phone: null })])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(screen.getByText('Pas prêt')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Commencer avec les disponibles' }))
    expect(screen.queryByText('Pas prêt')).not.toBeInTheDocument()
    expect(screen.getByText('Prêt')).toBeInTheDocument()
  })
})

describe('ProspectingSessionDialog — #2375.6 borne le nombre de contacts au temps disponible', () => {
  it('annonce les contacts prêts laissés hors session par manque de temps', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 20 }, (_, i) => row({ key: `k${i}`, fullName: `Contact ${i}` }))
    renderDialog(rows)
    const duration = await screen.findByLabelText('Durée disponible (minutes)')
    await user.clear(duration)
    await user.type(duration, '10')
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    // 10 min / 4 min par appel = 2 contacts, 18 laissés hors session.
    expect(screen.getByText(/18 contacts prêts laissés hors session/)).toBeInTheDocument()
  })
})

describe('ProspectingSessionDialog — #2375.8 export checklist', () => {
  it('exporte au clic, avec le pitch et la première question', async () => {
    const user = userEvent.setup()
    const { onExport } = renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await user.click(screen.getByRole('button', { name: 'Exporter la checklist' }))
    expect(onExport).toHaveBeenCalledTimes(1)
    const [csv, filename] = onExport.mock.calls[0] as [string, string]
    expect(csv).toContain('Poste DSI ouvert')
    expect(filename).toContain('session-prospection')
  })
})

describe('ProspectingSessionDialog — #2386.6 collision entre commerciaux', () => {
  it('interroge le serveur UNE fois pour toute la session, jamais un appel par contact', async () => {
    const user = userEvent.setup()
    renderDialog([row({ key: '1', contactId: 'c1' }), row({ key: '2', contactId: 'c2', fullName: 'Paul Martin' })])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await waitFor(() => expect(solicitations).toHaveBeenCalledTimes(1))
    expect(solicitations).toHaveBeenCalledWith(['c1', 'c2'])
  })

  it('affiche le collègue et la date quand le serveur signale une collision', async () => {
    solicitations.mockResolvedValue({
      'contact-1': { colleague: { user_id: 'u-7', name: 'Sarah Nasri' }, lastTouchOn: '2026-09-20', withinDays: 7 },
    })
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(await screen.findByText(/Sarah Nasri/)).toBeInTheDocument()
  })

  it('un échec du serveur n’empêche pas la session déjà affichée', async () => {
    solicitations.mockRejectedValue(new Error('réseau indisponible'))
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await waitFor(() => expect(solicitations).toHaveBeenCalled())
    expect(screen.getByText('Session prête')).toBeInTheDocument()
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
  })
})

// #2386.9 (#3010.8) — « doublons évités », une des quatre mesures de
// performance de #2386. Un COMPTE de ce que la collision (#2386.6) a déjà
// calculé, jamais un second calcul.
describe('ProspectingSessionDialog — #3010.8 doublons évités', () => {
  it('compte les collisions détectées comme des doublons évités', async () => {
    solicitations.mockResolvedValue({
      'contact-1': { colleague: { user_id: 'u-7', name: 'Sarah Nasri' }, lastTouchOn: '2026-09-20', withinDays: 7 },
    })
    const user = userEvent.setup()
    renderDialog([row({ key: '1' }), row({ key: '2', contactId: 'contact-2', fullName: 'Paul Martin' })])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(await screen.findByText(/1 doublon évité/)).toBeInTheDocument()
  })

  it('n’affiche AUCUNE ligne quand aucune collision n’a été détectée', async () => {
    solicitations.mockResolvedValue({})
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await waitFor(() => expect(solicitations).toHaveBeenCalled())
    expect(screen.queryByText(/doublon/)).not.toBeInTheDocument()
  })

  // #3010.8 (FINIR-V2) — les TROIS autres mesures demandées par #2386 restent
  // NOMMÉES « non mesuré », jamais tues ni inventées — contrairement à
  // « doublons évités » (une LISTE de collisions, absente = aucune ligne),
  // ces trois sont des AXES d'un score de session : ils se nomment toujours.
  it('nomme « non mesuré » les trois mesures que la session ne peut pas encore alimenter', async () => {
    solicitations.mockResolvedValue({})
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(await screen.findByText(/Temps au premier message : non mesuré/)).toBeInTheDocument()
    expect(screen.getByText(/Taux de messages modifiés : non mesuré/)).toBeInTheDocument()
    expect(screen.getByText(/Succès connecteur : non mesuré/)).toBeInTheDocument()
  })
})

// #2386.9 — la session PERSISTÉE : l'appelant réel de `prospecting_sessions`
// (migration `1796322207425`). Le même compte que #3010.8 ci-dessus rejoint
// l'agrégat PAR PARCOURS, jamais un second calcul.
describe('ProspectingSessionDialog — #2386.9 la session persistée', () => {
  it('démarre une session pour le PARCOURS choisi, dès la génération', async () => {
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await waitFor(() => expect(startSession).toHaveBeenCalledWith({ journey: 'appels' }))
  })

  it('rejoint le COMPTE déjà affiché des doublons évités à la session démarrée', async () => {
    solicitations.mockResolvedValue({
      'contact-1': { colleague: { user_id: 'u-7', name: 'Sarah Nasri' }, lastTouchOn: '2026-09-20', withinDays: 7 },
    })
    const user = userEvent.setup()
    renderDialog([row({ key: '1' }), row({ key: '2', contactId: 'contact-2', fullName: 'Paul Martin' })])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await waitFor(() =>
      expect(recordSessionEvent).toHaveBeenCalledWith('psess-1', { kind: 'duplicates_avoided', count: 1 }),
    )
  })

  it('NON — aucun doublon détecté n’envoie AUCUN événement (jamais un compte à zéro posé pour rien)', async () => {
    solicitations.mockResolvedValue({})
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await waitFor(() => expect(solicitations).toHaveBeenCalled())
    expect(recordSessionEvent).not.toHaveBeenCalled()
  })

  it('un échec du démarrage n’empêche jamais la session déjà affichée', async () => {
    startSession.mockRejectedValue(new Error('réseau indisponible'))
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(await screen.findByText('Session prête')).toBeInTheDocument()
  })
})

describe('ProspectingSessionDialog — #2386.A/.7 capturer l’issue d’un appel depuis la session', () => {
  it('un contact SANS identité connue n’a pas de bouton pour consigner l’issue', async () => {
    const user = userEvent.setup()
    renderDialog([row({ contactId: null })])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    expect(screen.queryByRole('button', { name: "Consigner l'issue" })).not.toBeInTheDocument()
  })

  it('ouvre LE MÊME formulaire que la fiche contact, pré-rattaché à ce contact précis', async () => {
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await user.click(screen.getByRole('button', { name: "Consigner l'issue" }))
    expect(screen.getByText('Consigner un échange')).toBeInTheDocument()
  })

  it('soumet vers le bon contact et marque la ligne comme consignée', async () => {
    const user = userEvent.setup()
    renderDialog([row()])
    await user.click(await screen.findByRole('button', { name: 'Générer la session' }))
    await user.click(screen.getByRole('button', { name: "Consigner l'issue" }))
    await user.click(screen.getByRole('button', { name: 'Pas de réponse' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(logActivity).toHaveBeenCalled())
    expect(logActivity.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ contactId: 'contact-1' }))
    expect(await screen.findByText('Issue consignée')).toBeInTheDocument()
  })
})

describe('ProspectingSessionDialog — #2375.9 Laura reste accessible', () => {
  it('reste une boîte de dialogue normale, jamais un mode plein écran qui bloquerait le reste de l’app', async () => {
    renderDialog([row()])
    // Le contenu du dialogue est un `role="dialog"` standard — le panneau
    // Laura (`LauraDock`, monté au niveau racine `routes/__root.tsx`) ne
    // dépend d'aucun état de cet écran, donc reste accessible pendant la
    // session. Cette assertion garde la forme (rôle dialog non exclusif),
    // pas le panneau lui-même — testé au niveau racine.
    expect(
      within(await screen.findByRole('dialog')).getByText('Préparer une session de prospection'),
    ).toBeInTheDocument()
  })
})
