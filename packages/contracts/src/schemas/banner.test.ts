import { describe, expect, it } from 'vitest'

import {
  adminBannerSchema,
  bannerCtaIsComplete,
  bannerWindowIsValid,
  createBannerSchema,
  publicBannerSchema,
  toggleBannerSchema,
  updateBannerSchema,
} from './banner.js'

// #1667.2 — endsAt is mandatory at write time, so the shared minimal-valid
// fixture carries one; the two tests that must construct an endsAt-less body
// build it literally instead of spreading this.
const validCreate = {
  kind: 'announcement' as const,
  titleFr: 'Nouveauté',
  titleEn: 'What’s new',
  endsAt: '2026-08-01T00:00:00.000Z',
}

describe('createBannerSchema', () => {
  it('accepts a minimal announcement and applies defaults', () => {
    const parsed = createBannerSchema.parse(validCreate)
    expect(parsed.variant).toBe('info')
    expect(parsed.placement).toBe('app')
    expect(parsed.audience).toBe('all')
    expect(parsed.dismissible).toBe(true)
    expect(parsed.priority).toBe(0)
    expect(parsed.active).toBe(true)
    expect(parsed.bodyFr).toBe('')
    expect(parsed.bodyEn).toBe('')
  })

  it('rejects an unknown kind', () => {
    expect(() => createBannerSchema.parse({ ...validCreate, kind: 'promo' })).toThrow()
  })

  it('rejects an unknown variant', () => {
    expect(() => createBannerSchema.parse({ ...validCreate, variant: 'danger' })).toThrow()
  })

  it('requires non-empty FR and EN titles', () => {
    expect(() => createBannerSchema.parse({ ...validCreate, titleFr: '' })).toThrow()
    expect(() => createBannerSchema.parse({ ...validCreate, titleEn: '' })).toThrow()
  })

  it('rejects a window where endsAt is not after startsAt', () => {
    expect(() =>
      createBannerSchema.parse({
        ...validCreate,
        startsAt: '2026-07-20T00:00:00.000Z',
        endsAt: '2026-07-19T00:00:00.000Z',
      }),
    ).toThrow(/endsAt must be after startsAt/)
  })

  it('accepts an open start (startsAt: null) as long as endsAt is a real date', () => {
    const parsed = createBannerSchema.parse({
      ...validCreate,
      startsAt: null,
      endsAt: '2026-08-01T00:00:00.000Z',
    })
    expect(parsed.startsAt).toBeNull()
    expect(parsed.endsAt).toBe('2026-08-01T00:00:00.000Z')
  })

  // #1667.2 — a banner without an end date stays on client screens FOREVER,
  // and nobody remembers it's there. `endsAt` is mandatory at WRITE time (the
  // form/API boundary) — existing rows with `endsAt: null` still READ fine
  // (see `adminBannerSchema` below): this is an additive tightening of the
  // write contract, not a DB constraint change.
  it('rejects a create with no endsAt at all (the bug this closes)', () => {
    expect(() =>
      createBannerSchema.parse({ kind: 'announcement', titleFr: 'Nouveauté', titleEn: 'What’s new' }),
    ).toThrow()
  })

  it('rejects a create with endsAt explicitly null', () => {
    expect(() => createBannerSchema.parse({ ...validCreate, endsAt: null })).toThrow()
  })

  it('accepts a complete CTA (url + both labels)', () => {
    const parsed = createBannerSchema.parse({
      ...validCreate,
      ctaUrl: 'https://bellum-ai.com/offre',
      ctaLabelFr: 'Voir l’offre',
      ctaLabelEn: 'See the offer',
    })
    expect(parsed.ctaUrl).toBe('https://bellum-ai.com/offre')
  })

  it('rejects a partial CTA (label without url)', () => {
    expect(() => createBannerSchema.parse({ ...validCreate, ctaLabelFr: 'Voir' })).toThrow(/CTA needs a URL/)
  })

  it('rejects a CTA url that is not a valid URL', () => {
    expect(() =>
      createBannerSchema.parse({ ...validCreate, ctaUrl: 'not-a-url', ctaLabelFr: 'a', ctaLabelEn: 'b' }),
    ).toThrow()
  })
})

