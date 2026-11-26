'use client'

import { Box, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { SiteLayout } from '@/components/SiteLayout'

type LegalSection = {
  id: string
  title: string
  body: ReactNode
}

type LegalPageProps = {
  title: string
  intro?: ReactNode
  lastUpdated: string
  sections: LegalSection[]
}

export function LegalPage({ title, intro, lastUpdated, sections }: LegalPageProps) {
  const t = useTranslations('legal')
  return (
    <SiteLayout>
      <Box className="mx-auto max-w-6xl px-6 pt-32 pb-24">
        <Box as="header" className="mb-16 max-w-3xl">
          <Text element="p" size="xs" weight="medium" className="mb-4 uppercase text-violet-400">
            {t('kicker')}
          </Text>
          <Text
            element="h1"
            size="5xl"
            weight="semibold"
            leading="tight"
            className="mb-4 tracking-tight text-foreground"
          >
            {title}
          </Text>
          {intro && (
            <Text size="lg" leading="relaxed" className="text-muted-foreground">
              {intro}
            </Text>
          )}
          <Text element="p" size="sm" className="mt-6 text-muted-foreground/60">
            {t('lastUpdatedLabel')} : <span className="text-foreground">{lastUpdated}</span>
          </Text>
        </Box>

        <Box className="grid grid-cols-1 lg:grid-cols-[220px_1fr] lg:gap-16">
          <Box as="nav" className="hidden lg:block">
            <Box className="sticky top-28">
              <Text element="p" size="xs" weight="medium" className="mb-4 text-muted-foreground/60">
                {t('onThisPage')}
              </Text>
              <ul className="space-y-2.5">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block text-sm leading-snug text-zinc-300 transition-colors hover:text-foreground"
                    >
                      <span className="mr-2 font-mono tabular-nums text-muted-foreground/60">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Box>
          </Box>

          <article className="max-w-2xl">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28 pt-12 first:pt-0">
                <Box className="mb-6 flex items-baseline gap-3">
                  <span className=" text-sm tabular-nums text-muted-foreground/60">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Text element="h2" size="2xl" weight="medium" className="tracking-tight text-foreground">
                    {s.title}
                  </Text>
                </Box>
                <Box className="space-y-4 font-sans text-base leading-[1.7] text-zinc-300">{s.body}</Box>
                {i < sections.length - 1 && <div className="mt-12 h-px bg-border/40" />}
              </section>
            ))}
          </article>
        </Box>
      </Box>
    </SiteLayout>
  )
}
