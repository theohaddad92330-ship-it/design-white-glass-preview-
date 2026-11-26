import { z } from 'zod'
import { brandSchema } from './brand.js'

/**
 * #2128.11 — un lien de partage porte le dossier ENTIER (`full`, défaut) ou
 * UNE section (`evaluation` : score + justification, rien d'autre). Tranché
 * sans Louis (25/09/2026) : un TOKEN par section plutôt qu'un objet
 * « audience de partage » — la seule section publiquement montrable sans
 * inventer de nouvelle donnée est celle déjà exposée par `SharePublicService`
 * (score, justification), pas un écran neuf (organigramme, plan…) qui
 * demanderait de sélectionner et sérialiser des données qui ne voyagent
 * jamais aujourd'hui sur ce chemin public.
 */
export const ACCOUNT_SHARE_SECTIONS = ['full', 'evaluation'] as const
export const accountShareSectionSchema = z.enum(ACCOUNT_SHARE_SECTIONS)
export type AccountShareSection = z.infer<typeof accountShareSectionSchema>

/**
 * Champs retirés EN PLUS de `SHARE_REDACTED_FIELDS` quand le lien ne porte
 * qu'une section — liste UNIQUE (GA-26), lue par `share-public.service.ts`
 * pour construire `redactedFields` et par rien d'autre.
 */
export const SHARE_SECTION_EXTRA_REDACTED_FIELDS: Record<
  AccountShareSection,
  ReadonlyArray<{ field: string; reason: string }>
> = {
  full: [],
  evaluation: [
    { field: 'account.sector', reason: 'lien réduit à la section Score — le secteur ne fait pas partie du partage' },
    {
      field: 'account.employees',
      reason: "lien réduit à la section Score — l'effectif ne fait pas partie du partage",
    },
    {
      field: 'account.headquarters',
      reason: 'lien réduit à la section Score — le siège ne fait pas partie du partage',
    },
    { field: 'account.website', reason: 'lien réduit à la section Score — le site ne fait pas partie du partage' },
  ],
}

/** Corps de `POST /accounts/:id/share` — `section` absente = `'full'`. */
export const createAccountShareRequestSchema = z.object({
  section: accountShareSectionSchema.optional(),
})

export type CreateAccountShareRequest = z.infer<typeof createAccountShareRequestSchema>

/**
 * Public share link to an account dossier — slug-based (no token in URL).
 * Anyone holding the URL can read the account in read-only mode until
 * `expiresAt`. Slugs are produced server-side from the company name plus
 * a short random suffix so URLs stay human-readable while remaining
 * unguessable in practice.
 */
export const accountShareLinkSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  section: accountShareSectionSchema,
})

export type AccountShareLink = z.infer<typeof accountShareLinkSchema>

/**
 * #2125.23/.26 — Champs retirés du rendu PUBLIC d'un dossier partagé
 * (`GET /share/:slug`, accessible sans authentification à quiconque tient
 * le lien). Décision de Louis, 14/09/2026 20:35 : le lien reste public et
 * simple — pas de jeton, pas de rôle, pas de permission par livrable (ce que
 * #2125.11/.24 avaient demandé a été écarté) — mais ces champs ne voyagent
 * JAMAIS jusqu'au destinataire.
 *
 * Liste UNIQUE (loi « un réglage vit à un seul endroit », GA-26) : le
 * service de rendu (`share-public.service.ts`) ET l'écran public
 * (`PublicSharePage.tsx`) lisent CETTE liste — jamais une copie locale.
 */
export const SHARE_REDACTED_FIELDS = [
  {
    field: 'account.revenue',
    reason:
      "chiffre d'affaires — une donnée financière de compte ne s'agrège ni ne se partage entre espaces concurrents (doctrine)",
  },
  {
    field: 'contacts',
    reason:
      'contacts nominatifs (nom, e-mail, téléphone, poste) — identifient des personnes, jamais montrés sur un lien accessible sans authentification',
  },
] as const satisfies ReadonlyArray<{ field: string; reason: string }>

export type ShareRedactedField = (typeof SHARE_REDACTED_FIELDS)[number]['field']

/**
 * Read-only payload returned by `GET /share/:slug` — only the fields the
 * public viewer renders. Anything not displayed (user_id, raw_data,
 * generated messages, internal IDs, …) is intentionally omitted, both to
 * keep the wire small and to avoid leaking internal context to recipients
 * of the link.
 */
export const accountSharePayloadSchema = z.object({
  account: z.object({
    company_name: z.string(),
    sector: z.string().nullable(),
    employees: z.string().nullable(),
    revenue: z.string().nullable(),
    headquarters: z.string().nullable(),
    website: z.string().nullable(),
    priority_score: z.number().nullable(),
    priority_justification: z.string().nullable(),
  }),
  contacts: z.array(
    z.object({
      id: z.string(),
      full_name: z.string(),
      title: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      linkedin_url: z.string().nullable(),
    }),
  ),
  expiresAt: z.string().datetime(),
  /**
   * La marque de l'espace qui a émis le lien — marque blanche, 01/09/2026.
   *
   * ⚠️ Elle voyage DANS la charge utile et n'est pas relue par l'hôte : un
   * lien de partage s'ouvre le plus souvent sur NOTRE domaine (c'est nous qui
   * le servons), pas sur celui du client. Résoudre par l'hôte rendrait donc
   * notre marque sur un dossier que le client envoie à SON client — le seul
   * endroit où la marque blanche compte vraiment.
   *
   * Toujours présente : `resolveBrand(null)` rend la marque du produit pour un
   * lien émis avant que l'espace n'existe.
   */
  brand: brandSchema,
  /**
   * #2125.23 — la liste des champs retirés de CE rendu, dérivée de
   * `SHARE_REDACTED_FIELDS` + `SHARE_SECTION_EXTRA_REDACTED_FIELDS[section]`.
   * Sert à l'écran public à distinguer une valeur MASQUÉE (« pas partagée »)
   * d'une valeur simplement absente (« pas mesurée ») — jamais la même
   * phrase, jamais un zéro, jamais un tiret muet pour les deux (doctrine
   * « non mesuré n'est jamais 0 »).
   */
  redactedFields: z.array(z.string()),
  /** #2128.11 — la section que CE lien porte ; `PublicSharePage` n'en a pas
   * besoin aujourd'hui (les champs masqués suffisent à réduire l'affichage),
   * mais elle voyage pour qu'un futur écran n'ait pas à la redeviner. */
  section: accountShareSectionSchema,
})

export type AccountSharePayload = z.infer<typeof accountSharePayloadSchema>
