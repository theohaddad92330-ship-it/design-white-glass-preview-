import { notFound } from 'next/navigation'

/** Anything under a locale that doesn't match a real route renders the localized 404. */
export default function CatchAllPage() {
  notFound()
}
