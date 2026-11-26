import { redirect } from 'next/navigation'

// Coûts & usage was merged into the consolidated "Facturation" screen. This
// route is kept as a redirect so existing links/bookmarks still work.
export const dynamic = 'force-dynamic'

export default function UsageIndex() {
  redirect('/facturation?view=usage')
}
