import { redirect } from 'next/navigation'

// The Équipes manager-KPIs list was fused into the consolidated "Clients" → ESN
// view (ESN annuaire + per-ESN KPIs on one screen). This route is kept as a
// redirect so existing links/bookmarks (and the team detail page's "back" link)
// still work. The team DETAIL page /teams/[id] is unchanged.
export const dynamic = 'force-dynamic'

export default async function TeamsIndex(props: { searchParams?: Promise<{ days?: string }> }) {
  const searchParams = await props.searchParams
  const days = searchParams?.days ? `&days=${encodeURIComponent(searchParams.days)}` : ''
  redirect(`/clients?view=esn${days}`)
}
