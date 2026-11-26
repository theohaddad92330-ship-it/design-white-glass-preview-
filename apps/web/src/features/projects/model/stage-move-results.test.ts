import { describe, expect, it } from 'vitest'
import { stageResultTarget } from './stage-move-results'

// #4339.2 — chaque résultat d'une proposition cochée est OUVRABLE : on sait où il vit.
describe('stageResultTarget', () => {
  it('une tâche se retrouve dans Aujourd’hui', () => {
    expect(stageResultTarget({ key: 'schedule_interview', kind: 'task', id: 't-1', href: null })).toEqual({
      kind: 'route',
      to: '/actions',
    })
  })

  it('un brouillon s’ouvre dans la messagerie quand le fournisseur rend son lien', () => {
    expect(
      stageResultTarget({ key: 'prepare_follow_up_mail', kind: 'draft', id: 'd-1', href: 'https://mail.example/d-1' }),
    ).toEqual({ kind: 'url', href: 'https://mail.example/d-1' })
  })

  it('un brouillon sans lien ne fabrique pas de lien : aucune porte', () => {
    expect(stageResultTarget({ key: 'prepare_follow_up_mail', kind: 'draft', id: 'd-1', href: null })).toBeNull()
  })

  it('un matching mène au besoin dont les profils sont classés', () => {
    expect(stageResultTarget({ key: 'search_more_profiles', kind: 'matching', id: 'need-1', href: null })).toEqual({
      kind: 'route',
      to: '/projects/needs/$needId',
      params: { needId: 'need-1' },
    })
  })

  it('un matching sans besoin désigné ne mène nulle part', () => {
    expect(stageResultTarget({ key: 'search_more_profiles', kind: 'matching', id: null, href: null })).toBeNull()
  })

  it('un lien de brouillon qui n’est pas https est refusé', () => {
    expect(stageResultTarget({ key: 'k', kind: 'draft', id: 'd', href: 'javascript:alert(1)' })).toBeNull()
  })
})
