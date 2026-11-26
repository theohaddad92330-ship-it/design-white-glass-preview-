import { Text, cn } from '@bellum/ui'

export function Kicker({ children, center }: { children: string; center?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', center && 'justify-center')}>
      <span className="h-px w-[22px] bg-[linear-gradient(90deg,transparent,#7b61ff)]" />
      <Text element="span" size="base" className=" text-violet-300">
        {children}
      </Text>
    </span>
  )
}
