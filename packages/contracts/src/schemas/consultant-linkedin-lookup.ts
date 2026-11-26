import { z } from 'zod'
import type { ApolloEnrichmentData } from './ia.js'

/**
 * H-DECISIONS #4348 — « ajouter un consultant depuis l'URL de son profil
 * LinkedIn » (décision Louis 20/10/2026, doctrine `c95_linkedin_fournisseur_sous_contrat`).
 *
 * L'URL est une CLÉ D'IDENTITÉ remise à un fournisseur de données sous contrat
 * (côté IA, `people/match`) : Bellum ne visite jamais linkedin.com, ne scrape
 * rien, n'ouvre aucune session. Ce fichier est la moitié PURE — lire l'URL,
 * composer le brouillon ; l'appel et le débit vivent dans le contrôleur.
 *
 * Le brouillon n'est JAMAIS enregistré ici : il pré-remplit le formulaire, que
 * l'humain relit et corrige avant d'enregistrer. Présent-seulement — une
 * compétence que le fournisseur ne rend pas reste vide, jamais devinée.
 */

/** Un profil public se reconnaît à `linkedin.com/in/<slug>` — rien d'autre
 *  (pas `/company/`, pas `/feed/`, pas un domaine qui se contente de contenir
 *  « linkedin.com »). */
const LINKEDIN_PROFILE = /^(?:[a-z0-9-]+\.)?linkedin\.com\/in\/([^/\s]+)$/

export type LinkedInProfileRef = { slug: string; url: string }

/** Lit l'URL collée. `null` = ce n'est pas un profil. Le slug (minuscule) est la
 *  clé du cache côté IA : `Nadia-Benali`, `fr.linkedin.com` et `?utm=…` ne font
 *  pas une seconde personne, donc pas un second crédit. */
export function parseLinkedInProfileUrl(raw: string): LinkedInProfileRef | null {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  const slug = LINKEDIN_PROFILE.exec(text)?.[1]
  if (!slug || !/^[\p{L}\p{N}%_.-]+$/u.test(slug)) return null
  return { slug, url: `https://www.linkedin.com/in/${slug}` }
}

export const linkedinLookupRequestSchema = z.object({ url: z.string().trim().min(1).max(500) })

/** Ce qui pré-remplit le formulaire d'ajout. Tout est ÉDITABLE avant enregistrement. */
export const linkedinDraftSchema = z.object({
  full_name: z.string(),
  title: z.string().nullable(),
  public_profile_url: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** Le parcours rendu, une ligne par poste — la matière de la fiche, relue par un humain. */
  cv_text: z.string().nullable(),
  /** Vide tant que le fournisseur ne rend aucune compétence : jamais déduit du titre. */
  stack: z.array(z.string()),
  /** #4348.4 — ce que le fournisseur n'a PAS rendu : l'écran le dit, il ne le devine pas. */
  missing: z.array(z.enum(['title', 'email', 'phone', 'cv_text', 'stack'])),
  /** La source est NOMMÉE côté donnée ; l'écran ne nomme jamais le fournisseur (c19, c66). */
  source: z.literal('linkedin_profile'),
})
export type LinkedinDraft = z.infer<typeof linkedinDraftSchema>

/** `found: false` = « profil introuvable » : sans clé, sans résultat ou fournisseur muet,
 *  le message est le même et AUCUN crédit n'est débité. */
export const linkedinLookupResponseSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(true), draft: linkedinDraftSchema }),
  z.object({ found: z.literal(false), code: z.literal('profile_not_found') }),
])
export type LinkedinLookupResponse = z.infer<typeof linkedinLookupResponseSchema>

type LookupInput = Pick<ApolloEnrichmentData, 'matched'> &
  Partial<
    Pick<
      ApolloEnrichmentData,
      'first_name' | 'last_name' | 'title' | 'email' | 'phone' | 'linkedin_url' | 'employment_history'
    >
  >

const clean = (value: string | null | undefined): string | null => value?.trim() || null

function careerLine(entry: NonNullable<LookupInput['employment_history']>[number]): string | null {
  const title = clean(entry.title)
  const org = clean(entry.organization_name)
  if (!title && !org) return null
  const start = clean(entry.start_date)
  const end = entry.current ? 'aujourd’hui' : clean(entry.end_date)
  const span = start && end ? `${start} – ${end}` : (start ?? end)
  return [title, org, span].filter(Boolean).join(' · ')
}

/** Compose le brouillon, ou `null` : pas de correspondance, ou pas de nom — une fiche
 *  sans identité n'est pas un résultat, et on n'en invente pas une. */
export function buildLinkedinDraft(data: LookupInput, profileUrl: string): LinkedinDraft | null {
  if (!data.matched) return null
  const fullName = [clean(data.first_name), clean(data.last_name)].filter(Boolean).join(' ')
  if (!fullName) return null
  const lines = (data.employment_history ?? []).map(careerLine).filter((line): line is string => line !== null)
  const title = clean(data.title)
  const email = clean(data.email)
  const phone = clean(data.phone)
  const cvText = lines.length > 0 ? lines.join('\n') : null
  // #4348.4 — `stack` : aucun fournisseur ne rend de compétences, donc toujours dite absente.
  const missing: LinkedinDraft['missing'] = [
    ...(title ? [] : (['title'] as const)),
    ...(email ? [] : (['email'] as const)),
    ...(phone ? [] : (['phone'] as const)),
    ...(cvText ? [] : (['cv_text'] as const)),
    'stack',
  ]
  return {
    full_name: fullName,
    title,
    // L'URL que l'utilisateur a collée gagne : c'est elle qu'il a vérifiée.
    public_profile_url: profileUrl,
    email,
    phone,
    cv_text: cvText,
    stack: [],
    missing,
    source: 'linkedin_profile',
  }
}
