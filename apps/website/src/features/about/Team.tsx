import { Card, Text } from '@bellum/ui'
import { Linkedin } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'

type Member = {
  name: string
  initials: string
  linkedin: string
}

type MemberCopy = {
  role: string
  blurb: string
}

const TEAM: Member[] = [
  {
    name: 'Théo Haddad',
    initials: 'TH',
    linkedin: 'https://www.linkedin.com/in/th%C3%A9o-haddad-a0114a162/',
  },
  {
    name: 'Louis Schlegel',
    initials: 'LS',
    linkedin: 'https://www.linkedin.com/in/louis-schlegel/',
  },
  {
    name: 'Maeva Coët',
    initials: 'MC',
    linkedin: 'https://www.linkedin.com/in/maeva-co%C3%ABt-4a2586208/',
  },
]

export function Team({ number }: { number?: string }) {
  const t = useTranslations('common.team')
  const members = t.raw('members') as MemberCopy[]

  return (
    <section className="py-24">
      <div className="mx-auto flex max-w-7xl flex-col items-center px-6">
        {number ? (
          <div className="mx-auto mb-12 grid max-w-5xl grid-cols-[auto_1fr] items-center gap-5 sm:gap-7">
            <span className="text-5xl font-bold leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(139,92,246,0.5)]">
              {number}
            </span>
            <Text element="h2" weight="medium" color="text-white" className="text-[clamp(24px,3vw,38px)] leading-tight">
              {t('heading')}
            </Text>
          </div>
        ) : (
          <div className="mb-12 text-center">
            <div className="flex justify-center">
              <Kicker center>{t('kicker')}</Kicker>
            </div>
            <Text
              element="h2"
              weight="medium"
              color="text-white"
              className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
            >
              {t('heading')}
            </Text>
          </div>
        )}

        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {TEAM.map((member, i) => (
            <Card
              key={member.name}
              className="group flex flex-col items-center rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 text-center backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:bg-[linear-gradient(180deg,rgba(123,97,255,0.12),rgba(255,255,255,0.03))]"
            >
              <span className="inline-flex size-16 items-center justify-center rounded-full border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.35),rgba(123,97,255,0.08))] text-lg font-semibold text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_30px_-12px_rgba(123,97,255,0.6)]">
                {member.initials}
              </span>
              <Text element="p" weight="medium" color="text-white" className="mt-5 text-lg">
                {member.name}
              </Text>
              <Text element="p" size="sm" weight="medium" className="mt-1 text-violet-300">
                {members[i]?.role}
              </Text>
              <Text element="p" size="sm" color="text-zinc-400" className="mt-3 leading-relaxed">
                {members[i]?.blurb}
              </Text>
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('linkedinAria', { name: member.name })}
                className="mt-5 inline-flex size-9 items-center justify-center rounded-lg border border-white/[0.12] text-zinc-400 transition-all hover:border-violet-500/50 hover:text-violet-300"
              >
                <Linkedin size={16} />
              </a>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
