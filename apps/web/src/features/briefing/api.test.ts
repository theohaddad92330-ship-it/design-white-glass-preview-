import type { DailyBriefing } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { briefingApi, browserTimeZone, readMorningBrief } from './api'

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: fetchMock }))

/** Un brief tel qu'un serveur d'AVANT la tranche Tâches le rendait. */
const OLD_PAYLOAD = {
  date: '2026-08-17',
  timeZone: 'Europe/Paris',
  firstName: 'Louis',
  agenda: { state: 'ready', reason: null, events: [], conflicts: [], needsPreparation: [] },
  mail: { state: 'ready', reason: null, awaitingReply: [], unread: [], positiveReplies: [] },
  accountsToWatch: [],
  actions: [],
  generatedAt: '2026-08-17T07:00:00.000Z',
} as unknown as DailyBriefing

describe('briefingApi.today', () => {
  it('ne casse PAS sur une réponse d’un serveur plus ancien que l’app', async () => {
    // Vu en production le 17/08 : l'app lisait `data.tasks.state` sur une
    // réponse écrite avant que le bloc existe, et « Aujourd’hui » — l'écran le
    // plus ouvert du produit — affichait une page d'erreur.
    fetchMock.mockResolvedValueOnce(OLD_PAYLOAD)
    const briefing = await briefingApi.today()
    expect(briefing.tasks.state).toBe('unavailable')
    expect(briefing.tasks.tasks).toEqual([])
  })

  it('dit « pas encore servi » plutôt que « rien à faire »', async () => {
    // `ready` avec une liste vide se lirait « ta journée est libre », ce qui
    // est exactement le mensonge que l'état de bloc existe pour empêcher.
    fetchMock.mockResolvedValueOnce(OLD_PAYLOAD)
    const briefing = await briefingApi.today()
    expect(briefing.tasks.state).not.toBe('ready')
    expect(briefing.tasks.reason).toMatch(/pas encore servie/)
  })

  it('laisse un bloc servi INTACT', async () => {
    const served = {
      ...OLD_PAYLOAD,
      tasks: { state: 'ready', reason: null, tasks: [], overdueCount: 3, todayCount: 1 },
    } as unknown as DailyBriefing
    fetchMock.mockResolvedValueOnce(served)
    const briefing = await briefingApi.today()
    expect(briefing.tasks.overdueCount).toBe(3)
    expect(briefing.tasks.state).toBe('ready')
  })
})

/**
 * #1936 — le fuseau du NAVIGATEUR, envoyé à chaque appel et jamais stocké
 * (décision de Louis du 12/09). Le même part au marqueur « premier du jour » et
 * au brief : deux fuseaux différents pourraient désigner deux jours différents.
 */
describe('#1936 — le fuseau du navigateur voyage avec la requête', () => {
  beforeEach(() => fetchMock.mockReset())

  it('today(fuseau) le passe en paramètre de requête', async () => {
    fetchMock.mockResolvedValueOnce(OLD_PAYLOAD)
    await briefingApi.today('America/New_York')
    expect(fetchMock).toHaveBeenCalledWith({ path: '/briefing/today?timeZone=America%2FNew_York' })
  })

  it('today() sans fuseau garde le chemin d’avant', async () => {
    fetchMock.mockResolvedValueOnce(OLD_PAYLOAD)
    await briefingApi.today()
    expect(fetchMock).toHaveBeenCalledWith({ path: '/briefing/today' })
  })

  it('firstOpenToday POSTe le fuseau dans le corps', async () => {
    fetchMock.mockResolvedValueOnce({ isFirstOpenToday: true })
    await expect(briefingApi.firstOpenToday('Europe/Paris')).resolves.toEqual({ isFirstOpenToday: true })
    expect(fetchMock).toHaveBeenCalledWith({
      path: '/briefing/first-open-today',
      method: 'POST',
      body: { timeZone: 'Europe/Paris' },
    })
  })

  it('le fuseau du navigateur est un identifiant lisible', () => {
    expect(browserTimeZone()).toMatch(/\S/)
  })
})

describe('#2397.7 — briefingApi.setRoleFit', () => {
  beforeEach(() => fetchMock.mockReset())

  it('POSTe le genre et le booléen reçus', async () => {
    fetchMock.mockResolvedValueOnce({ engaged: true })
    await expect(briefingApi.setRoleFit('follow_up', true)).resolves.toEqual({ engaged: true })
    expect(fetchMock).toHaveBeenCalledWith({
      path: '/briefing/role-fit',
      method: 'POST',
      body: { kind: 'follow_up', engaged: true },
    })
  })

  it('engaged=false retire le geste — même route, même forme', async () => {
    fetchMock.mockResolvedValueOnce({ engaged: false })
    await briefingApi.setRoleFit('follow_up', false)
    expect(fetchMock).toHaveBeenCalledWith({
      path: '/briefing/role-fit',
      method: 'POST',
      body: { kind: 'follow_up', engaged: false },
    })
  })
})

describe('#1936 — readMorningBrief : le brief SEULEMENT à la 1re ouverture du jour', () => {
  beforeEach(() => fetchMock.mockReset())

  it('pas la première du jour → null, et le brief n’est même pas lu', async () => {
    fetchMock.mockResolvedValueOnce({ isFirstOpenToday: false })
    await expect(readMorningBrief('Europe/Paris')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('première du jour → le brief, lu avec le MÊME fuseau', async () => {
    fetchMock.mockResolvedValueOnce({ isFirstOpenToday: true }).mockResolvedValueOnce(OLD_PAYLOAD)
    const read = await readMorningBrief('Asia/Tokyo')
    expect(read?.briefing?.date).toBe('2026-08-17')
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ body: { timeZone: 'Asia/Tokyo' } }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, { path: '/briefing/today?timeZone=Asia%2FTokyo' })
  })

  it('première du jour mais brief illisible → consommé quand même, le silence sera NOMMÉ', async () => {
    fetchMock.mockResolvedValueOnce({ isFirstOpenToday: true }).mockRejectedValueOnce(new Error('503'))
    await expect(readMorningBrief('Europe/Paris')).resolves.toEqual({ briefing: null })
  })

  it('marqueur en panne → null : l’amorce courte, jamais un brief deviné', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await expect(readMorningBrief('Europe/Paris')).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('une API d’avant le marqueur (champ absent) ne vaut JAMAIS « premier du jour »', async () => {
    fetchMock.mockResolvedValueOnce({})
    await expect(readMorningBrief('Europe/Paris')).resolves.toBeNull()
  })
})
