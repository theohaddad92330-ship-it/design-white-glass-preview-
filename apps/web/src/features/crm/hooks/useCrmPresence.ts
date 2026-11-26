import { useQuery } from '@tanstack/react-query'
import { crmApi, type CrmPresence } from '@/features/crm/api'
import { useSession } from '@/lib/hooks/use-session'

/** Extract a bare registrable-ish host from a website URL ("https://www.acme.fr/x"
 *  → "acme.fr"). Null on anything unparsable — better no domain than a wrong one.
 *  Mirror of the API's `domainFromWebsite` so the SPA sends the exact-match shape
 *  HubSpot/Salesforce expect. */
export function domainFromWebsite(website: string | null | undefined): string | null {
  const raw = (website ?? '').trim()
  if (!raw) return null
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
    const bare = host.replace(/^www\./i, '')
    return bare.includes('.') ? bare.toLowerCase() : null
  } catch {
    return null
  }
}

type PresenceInput = {
  companyName: string | null | undefined
  website?: string | null
  siren?: string | null
}

/**
 * « Déjà dans mon CRM ? » read-back for the account header. Enabled only when we
 * have a company name to anchor on and a session. A workspace with no CRM
 * connected gets `provider: null` back — the badge stays hidden (clean no-op).
 */
export function useCrmPresence({ companyName, website, siren }: PresenceInput) {
  const { user } = useSession()
  const account = companyName?.trim() ?? ''
  const domain = domainFromWebsite(website)

  return useQuery<CrmPresence>({
    queryKey: ['crm', 'presence', account, domain, siren ?? null],
    queryFn: () => crmApi.presence({ account, domain: domain ?? undefined, siren: siren ?? undefined }),
    enabled: !!user && account.length >= 2,
    staleTime: 5 * 60_000,
  })
}
