import { z } from 'zod'

/**
 * Admin-scheduled banner / announcement wire schemas.
 *
 * A banner is an operator-managed, top-of-screen message shown in the user app
 * (`apps/web`) and/or the public website (`apps/website`). Kinds: a product
 * `announcement`, a `maintenance` notice, or a marketing `offer` (e.g.
 * "1 crédit acheté = 1 crédit offert"). Distinct from the static in-repo
 * "Nouveautés" changelog — these are created/scheduled/toggled from the
 * backoffice (`dashboard-manager`) and read live by the front-ends.
 *
 * Content is stored bilingual (FR + EN); the viewer's locale picks the string.
 * The PUBLIC shape ({@link publicBannerSchema}) exposes ONLY non-sensitive,
 * render-time fields — never the scheduling window, `active` flag or audience.
 */

/**
 * #1960.13 — `incident` est AJOUTÉ EN FIN DE LISTE (GA-08 : un enum ne perd
 * jamais de valeur et n'en insère jamais au milieu), et sa contrainte SQL est
 * élargie AVANT par `BannerIncidentKind1795100000000` (GA-11 / GA-12).
 *
 * Il se distingue de `maintenance` par le TEMPS, et la distinction compte pour
 * qui est bloqué maintenant : `maintenance` annonce une interruption PRÉVUE,
 * `incident` dit qu'une panne est EN COURS et qu'on la sait. C'est le seul
 * drapeau qui autorise un refus à dire « incident connu » — rien ne le déduit
 * d'un taux d'erreur ni d'un 5xx (décision Louis 16/09/2026).
 */
export const bannerKindValues = ['announcement', 'maintenance', 'offer', 'incident'] as const
export const bannerKindSchema = z.enum(bannerKindValues)
export type BannerKind = z.infer<typeof bannerKindSchema>

/** Styling severity — decoupled from `kind` so an announcement can be `critical`. */
export const bannerVariantValues = ['info', 'success', 'warning', 'critical'] as const
export const bannerVariantSchema = z.enum(bannerVariantValues)
export type BannerVariant = z.infer<typeof bannerVariantSchema>

/** Where the banner may appear. `both` = app + website. */
export const bannerPlacementValues = ['app', 'website', 'both'] as const
export const bannerPlacementSchema = z.enum(bannerPlacementValues)
export type BannerPlacement = z.infer<typeof bannerPlacementSchema>

/** Targeting hint (NOT a security boundary — the read endpoint is public):
 *  `all` shows to everyone, `authenticated` only when the viewer is signed in. */
export const bannerAudienceValues = ['all', 'authenticated'] as const
export const bannerAudienceSchema = z.enum(bannerAudienceValues)
export type BannerAudience = z.infer<typeof bannerAudienceSchema>

/** A concrete surface a viewer is on (never `both`) — the public query param. */
export const bannerViewerPlacementValues = ['app', 'website'] as const
export const bannerViewerPlacementSchema = z.enum(bannerViewerPlacementValues)
export type BannerViewerPlacement = z.infer<typeof bannerViewerPlacementSchema>

/** Bilingual text. Both locales carried; the front-end renders the viewer's. */
const bannerLocalizedTextSchema = z.object({
  fr: z.string(),
  en: z.string(),
})

/* ── Public read shape ────────────────────────────────────────────────────── */

/**
 * The public, cache-friendly banner shape. Only render-time fields — no
 * scheduling window, no `active`, no audience, no `created_by`. `version` is a
 * monotonic revision bumped on every operator save; the client persists a
 * dismissal keyed by `${id}:${version}` so a re-published banner reappears.
 */
export const publicBannerSchema = z.object({
  id: z.string().guid(),
  kind: bannerKindSchema,
  variant: bannerVariantSchema,
  title: bannerLocalizedTextSchema,
  body: bannerLocalizedTextSchema,
  cta: z.object({ label: bannerLocalizedTextSchema, url: z.string().url() }).nullable(),
  dismissible: z.boolean(),
  priority: z.number().int(),
  version: z.number().int().positive(),
})
export type PublicBanner = z.infer<typeof publicBannerSchema>

export const publicBannersResponseSchema = z.object({ banners: z.array(publicBannerSchema) })
export type PublicBannersResponse = z.infer<typeof publicBannersResponseSchema>

/* ── Admin (backoffice) shapes ────────────────────────────────────────────── */

