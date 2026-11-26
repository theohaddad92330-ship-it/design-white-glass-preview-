import { Text } from '@bellum/ui'
import { useTranslations } from 'next-intl'

export function LogoBand() {
  const t = useTranslations('home.logoBand')
  const roles = t.raw('roles') as string[]

  return (
    <section className="py-12">
      <div className="mx-auto max-w-[1200px] animate-fade-up px-6 text-center">
        <Text element="p" size="sm" color="text-zinc-500">
          {t('caption')}
        </Text>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-3">
          {roles.map(role => (
            <Text key={role} element="span" weight="semibold" className="text-lg text-zinc-400/80">
              {role}
            </Text>
          ))}
        </div>
      </div>
    </section>
  )
}
