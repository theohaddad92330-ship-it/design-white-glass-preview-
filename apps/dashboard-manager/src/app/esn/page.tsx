import { redirect } from 'next/navigation'

// The ESN list was merged into the consolidated "Clients" screen. This route is
// kept as a redirect so existing links/bookmarks (and the detail page's "back"
// link) still work. The ESN DETAIL page /esn/[id] is unchanged.
export const dynamic = 'force-dynamic'

export default async function EsnIndex(props: { searchParams?: Promise<{ search?: string }> }) {
  const searchParams = await props.searchParams
  const search = searchParams?.search ? `&search=${encodeURIComponent(searchParams.search)}` : ''
  redirect(`/clients?view=esn${search}`)
}
