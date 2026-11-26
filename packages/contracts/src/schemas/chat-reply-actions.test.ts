import { describe, expect, it } from 'vitest'
import { REPLY_ACTION_KINDS, replyActionsFor, type ReplyActionInput } from './chat-reply-actions.js'

const base: ReplyActionInput = { accountIds: [], blockTypes: [], hasDiscoverCriteria: false, hasMissingData: false }
const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`)

describe('#3766 — replyActionsFor : un débouché réel, jamais un bouton décoratif', () => {
  it('ne propose RIEN quand la réponse ne porte aucun objet réel (pas de bouton qui fait semblant)', () => {
    expect(replyActionsFor(base)).toBeNull()
    expect(replyActionsFor({ ...base, blockTypes: ['comparison'] })).toBeNull()
  })

  it('une proposition Découvrir seule : « Affiner la recherche » — « Ouvrir » reste sur la carte (pas de doublon)', () => {
    const plan = replyActionsFor({ ...base, hasDiscoverCriteria: true })
    expect(plan?.primary).toBe('refine_search')
    expect(plan?.secondary).toEqual(['dismiss'])
    expect(REPLY_ACTION_KINDS).not.toContain('open_discover')
  })

  it('une proposition Découvrir ET des comptes cités : « Affiner » passe en secondaire', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(1), hasDiscoverCriteria: true })
    expect(plan?.primary).not.toBe('refine_search')
    expect(plan?.secondary).toContain('refine_search')
  })

  it('jamais « Affiner la recherche » ni « Découvrir » sans critères à transporter', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(2) })
    const all = [plan?.primary, ...(plan?.secondary ?? [])]
    expect(all).not.toContain('refine_search')
  })

  it('un classement de plusieurs comptes recommande la liste de travail', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(3), blockTypes: ['account_ranking'] })
    expect(plan?.primary).toBe('create_worklist')
  })

  it('une liste de travail exige au moins deux comptes (un seul compte : voir le compte)', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(1), blockTypes: ['account_card'] })
    expect([plan?.primary, ...(plan?.secondary ?? [])]).not.toContain('create_worklist')
    expect(plan?.primary).toBe('find_contacts')
  })

  it('des données manquantes nommées → la qualification complémentaire passe devant', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(1), blockTypes: ['verdict'], hasMissingData: true })
    expect(plan?.primary).toBe('qualify_further')
  })

  it('une liste de contacts recommande de préparer l’approche, et ne re-propose pas « trouver les contacts »', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(1), blockTypes: ['contact_list'] })
    expect(plan?.primary).toBe('prepare_approach')
    expect(plan?.secondary).not.toContain('find_contacts')
  })

  it('une approche déjà rédigée ne re-propose pas « préparer l’approche »', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(1), blockTypes: ['approach'] })
    expect([plan?.primary, ...(plan?.secondary ?? [])]).not.toContain('prepare_approach')
  })

  it('UN seul principal, aucun doublon, « Ignorer » toujours en dernier, au plus 5 gestes', () => {
    const plan = replyActionsFor({
      ...base,
      accountIds: ids(4),
      blockTypes: ['account_ranking'],
      hasDiscoverCriteria: true,
      hasMissingData: true,
    })
    const all = [plan?.primary, ...(plan?.secondary ?? [])]
    expect(new Set(all).size).toBe(all.length)
    expect(all.at(-1)).toBe('dismiss')
    expect(all.length).toBeLessThanOrEqual(5)
    expect(plan?.secondary).not.toContain(plan?.primary)
  })

  it('tous les gestes émis appartiennent au contrat', () => {
    const plan = replyActionsFor({ ...base, accountIds: ids(3), hasDiscoverCriteria: true, hasMissingData: true })
    for (const kind of [plan?.primary, ...(plan?.secondary ?? [])]) expect(REPLY_ACTION_KINDS).toContain(kind)
  })
})
