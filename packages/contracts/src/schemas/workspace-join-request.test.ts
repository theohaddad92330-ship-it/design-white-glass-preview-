import { describe, expect, it } from 'vitest'
import {
  canCreateOwnWorkspace,
  ownWorkspaceUnlockAt,
  WORKSPACE_JOIN_SILENCE_HOURS,
  workspaceJoinAdminSchema,
  workspaceJoinOverviewSchema,
  type WorkspaceJoinCandidate,
} from './workspace-join-request.js'

const NOW = new Date('2026-09-17T12:00:00.000Z')
const HOURS = 60 * 60 * 1000

function candidate(request: WorkspaceJoinCandidate['request']): WorkspaceJoinCandidate {
  return {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspaceName: 'Comet',
    admins: [{ firstName: 'Louis', lastInitial: 'S' }],
    request,
  }
}

function request(status: 'pending' | 'accepted' | 'refused' | 'dismissed', hoursAgo: number) {
  const createdAt = new Date(NOW.getTime() - hoursAgo * HOURS).toISOString()
  return { id: '22222222-2222-4222-8222-222222222222', status, createdAt, decidedAt: null }
}

/** #2016 — la règle des 72 h, UN seul endroit (API et écran la lisent). */
describe('canCreateOwnWorkspace (#2016)', () => {
  it('aucun espace détecté : rien ne bloque', () => {
    expect(canCreateOwnWorkspace([], NOW)).toBe(true)
  })

  it('un espace détecté SANS demande : bloqué — on demande d’abord (#2016.2)', () => {
    expect(canCreateOwnWorkspace([candidate(null)], NOW)).toBe(false)
  })

  it('une demande en attente depuis moins de 72 h : bloqué', () => {
    expect(canCreateOwnWorkspace([candidate(request('pending', WORKSPACE_JOIN_SILENCE_HOURS - 1))], NOW)).toBe(false)
  })

  it('72 h de silence : débloqué (#2016.10, administrateur absent)', () => {
    expect(canCreateOwnWorkspace([candidate(request('pending', WORKSPACE_JOIN_SILENCE_HOURS))], NOW)).toBe(true)
  })

  it('un refus débloque tout de suite', () => {
    expect(canCreateOwnWorkspace([candidate(request('refused', 1))], NOW)).toBe(true)
  })

  it('« ce n’est pas mon entreprise » débloque toujours (#2016.10)', () => {
    expect(canCreateOwnWorkspace([candidate(request('dismissed', 0))], NOW)).toBe(true)
  })

  it('plusieurs espaces : chacun doit être tranché (#2016.6)', () => {
    const open = candidate(null)
    const refused = { ...candidate(request('refused', 1)), workspaceId: '33333333-3333-4333-8333-333333333333' }
    expect(canCreateOwnWorkspace([refused, open], NOW)).toBe(false)
  })

  it('l’heure de déblocage est la date de la demande + 72 h', () => {
    expect(ownWorkspaceUnlockAt(request('pending', 10))).toBe(
      new Date(NOW.getTime() + (WORKSPACE_JOIN_SILENCE_HOURS - 10) * HOURS).toISOString(),
    )
  })
})

/** #2016.5 — un non-membre ne reçoit AUCUNE coordonnée : le contrat le refuse. */
describe('workspaceJoinAdminSchema (#2016.5)', () => {
  it('accepte un prénom et une initiale', () => {
    expect(workspaceJoinAdminSchema.parse({ firstName: 'Louis', lastInitial: 'S' })).toEqual({
      firstName: 'Louis',
      lastInitial: 'S',
    })
  })

  it('REJETTE un e-mail, un téléphone ou un nom complet glissé dans la réponse', () => {
    for (const extra of [{ email: 'louis@comet.fr' }, { phone: '+33600000000' }, { lastName: 'Schlegel' }]) {
      expect(workspaceJoinAdminSchema.safeParse({ firstName: 'Louis', lastInitial: 'S', ...extra }).success).toBe(false)
    }
  })

  it('REJETTE une initiale qui n’en est pas une', () => {
    expect(workspaceJoinAdminSchema.safeParse({ firstName: 'Louis', lastInitial: 'Schlegel' }).success).toBe(false)
  })

  it('la vue d’ensemble est stricte aussi', () => {
    const overview = { candidates: [candidate(null)], canCreateOwnWorkspace: false }
    expect(workspaceJoinOverviewSchema.parse(overview)).toEqual(overview)
    expect(workspaceJoinOverviewSchema.safeParse({ ...overview, adminEmails: ['a@b.fr'] }).success).toBe(false)
  })
})
