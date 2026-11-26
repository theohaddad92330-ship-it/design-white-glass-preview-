import { backfillRecruitmentUrls } from './recruitment-signal-url.backfill'

// #4045.1 — rattrapage des liens d'offre : l'URL est DÉJÀ stockée (raw_analysis.it_job_signals),
// le rattrapage la recopie sur le signal de recrutement qui n'en a pas — jamais devinée.
const job = (over: Record<string, unknown> = {}) => ({
  title: 'Architecte Cloud AWS',
  date: '2026-09-30',
  url: 'https://emploi.example/offre/1',
  ...over,
})
const signal = (over: Record<string, unknown> = {}) => ({
  signal: 'Architecte Cloud AWS',
  type: 'recrutement',
  date: '2026-09-30',
  source: "Offre d'emploi publiée",
  ...over,
})

describe('backfillRecruitmentUrls', () => {
  it('pose l’URL stockée sur le recrutement de même intitulé et même jour', () => {
    const out = backfillRecruitmentUrls([signal()], [job()])
    expect(out.patched).toBe(1)
    expect(out.signals[0]).toMatchObject({ url: 'https://emploi.example/offre/1', source_kind: 'job' })
  })

  it('dit NON : intitulé différent, rien n’est posé', () => {
    const out = backfillRecruitmentUrls([signal({ signal: 'Chef de projet SAP' })], [job()])
    expect(out.patched).toBe(0)
    expect(out.signals[0]).not.toHaveProperty('url')
  })

  it('dit NON : deux entités, même intitulé et même jour, deux liens → ambigu, rien', () => {
    const out = backfillRecruitmentUrls([signal()], [job(), job({ url: 'https://emploi.example/offre/2' })])
    expect(out.patched).toBe(0)
    expect(out.ambiguous).toBe(1)
    expect(out.signals[0]).not.toHaveProperty('url')
  })

  it('dit NON : deux signaux de même clé et même jour → aucun ne reçoit le lien', () => {
    const out = backfillRecruitmentUrls([signal(), signal()], [job()])
    expect(out.patched).toBe(0)
  })

  it('dit NON : le jour diffère', () => {
    expect(backfillRecruitmentUrls([signal({ date: '2026-10-02' })], [job()]).patched).toBe(0)
  })

  it('dit NON : l’offre d’un intermédiaire, ou une URL non http(s)', () => {
    expect(backfillRecruitmentUrls([signal()], [job({ intermediated: true })]).patched).toBe(0)
    expect(backfillRecruitmentUrls([signal()], [job({ url: 'javascript:alert(1)' })]).patched).toBe(0)
    expect(backfillRecruitmentUrls([signal()], [job({ url: null })]).patched).toBe(0)
  })

  it('n’écrase jamais un lien déjà posé et ne touche pas un signal d’une autre nature', () => {
    const kept = signal({ url: 'https://autre.example/x', source_kind: 'press' })
    const press = signal({ type: 'levee' })
    const out = backfillRecruitmentUrls([kept, press], [job()])
    expect(out.patched).toBe(0)
    expect(out.signals[0]).toEqual(kept)
    expect(out.signals[1]).toEqual(press)
  })

  it('est idempotent : un second passage ne patche plus rien', () => {
    const first = backfillRecruitmentUrls([signal()], [job()])
    expect(backfillRecruitmentUrls(first.signals, [job()]).patched).toBe(0)
  })

  it('entrées non-listes : rien, sans lever', () => {
    expect(backfillRecruitmentUrls(null, undefined)).toEqual({ signals: [], patched: 0, ambiguous: 0 })
  })
})
