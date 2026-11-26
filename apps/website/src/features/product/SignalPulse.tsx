'use client'

import { cn } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type Signal = {
  tone: 'violet' | 'blue' | 'green'
  /** Key into the `signals` messages record. */
  key: string
}

const SIGNALS: Signal[] = [
  { tone: 'violet', key: 's0' },
  { tone: 'blue', key: 's1' },
  { tone: 'green', key: 's2' },
]

const DOT: Record<Signal['tone'], string> = {
  violet: 'bg-[#9b85ff] shadow-[0_0_9px_#9b85ff]',
  blue: 'bg-[#4d9dff] shadow-[0_0_9px_#4d9dff]',
  green: 'bg-[#36e6a0] shadow-[0_0_9px_#36e6a0]',
}

const BADGE: Record<Signal['tone'], string> = {
  violet: 'border-violet-500/30 bg-violet-500/[0.14]',
  blue: 'border-[#4d9dff]/30 bg-[#4d9dff]/[0.14]',
  green: 'border-[#36e6a0]/30 bg-[#36e6a0]/[0.13]',
}

/** Linear-style cycling stack: the front signal sits crisp on top, the others
 *  peek behind (scaled / faded / blurred); every few seconds the stack
 *  advances. Static (front card only) under prefers-reduced-motion. */
export function SignalPulse() {
  const t = useTranslations('product')
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setActive(a => (a - 1 + SIGNALS.length) % SIGNALS.length), 2800)
    return () => clearInterval(id)
  }, [reduce])

  return (
    <div className="relative h-[120px]">
      {SIGNALS.map((signal, i) => {
        const pos = (i - active + SIGNALS.length) % SIGNALS.length
        return (
          <motion.div
            key={signal.key}
            initial={false}
            animate={{
              y: pos * 12,
              scale: 1 - pos * 0.05,
              opacity: reduce ? (pos === 0 ? 1 : 0) : pos === 0 ? 1 : pos === 1 ? 0.55 : 0.3,
              filter: pos >= 2 ? 'blur(2px)' : 'blur(0px)',
              zIndex: SIGNALS.length - pos,
            }}
            transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
            className="absolute inset-x-0 top-0 rounded-xl border border-white/[0.1] bg-[rgba(16,16,28,0.94)] p-3.5 backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border', BADGE[signal.tone])}>
                <span className={cn('size-2 rounded-full', DOT[signal.tone])} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-white">{t(`signals.${signal.key}.title`)}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-500">
                    <Check size={12} className="text-emerald-400" />
                    {t(`signals.${signal.key}.meta`)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-zinc-400">{t(`signals.${signal.key}.sub`)}</div>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
