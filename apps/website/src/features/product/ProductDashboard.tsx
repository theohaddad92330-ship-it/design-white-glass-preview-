import { AppMockup } from '@/components/AppMockup'

export function ProductDashboard() {
  return (
    <div className="relative mx-auto max-w-[940px]">
      <div className="pointer-events-none absolute left-[15%] top-[10%] h-[60%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(77,157,255,0.3),transparent_70%)] blur-[70px]" />
      <AppMockup className="relative" />
    </div>
  )
}
