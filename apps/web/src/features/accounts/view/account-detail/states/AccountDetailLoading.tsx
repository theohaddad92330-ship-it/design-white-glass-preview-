import { BrailleLoader } from '@bellum/ui'

export function AccountDetailLoading() {
  return (
    <div className="flex items-center justify-center ">
      <BrailleLoader variant="grid-searching" dotSize={4} />
    </div>
  )
}
