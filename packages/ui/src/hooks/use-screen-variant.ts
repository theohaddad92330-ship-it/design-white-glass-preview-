import { useIsMobile } from './use-mobile'

export type ScreenType = 'mobile' | 'desktop'

export type ScreenVariant = ScreenType | 'backoffice'

export function useScreenVariant(): ScreenVariant {
  const isMobile = useIsMobile()

  const firstUrlSlot = window.location.pathname.split('/')[1]
  if (firstUrlSlot === 'bak' || firstUrlSlot === 'partner') return 'backoffice'

  return isMobile ? 'mobile' : 'desktop'
}
