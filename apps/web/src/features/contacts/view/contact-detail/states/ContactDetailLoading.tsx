import { BrailleLoader } from '@bellum/ui'

export function ContactDetailLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <BrailleLoader variant="grid-searching" dotSize={4} />
    </div>
  )
}
