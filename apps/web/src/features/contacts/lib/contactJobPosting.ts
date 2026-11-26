import type { ContactJobPostingEvidence } from '@bellum/contracts'
import { safeHref } from '@/lib/safe-href'

/**
 * SIG-B (11/10/2026) — la PREUVE d'un recruteur nommé par une offre d'emploi
 * publiée (`raw_data.jobPosting`, posée par la collecte), ou `null`.
 *
 * Une preuve se VÉRIFIE : sans URL http(s), il n'y a rien à montrer (`null`),
 * jamais une ligne vide. Date absente → absente, jamais devinée.
 */
export function contactJobPostingProof(
  rawData: Record<string, unknown> | null | undefined,
): ContactJobPostingEvidence | null {
  const proof = rawData?.['jobPosting']
  if (typeof proof !== 'object' || proof === null) return null
  const entry = proof as Record<string, unknown>
  const url = safeHref(typeof entry['url'] === 'string' ? entry['url'] : null)
  if (!url) return null
  const title = typeof entry['title'] === 'string' ? entry['title'].trim() : ''
  const postedAt = typeof entry['postedAt'] === 'string' ? entry['postedAt'].trim() : ''
  return { title, url, ...(postedAt ? { postedAt } : {}) }
}
