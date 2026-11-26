import { Check, Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useCopiedFlash } from '../hooks/use-copied-flash'
import { Box } from '../atoms/box'
import type { ComponentSize } from '../atoms/variants'
import { Button } from '../components/button'
import { Input } from '../components/input'
import { toast } from '../components/sonner'
import { cn } from '../lib/utils'

export type CopyFieldProps = {
  value: string
  masked?: boolean
  size?: ComponentSize
  className?: string
}

export const CopyField = ({ value, masked = false, className }: CopyFieldProps) => {
  // #1152 : minuteur annulé au démontage — voir `useCopiedFlash`.
  const [copied, flashCopied] = useCopiedFlash()
  const [revealed, setRevealed] = useState(!masked)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      flashCopied()
      toast.success('Copie dans le presse-papier')
    } catch {
      toast.error('Impossible de copier')
    }
  }

  const displayValue = revealed ? value : '•'.repeat(Math.min(value.length, 32))

  return (
    <Box display="flex" className={cn('gap-2', className)}>
      <Input readOnly value={displayValue} className="flex-1 font-mono text-xs bg-[var(--bellum-surface-2)]" />
      {masked && (
        <Button type="button" variant="ghost" size="icon" onClick={() => setRevealed(!revealed)} className="shrink-0">
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      )}
      <Button type="button" variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
        {copied ? <Check className="h-4 w-4 text-[var(--success-soft-text)]" /> : <Copy className="h-4 w-4" />}
      </Button>
    </Box>
  )
}
