import { Button } from '@react-email/components'
import * as React from 'react'

type EmailButtonProps = {
  href: string
  children: React.ReactNode
}

/** Solid violet CTA, Linear-style. */
export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Button
      href={href}
      className="inline-block bg-violet-500 text-white rounded-md px-5 py-3 text-[14px] font-medium no-underline"
    >
      {children}
    </Button>
  )
}
