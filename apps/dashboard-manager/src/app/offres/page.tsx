import { redirect } from 'next/navigation'

// Offres was merged into the consolidated "Facturation" screen. This route is
// kept as a redirect so existing links/bookmarks still work.
export const dynamic = 'force-dynamic'

export default function OffresIndex() {
  redirect('/facturation?view=offres')
}