/** Full banner as the backoffice sees it (every column). */
export const adminBannerSchema = z.object({
  id: z.string().guid(),
  kind: bannerKindSchema,
  variant: bannerVariantSchema,
  titleFr: z.string(),
  titleEn: z.string(),
  bodyFr: z.string(),
  bodyEn: z.string(),
  ctaLabelFr: z.string().nullable(),
  ctaLabelEn: z.string().nullable(),
  ctaUrl: z.string().nullable(),
  placement: bannerPlacementSchema,
  audience: bannerAudienceSchema,
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  dismissible: z.boolean(),
  priority: z.number().int(),
  active: z.boolean(),
  version: z.number().int().positive(),
  createdBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type AdminBanner = z.infer<typeof adminBannerSchema>

export const adminBannersResponseSchema = z.object({ banners: z.array(adminBannerSchema) })
export type AdminBannersResponse = z.infer<typeof adminBannersResponseSchema>

/* ── Write bodies (create / update / toggle) ─────────────────────────────── */

const nullableDatetime = z.string().datetime().nullable().optional()

/**
 * Bare object (no refinements) — reused to derive the partial update body.
 *
 * `endsAt` (#1667.2) is a real, required datetime — NOT `nullableDatetime`
 * like `startsAt`. A banner with no end date stays on client screens forever
 * and nobody remembers it's there. This tightens the WRITE contract only:
 * `.partial()` (below, for `updateBannerSchema`) makes it optional again so a
 * patch may omit it — but if present it still must be a real date, never
 * `null`. The READ shapes (`adminBannerSchema`, `publicBannerSchema`) keep
 * `endsAt` nullable so rows already in the database (created before this
 * lot) keep reading fine — this is additive on write, not a DB constraint
 * change (`banners.ends_at` stays a nullable column).
 */
const bannerBodySchema = z.string().max(2000)
const bannerPrioritySchema = z.number().int().min(-1000).max(1000)

export const bannerWriteBase = z.object({
  kind: bannerKindSchema,
  variant: bannerVariantSchema.default('info'),
  titleFr: z.string().min(1).max(200),
  titleEn: z.string().min(1).max(200),
  bodyFr: bannerBodySchema.default(''),
  bodyEn: bannerBodySchema.default(''),
  ctaLabelFr: z.string().max(80).nullable().optional(),
  ctaLabelEn: z.string().max(80).nullable().optional(),
  ctaUrl: z.string().url().max(2000).nullable().optional(),
  placement: bannerPlacementSchema.default('app'),
  audience: bannerAudienceSchema.default('all'),
  startsAt: nullableDatetime,
  endsAt: z.string().datetime(),
  dismissible: z.boolean().default(true),
  priority: bannerPrioritySchema.default(0),
  active: z.boolean().default(true),
})

/** `endsAt` (when both are set) must be strictly after `startsAt`. */
export function bannerWindowIsValid(b: { startsAt?: string | null; endsAt?: string | null }): boolean {
  if (!b.startsAt || !b.endsAt) return true
  return new Date(b.endsAt).getTime() > new Date(b.startsAt).getTime()
}

/** CTA is all-or-nothing: either no CTA at all, or a URL + both FR/EN labels. */
export function bannerCtaIsComplete(b: {
  ctaUrl?: string | null
  ctaLabelFr?: string | null
  ctaLabelEn?: string | null
}): boolean {
  const hasUrl = !!b.ctaUrl
  const anyLabel = !!b.ctaLabelFr || !!b.ctaLabelEn
  if (!hasUrl && !anyLabel) return true
  return hasUrl && !!b.ctaLabelFr && !!b.ctaLabelEn
}

const WINDOW_MESSAGE = 'endsAt must be after startsAt'
const CTA_MESSAGE = 'A CTA needs a URL and both FR/EN labels'

/** Body of `POST /internal/admin/banners`. */
export const createBannerSchema = bannerWriteBase.superRefine((b, ctx) => {
  if (!bannerWindowIsValid(b)) ctx.addIssue({ code: 'custom', message: WINDOW_MESSAGE, path: ['endsAt'] })
  if (!bannerCtaIsComplete(b)) ctx.addIssue({ code: 'custom', message: CTA_MESSAGE, path: ['ctaUrl'] })
})
export type CreateBanner = z.infer<typeof createBannerSchema>

/** Body of `PATCH /internal/admin/banners/:id` — every field optional. */
// zod 4 applique le `.default()` d'un champ même sous `.partial()` : un PATCH
// `{ active: false }` remettrait alors variante, textes, priorité… à leur défaut.
// Les champs à défaut sont donc redéclarés SANS défaut : absent = non touché.
export const updateBannerSchema = bannerWriteBase
  .partial()
  .extend({
    variant: bannerVariantSchema.optional(),
    bodyFr: bannerBodySchema.optional(),
    bodyEn: bannerBodySchema.optional(),
    placement: bannerPlacementSchema.optional(),
    audience: bannerAudienceSchema.optional(),
    dismissible: z.boolean().optional(),
    priority: bannerPrioritySchema.optional(),
    active: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    if (!bannerWindowIsValid(b)) ctx.addIssue({ code: 'custom', message: WINDOW_MESSAGE, path: ['endsAt'] })
    if (!bannerCtaIsComplete(b)) ctx.addIssue({ code: 'custom', message: CTA_MESSAGE, path: ['ctaUrl'] })
  })
export type UpdateBanner = z.infer<typeof updateBannerSchema>

/** Body of `PATCH /internal/admin/banners/:id/toggle`. */
export const toggleBannerSchema = z.object({ active: z.boolean() })
export type ToggleBanner = z.infer<typeof toggleBannerSchema>
