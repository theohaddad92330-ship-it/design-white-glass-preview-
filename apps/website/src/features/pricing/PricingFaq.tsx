'use client'

import { Text, cn } from '@bellum/ui'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Kicker } from '@/features/landing/Kicker'
import { fillLiveTokens, type LiveCatalogCopy } from './live-prices'

type FaqItem = {
  q: string
  a: string
}

export function PricingFaq({ live }: { live: LiveCatalogCopy }) {
  const t = useTranslations('pricing')
  // The answers can't name a tier, so they quote the cheapest seat price as a
  // "from" figure — accurate whether or not the tiers charge the same.
  const faq = (t.raw('faq.items') as FaqItem[]).map(item => ({
    ...item,
    a: fillLiveTokens(item.a, { seatPrice: live.seatLabel }),
  }))
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="py-16">
      <div className="mx-auto max-w-[760px] px-6">
        <div className="mb-10 animate-fade-up text-center">
          <Kicker center>{t('faq.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(26px,3.4vw,40px)] leading-tight"
          >
            {t('faq.title')}
          </Text>
        </div>

        <div className="flex flex-col gap-2.5">
          {faq.map((item, index) => {
            const isOpen = openIndex === index
            return (
              <div key={item.q} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.018]">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <Text element="span" weight="medium" color="text-white" className="text-base">
                    {item.q}
                  </Text>
                  <Plus
                    size={18}
                    className={cn('shrink-0 text-violet-300 transition-transform duration-300', isOpen && 'rotate-45')}
                  />
                </button>
                <div
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  )}
                >
                  <div className="overflow-hidden">
                    <Text element="p" size="sm" color="text-zinc-400" className="px-5 pb-4 leading-relaxed">
                      {item.a}
                    </Text>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
