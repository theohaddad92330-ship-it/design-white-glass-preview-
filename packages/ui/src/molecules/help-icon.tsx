import { Info } from 'lucide-react'
import { memo } from 'react'
import { Text } from '../atoms/text'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip'

type HelpIconProps = {
  title: string
}

export const HelpIcon = memo<HelpIconProps>(function HelpIcon({ title }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="cursor-pointer w-4 h-4 dark:text-white" />
        </TooltipTrigger>
        <TooltipContent className="w-auto min-w-[200px] max-w-[280px] break-words text-left p-2">
          <Text size="xs" className="text-white leading-relaxed">
            {title}
          </Text>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
