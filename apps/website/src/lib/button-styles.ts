import { buttonVariants, cn } from '@bellum/ui'

export const PRIMARY_BUTTON = cn(
  buttonVariants({ variant: 'violet', size: 'lg' }),
  'h-12 gap-2 rounded-full px-7 text-base shadow-[0_0_30px_rgba(124,58,237,0.45)]',
)

export const SECONDARY_BUTTON = cn(
  buttonVariants({ variant: 'outline', size: 'lg' }),
  'h-12 gap-2 rounded-full px-6 text-base',
)

export const GLASS_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-6 text-base font-medium text-white backdrop-blur-[14px] transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]'
