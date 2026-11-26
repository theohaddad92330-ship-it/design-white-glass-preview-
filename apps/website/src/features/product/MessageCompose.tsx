'use client'

import { cn } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { MessageSquareIcon } from '@/components/ui/message-square'
import { SparklesIcon } from '@/components/ui/sparkles'

const STEPS = [
  { tone: 'bg-[#9b85ff]', key: 'contactDsi' },
  { tone: 'bg-[#4d9dff]', key: 'workshop' },
] as const

type Phase = 'idle' | 'typing' | 'done'

export function MessageCompose() {
  const t = useTranslations('product')
  const message = t('message.text')
  const reduce = useReducedMotion()
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const run = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (reduce) {
      setTyped(message)
      setPhase('done')
      return
    }
    setPhase('typing')
    setTyped('')
    const words = message.split(' ')
    words.forEach((_, i) => {
      timers.current.push(
        setTimeout(
          () => {
            setTyped(words.slice(0, i + 1).join(' '))
            if (i === words.length - 1) setPhase('done')
          },
          250 + i * 55,
        ),
      )
    })
  }

  // Auto-compose once when scrolled into view.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            run()
            io.disconnect()
          }
        })
      },
      { threshold: 0.45 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      timers.current.forEach(clearTimeout)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="rounded-2xl border border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-5 backdrop-blur-[16px]"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-violet-500/30 bg-violet-500/[0.16] text-violet-300">
          <MessageSquareIcon size={16} />
        </span>
        {/* Fixed height: invisible sizer reserves the full-message height so the
            card never resizes while typing; the visible text overlays it. */}
        <div className="relative flex-1 rounded-[10px] border border-white/10 bg-white/[0.03] p-3">
          <p aria-hidden className="invisible text-sm leading-relaxed">
            {message}
          </p>
          <p className="absolute inset-3 text-sm leading-relaxed text-[#b8b8cc]">
            {typed}
            {phase === 'typing' && (
              <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-violet-300 align-middle" />
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.key}
            initial={false}
            animate={{
              opacity: phase === 'done' ? 1 : 0,
              y: phase === 'done' ? 0 : 8,
            }}
            transition={{
              duration: 0.45,
              delay: phase === 'done' && !reduce ? i * 0.18 : 0,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.018] px-3 py-2.5"
          >
            <span className={cn('size-2 shrink-0 rounded-full', step.tone)} />
            <span className="text-xs font-medium text-white">{t(`message.steps.${step.key}`)}</span>
          </motion.div>
        ))}
      </div>

      <button
        type="button"
        onClick={run}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-violet-500/[0.12] px-4 py-2 text-sm font-medium text-violet-200 transition-colors hover:border-violet-500/55 hover:bg-violet-500/20"
      >
        <SparklesIcon size={16} />
        {t('message.generate')}
      </button>
    </div>
  )
}
