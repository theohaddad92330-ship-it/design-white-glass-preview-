import { Toaster } from '@bellum/ui'
import type { ReactNode } from 'react'
import { ChatWidgetMount } from '@/features/chatbot/ChatWidgetMount'
import { CookieContentCard } from '@/features/cookie-consent/CookieContentCard'
import { Footer } from '@/components/Footer'
import { Navbar } from '@/components/Navbar'

const PAGE_BACKGROUND =
  'pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1100px_720px_at_50%_-12%,rgba(99,86,225,0.32),transparent_62%),radial-gradient(760px_560px_at_84%_6%,rgba(77,157,255,0.18),transparent_58%),radial-gradient(680px_520px_at_8%_12%,rgba(123,97,255,0.16),transparent_58%),linear-gradient(180deg,#0a0c1a_0%,#06070e_38%,#05060c_100%)]'

export function SiteLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="relative min-h-dvh text-foreground">
      <Navbar />
      <div aria-hidden className={PAGE_BACKGROUND} />
      <div className={className}>{children}</div>
      <Footer />

      <CookieContentCard className="fixed bottom-4 left-4 z-50 w-[calc(100%-2rem)] max-w-lg" />
      {/* Laura — no-op strict sans clé API : ni bouton, ni script, ni requête. */}
      <ChatWidgetMount />
      <Toaster position="bottom-right" />
    </main>
  )
}
