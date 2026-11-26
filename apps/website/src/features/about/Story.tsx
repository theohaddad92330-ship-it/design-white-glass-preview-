import { Card, Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'

type StoryText = {
  title: string
  body: string
}

/** Numbers stay in the component; text comes from the `about` namespace, zipped by index. */
const NUMS = ['01', '02'] as const

export function Story() {
  const t = useTranslations('about')
  const items = t.raw('story.items') as StoryText[]

  return (
    <section className="py-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6">
        {NUMS.map((num, i) => (
          <Card
            key={num}
            className="grid grid-cols-[auto_1fr] gap-5 rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px] sm:gap-7 sm:p-10"
          >
            <span className="text-5xl font-bold leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(139,92,246,0.5)]">
              {num}
            </span>
            <div>
              <Text element="h2" weight="medium" color="text-white" className="text-lg sm:text-xl">
                {items[i]?.title}
              </Text>
              <Text element="p" size="lg" color="text-zinc-400" className="mt-3 leading-relaxed">
                {items[i]?.body}
              </Text>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
