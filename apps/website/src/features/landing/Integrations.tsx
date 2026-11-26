import { Card, Text } from '@bellum/ui'
import { Bot, Database, MessageSquare, Users } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Kicker } from './Kicker'

type GroupMeta = {
  icon: (props: { size?: number; className?: string }) => ReactNode
  items: string[]
}

type GroupCopy = { title: string; desc: string }

/**
 * Ce que les pastilles ont le droit de nommer — D354, 30/08/2026.
 *
 * Les trois premiers groupes nomment l'outil du CLIENT : c'est ce qu'un prospect
 * vient vérifier, et chacun a son connecteur avec un appelant (GA-124 exige la
 * preuve sur le disque). Le quatrième nomme des REGISTRES PUBLICS, et eux seuls.
 *
 * ⚠️ « Apollo » et « Pappers » y figuraient, rangés sous la même icône que
 * l'INSEE et le BODACC, sous une carte qui promet « des données officielles et
 * publiques ». Ce sont NOS fournisseurs — un annuaire commercial et un rééditeur
 * privé du registre —, et la carte les présentait donc comme des sources
 * officielles, en contradiction directe avec la promesse « exclusivement de
 * sources publiques et officielles » de la page bêta. GA-125 les refuse.
 */
const GROUPS: GroupMeta[] = [
  { icon: Users, items: ['HubSpot', 'Salesforce'] },
  { icon: MessageSquare, items: ['Slack', 'Microsoft Teams', 'Discord', 'Google Chat', 'Mattermost', 'Webhook'] },
  { icon: Bot, items: ['Claude', 'Cursor', 'MCP'] },
  { icon: Database, items: ['INSEE', 'INPI', 'BODACC', 'France Travail', 'BOAMP', 'DECP'] },
]

export function Integrations() {
  const t = useTranslations('home.integrations')
  const groups = t.raw('groups') as GroupCopy[]

  return (
    <section className="py-24">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="mx-auto max-w-2xl animate-fade-up text-center">
          <Kicker center>{t('kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(28px,3.6vw,42px)] leading-tight"
          >
            {t('headingPrefix')}
            <span className="text-gradient-em">{t('headingEm')}</span>
            {t('headingSuffix')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-lg leading-relaxed">
            {t('paragraph')}
          </Text>
        </div>

        <div className="mt-12 grid animate-fade-up gap-4 sm:grid-cols-2">
          {GROUPS.map((group, i) => {
            const Icon = group.icon
            const copy = groups[i]!
            return (
              <Card
                key={copy.title}
                className="group rounded-2xl border-white/[0.12] bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] p-7 backdrop-blur-[16px] transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-xl border border-violet-500/25 bg-[linear-gradient(160deg,rgba(123,97,255,0.2),rgba(123,97,255,0.04))] text-white transition-all duration-500 group-hover:border-violet-500/60 group-hover:shadow-[0_12px_32px_-12px_rgba(123,97,255,0.55)]">
                    <Icon size={20} />
                  </span>
                  <Text element="h3" size="lg" weight="bold" color="text-white">
                    {copy.title}
                  </Text>
                </div>
                <Text element="p" size="sm" color="text-zinc-400" className="mt-3 leading-relaxed">
                  {copy.desc}
                </Text>
                <div className="mt-5 flex flex-wrap gap-2">
                  {group.items.map(item => (
                    <span
                      key={item}
                      className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-zinc-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
