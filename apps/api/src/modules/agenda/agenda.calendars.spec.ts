import type { Repository } from 'typeorm'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { AgendaBackend } from './agenda-backend'
import { AgendaService } from './agenda.service'

/**
 * GARDE PERF (29/09/2026, mesuré en prod : `GET /agenda/calendars` 1,5-2,4 s).
 *
 * Cause : la liste des agendas est une lecture CHEZ LE FOURNISSEUR (appel
 * sortant), faite fournisseur après fournisseur, après une lecture de profil
 * et un test « démo » eux aussi en série, à chaque ouverture de /briefing.
 * Corrigé : les fournisseurs sont interrogés ENSEMBLE, la préférence
 * (toujours relue, elle change quand l'utilisateur choisit) part avec eux, et
 * la liste des fournisseurs est retenue 60 s — jamais quand l'un d'eux n'a pas
 * répondu (une liste courte par panne ne se fige pas).
 */
function fakeBackend(provider: 'google' | 'microsoft', options: { throws?: boolean; delayMs?: number } = {}) {
  const status = jest.fn(async () => ({
    connected: true,
    provider,
    capabilities: { read: true, write: true },
  }))
  const listCalendars = jest.fn(async () => {
    if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs))
    if (options.throws) throw new Error('provider down')
    return [{ id: `${provider}-1`, provider, name: provider, primary: true, canWrite: true }]
  })
  return { backend: { status, listCalendars } as unknown as AgendaBackend, status, listCalendars }
}

/**
 * Un `listCalendars()` qui ne répond QUE quand le test le décide.
 *
 * ⚠️ La preuve du parallélisme ne peut pas être une DURÉE : elle dépend de la
 * charge de la machine, et la garde vire au rouge sans qu'une ligne de code ait
 * changé — CI du 25/10/2026, 377 ms mesurés pour un plafond posé à 220. Le
 * compte d'appels EN VOL, lui, est déterministe (même procédé que
 * `accounts.counts-same-wave.spec.ts`).
 */
function deferredBackend(provider: 'google' | 'microsoft', pending: Array<() => void>) {
  const status = jest.fn(async () => ({
    connected: true,
    provider,
    capabilities: { read: true, write: true },
  }))
  type Calendar = { id: string; provider: typeof provider; name: typeof provider; primary: boolean; canWrite: boolean }
  const listCalendars = jest.fn(
    () =>
      new Promise<Calendar[]>(resolve => {
        pending.push(() => resolve([{ id: `${provider}-1`, provider, name: provider, primary: true, canWrite: true }]))
      }),
  )
  return { backend: { status, listCalendars } as unknown as AgendaBackend, status, listCalendars }
}

function build(backends: ReturnType<typeof fakeBackend>[]) {
  const profiles = {
    findOne: jest.fn(async () => ({ agenda_calendar_ids: null, agenda_read_all: false })),
    update: jest.fn(),
  }
  const service = new AgendaService(
    backends.map(entry => entry.backend),
    profiles as unknown as Repository<ProfileEntity>,
  )
  return { service, profiles }
}

describe('AgendaService.listCalendars — budget d’appels sortants', () => {
  it('interroge les fournisseurs ENSEMBLE : les deux appels sont EN VOL avant qu’aucun ne réponde', async () => {
    const pending: Array<() => void> = []
    const google = deferredBackend('google', pending)
    const microsoft = deferredBackend('microsoft', pending)
    const { service } = build([google, microsoft])

    const promise = service.listCalendars('u1')
    // Laisser s'exécuter le code synchrone-jusqu'au-premier-`await` : la lecture
    // de préférence et le test « démo » répondent tout de suite (jest.fn async),
    // les fournisseurs, eux, ne répondront que quand ce test le décidera.
    for (let tick = 0; tick < 50 && pending.length < 2; tick += 1) await Promise.resolve()

    // La faute que ce test attrape : un `for … await` sur les fournisseurs. En
    // série, le second n'est pas encore appelé tant que le premier n'a pas
    // répondu — et il ne répond jamais tout seul ici.
    expect(pending).toHaveLength(2)
    expect(google.listCalendars).toHaveBeenCalledTimes(1)
    expect(microsoft.listCalendars).toHaveBeenCalledTimes(1)

    pending.forEach(resolve => resolve())
    const result = await promise
    expect(result.calendars.map(c => c.provider)).toEqual(['google', 'microsoft'])
  })

  it('une seconde lecture dans la minute ne rappelle AUCUN fournisseur, mais relit la préférence', async () => {
    const google = fakeBackend('google')
    const microsoft = fakeBackend('microsoft')
    const { service, profiles } = build([google, microsoft])
    await service.listCalendars('u1')
    await service.listCalendars('u1')
    expect(google.listCalendars).toHaveBeenCalledTimes(1)
    expect(microsoft.listCalendars).toHaveBeenCalledTimes(1)
    expect(profiles.findOne).toHaveBeenCalledTimes(2)
  })

  it('une autre personne relit (la clé porte l’utilisateur)', async () => {
    const google = fakeBackend('google')
    const { service } = build([google])
    await service.listCalendars('u1')
    await service.listCalendars('u2')
    expect(google.listCalendars).toHaveBeenCalledTimes(2)
  })

  it('un fournisseur en panne n’est JAMAIS retenu : la lecture suivante réessaie', async () => {
    const google = fakeBackend('google', { throws: true })
    const { service } = build([google])
    const first = await service.listCalendars('u1')
    expect(first.unavailable).toHaveLength(1)
    await service.listCalendars('u1')
    expect(google.listCalendars).toHaveBeenCalledTimes(2)
  })
})
