import { memo, type ComponentProps } from 'react'
import { Button } from '../components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip'

export type TooltipButtonProps = ComponentProps<typeof Button> & {
  tooltip: string
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
}

/**
 * TooltipButton — Button wrapped in a Tooltip.
 */
export const TooltipButton = memo<TooltipButtonProps>(function TooltipButton({
  tooltip,
  tooltipSide = 'top',
  sideOffset = 4,
  ...buttonProps
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...buttonProps} />
      </TooltipTrigger>
      <TooltipContent sideOffset={sideOffset} side={tooltipSide}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
})