describe('updateBannerSchema', () => {
  it('allows a single-field patch', () => {
    expect(updateBannerSchema.parse({ active: false })).toEqual({ active: false })
  })

  it('still enforces the window rule on a patch', () => {
    expect(() =>
      updateBannerSchema.parse({
        startsAt: '2026-07-20T00:00:00.000Z',
        endsAt: '2026-07-19T00:00:00.000Z',
      }),
    ).toThrow(/endsAt must be after startsAt/)
  })

  // #1667.2 — a patch MAY omit endsAt (leaving it untouched), but if it's
  // present it must be a real date. This is what forces an operator editing a
  // pre-existing endsAt:null banner to give it one before saving again — the
  // write door stays shut even on the edit path, not just create.
  it('rejects an explicit endsAt: null on a patch', () => {
    expect(() => updateBannerSchema.parse({ endsAt: null })).toThrow()
  })
})

describe('toggleBannerSchema', () => {
  it('requires a boolean active flag', () => {
    expect(toggleBannerSchema.parse({ active: true })).toEqual({ active: true })
    expect(() => toggleBannerSchema.parse({ active: 'yes' })).toThrow()
  })
})

describe('publicBannerSchema', () => {
  it('parses a full public banner', () => {
    const parsed = publicBannerSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'offer',
      variant: 'success',
      title: { fr: 'Offre', en: 'Offer' },
      body: { fr: 'corps', en: 'body' },
      cta: { label: { fr: 'Go', en: 'Go' }, url: 'https://bellum-ai.com' },
      dismissible: true,
      priority: 5,
      version: 2,
    })
    expect(parsed.cta?.url).toBe('https://bellum-ai.com')
  })

  it('rejects a non-positive version', () => {
    expect(() =>
      publicBannerSchema.parse({
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'offer',
        variant: 'success',
        title: { fr: 'a', en: 'b' },
        body: { fr: '', en: '' },
        cta: null,
        dismissible: true,
        priority: 0,
        version: 0,
      }),
    ).toThrow()
  })
})

describe('adminBannerSchema', () => {
  it('carries the full scheduling + audit fields', () => {
    const parsed = adminBannerSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      kind: 'maintenance',
      variant: 'warning',
      titleFr: 'Maintenance',
      titleEn: 'Maintenance',
      bodyFr: '',
      bodyEn: '',
      ctaLabelFr: null,
      ctaLabelEn: null,
      ctaUrl: null,
      placement: 'both',
      audience: 'all',
      startsAt: null,
      endsAt: null,
      dismissible: false,
      priority: 10,
      active: true,
      version: 1,
      createdBy: 'operator',
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    })
    expect(parsed.placement).toBe('both')
    expect(parsed.dismissible).toBe(false)
  })
})

describe('pure visibility helpers', () => {
  it('bannerWindowIsValid: open bounds are always valid', () => {
    expect(bannerWindowIsValid({})).toBe(true)
    expect(bannerWindowIsValid({ startsAt: null, endsAt: null })).toBe(true)
  })

  it('bannerWindowIsValid: rejects inverted bounds', () => {
    expect(bannerWindowIsValid({ startsAt: '2026-01-02T00:00:00Z', endsAt: '2026-01-01T00:00:00Z' })).toBe(false)
  })

  it('bannerCtaIsComplete: empty CTA is complete', () => {
    expect(bannerCtaIsComplete({})).toBe(true)
  })

  it('bannerCtaIsComplete: partial CTA is incomplete', () => {
    expect(bannerCtaIsComplete({ ctaUrl: 'https://x.io' })).toBe(false)
    expect(bannerCtaIsComplete({ ctaLabelFr: 'a', ctaLabelEn: 'b' })).toBe(false)
  })
})
