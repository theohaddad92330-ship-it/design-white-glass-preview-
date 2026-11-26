import { beforeEach } from 'vitest'
import {
  dismissCandidate,
  followCandidate,
  readShortlist,
  undismissCandidate,
  unfollowCandidate,
} from './discover-shortlist'

beforeEach(() => localStorage.clear())

describe('discover shortlist', () => {
  it('starts empty', () => {
    const list = readShortlist('user-1')
    expect(list.followed.size).toBe(0)
    expect(list.dismissed.size).toBe(0)
  })

  it('remembers a followed candidate across reads', () => {
    followCandidate('user-1', '552100554')
    expect(readShortlist('user-1').followed.has('552100554')).toBe(true)
  })

  it('remembers a dismissed candidate — « Écarter » ne réapparaît pas demain', () => {
    dismissCandidate('user-1', '552100554')
    expect(readShortlist('user-1').dismissed.has('552100554')).toBe(true)
  })

  it('un-follows and un-dismisses', () => {
    followCandidate('user-1', '552100554')
    unfollowCandidate('user-1', '552100554')
    expect(readShortlist('user-1').followed.has('552100554')).toBe(false)

    dismissCandidate('user-1', '111111111')
    undismissCandidate('user-1', '111111111')
    expect(readShortlist('user-1').dismissed.has('111111111')).toBe(false)
  })

  it('drops the follow when the same candidate is dismissed (the two are exclusive)', () => {
    followCandidate('user-1', '552100554')
    dismissCandidate('user-1', '552100554')
    const list = readShortlist('user-1')
    expect(list.dismissed.has('552100554')).toBe(true)
    expect(list.followed.has('552100554')).toBe(false)
  })

  it('drops the dismissal when the same candidate is followed again', () => {
    dismissCandidate('user-1', '552100554')
    followCandidate('user-1', '552100554')
    const list = readShortlist('user-1')
    expect(list.followed.has('552100554')).toBe(true)
    expect(list.dismissed.has('552100554')).toBe(false)
  })

  it("scopes state per user — un commercial ne voit pas les écarts d'un autre", () => {
    dismissCandidate('user-1', '552100554')
    expect(readShortlist('user-2').dismissed.size).toBe(0)
  })

  it('is a no-op without a user id rather than writing a shared key', () => {
    followCandidate(undefined, '552100554')
    expect(readShortlist(undefined).followed.size).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  it('de-duplicates repeated follows', () => {
    followCandidate('user-1', '552100554')
    followCandidate('user-1', '552100554')
    expect(readShortlist('user-1').followed.size).toBe(1)
  })

  it('survives a corrupted payload without throwing', () => {
    localStorage.setItem('bellum:discover:shortlist:user-1', '{ not json')
    expect(readShortlist('user-1').followed.size).toBe(0)
  })

  it('ignores non-string entries in a tampered payload', () => {
    localStorage.setItem(
      'bellum:discover:shortlist:user-1',
      JSON.stringify({ followed: ['552100554', 42, null], dismissed: 'nope' }),
    )
    const list = readShortlist('user-1')
    expect([...list.followed]).toEqual(['552100554'])
    expect(list.dismissed.size).toBe(0)
  })
})
