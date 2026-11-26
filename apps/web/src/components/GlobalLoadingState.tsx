import { BrailleLoader } from '@bellum/ui'

export function GlobalLoadingState() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background">
      <BrailleLoader variant="grid-searching" dotSize={4} />
    </div>
  )
}
