import { redirect } from 'next/navigation'

// "Lancer une analyse" was merged into the consolidated "Analyses" umbrella. This
// route is kept as a redirect so existing links/bookmarks still work.
export const dynamic = 'force-dynamic'

export default function RunIndex() {
  redirect('/monitoring?view=lancer')
}
