import { Fragment } from 'react'
import { cn } from '../lib/utils'

const QUOTED_PATTERN = /("[^"]+"|«\s?[^»]+\s?»)/g

type FieldTextProps = {
  value: string | null | undefined
  className?: string
  highlightClassName?: string
}

export function FieldText({ value, className, highlightClassName }: FieldTextProps) {
  if (value == null || value === '') return null
  const parts = value.split(QUOTED_PATTERN)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const isStraightQuoted = part.startsWith('"') && part.endsWith('"') && part.length >= 2
        const isFrenchQuoted = part.startsWith('«') && part.endsWith('»') && part.length >= 2
        if (!isStraightQuoted && !isFrenchQuoted) {
          return <Fragment key={i}>{part}</Fragment>
        }
        const inner = part.slice(1, -1).trim()
        return (
          <strong key={i} className={cn('font-semibold', highlightClassName)}>
            {inner}
          </strong>
        )
      })}
    </span>
  )
}
