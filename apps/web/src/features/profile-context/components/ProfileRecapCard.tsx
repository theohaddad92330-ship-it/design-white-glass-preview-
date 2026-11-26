import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import type { ProfileContext } from '@bellum/contracts'
import { Button, FieldText, Text, cn, EASE } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ChevronRight, Pencil } from 'lucide-react'

const FADE_MASK = 'linear-gradient(to bottom, black calc(100% - 32px), transparent 100%)'

export function ProfileRecapCard({
  context,
  showEditButton = true,
  tone = 'light',
}: {
  context: ProfileContext
  showEditButton?: boolean
  tone?: 'light' | 'dark'
}) {
  const { t } = useTranslation('profile')
  const recap = context.welcomeSummary?.profileRecap ?? ''
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()
  if (!recap) return null
  const surface =
    tone === 'dark'
      ? 'border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]'
      : 'border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]'
  return (
    <div className={cn('space-y-4 rounded-xl p-6 backdrop-blur-sm', surface)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-primary)]"
      >
        {t('context.recap.title')}
        <ChevronRight className={cn('h-3 w-3 transition-transform duration-300', open ? 'rotate-90' : '')} />
      </button>
      <motion.div
        initial={false}
        animate={{ maxHeight: open ? 1200 : 40 }}
        transition={{ duration: 0.5, ease: EASE.out }}
        className="overflow-hidden"
        style={{
          WebkitMaskImage: open ? 'none' : FADE_MASK,
          maskImage: open ? 'none' : FADE_MASK,
        }}
      >
        <Text element="p" size="sm" className="text-[var(--bellum-text-primary)] leading-relaxed">
          <FieldText value={recap} />
        </Text>
      </motion.div>
      {open && showEditButton && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={Pencil}
          iconPosition="left"
          onClick={() => navigate({ to: '/settings/profile' })}
          className="text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
        >
          {t('context.recap.edit')}
        </Button>
      )}
    </div>
  )
}
