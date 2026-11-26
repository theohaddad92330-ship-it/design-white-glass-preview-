import { BrailleLoader } from '@bellum/ui'
import { memo } from 'react'

export const ProfileSkeleton = memo(function ProfileSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <BrailleLoader variant="grid-searching" />
    </div>
  )
})
