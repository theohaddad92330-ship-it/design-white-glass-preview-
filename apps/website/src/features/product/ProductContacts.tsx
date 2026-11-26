import { Card, Text, cn } from '@bellum/ui'
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'
import { CONTACT_SCORE_ILLUSTRATIONS } from '@/lib/score-illustration'

type Persona = 'sponsor' | 'influ' | 'ope'
type Status = 'enr' | 'msg' | 'todo'

type Contact = {
  initials: string
  grad: string
  name: string
  /** Key into the `contacts.roles` messages record. */
  roleKey: string
  personaKey: Persona
  statusKey: Status
}

/** Color classes only — persona/status labels live in the `product` messages. */
const PB: Record<Persona, string> = {
  sponsor: 'text-violet-300 bg-violet-500/[0.16] border-violet-500/30',
  influ: 'text-[#4d9dff] bg-[#4d9dff]/[0.14] border-[#4d9dff]/30',
  ope: 'text-[#36e6a0] bg-[#36e6a0]/[0.13] border-[#36e6a0]/30',
}
const ST: Record<Status, { cls: string; dot: string }> = {
  enr: { cls: 'text-[#36e6a0]', dot: 'bg-[#36e6a0]' },
  msg: { cls: 'text-[#e6a23c]', dot: 'bg-[#e6a23c]' },
  todo: { cls: 'text-violet-300', dot: 'bg-violet-400' },
}

/**
 * Les trois contacts de l'illustration. Leur score vit dans
 * `CONTACT_SCORE_ILLUSTRATIONS`, décomposé en six critères — il portait ici
 * « 92 / 88 / 81 » dans un anneau, sans dénominateur et sans un seul de ses
 * critères. Le rapprochement se fait par l'INDEX, dans le même ordre.
 */
const CONTACTS: Contact[] = [
  {
    initials: 'JN',
    grad: 'from-[#7b61ff] to-[#5b3fe0]',
    name: 'Julien Nicolas',
    roleKey: 'jn',
    personaKey: 'sponsor',
    statusKey: 'enr',
  },
  {
    initials: 'CD',
    grad: 'from-[#4d9dff] to-[#2b6fd4]',
    name: 'Claire Dubois',
    roleKey: 'cd',
    personaKey: 'influ',
    statusKey: 'msg',
  },
  {
    initials: 'MP',
    grad: 'from-[#36e6a0] to-[#1f9e6e]',
    name: 'Marc Petit',
    roleKey: 'mp',
    personaKey: 'ope',
    statusKey: 'todo',
  },
]

export function ProductContacts() {
  const t = useTranslations('product')
  const tScore = useTranslations('common.score')
  // Tous les contacts partagent la même couverture : sans angle d'attaque
  // sélectionné, `angleFit` n'est évaluable pour personne. Le dénominateur et
  // les critères se disent donc UNE fois, sous la liste, plutôt que trois.
  const coverage = CONTACT_SCORE_ILLUSTRATIONS[0]!
  return (
    <section className="py-14">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <Card className="overflow-hidden rounded-2xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] backdrop-blur-[16px]">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <Text element="span" size="sm" weight="medium" color="text-zinc-200">
              {t('contacts.cardTitle')}
            </Text>
            <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
              {t('contacts.cardBadge')}
            </span>
          </div>
          <div className="flex flex-col">
            {CONTACTS.map((c, index) => (
              <div
                key={c.name}
                className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0"
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-semibold text-white',
                    c.grad,
                  )}
                >
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{c.name}</span>
                  <span className="block truncate text-xs text-zinc-400">{t(`contacts.roles.${c.roleKey}`)}</span>
                </span>
                <span
                  className={cn(
                    'hidden shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium sm:inline',
                    PB[c.personaKey],
                  )}
                >
                  {t(`contacts.persona.${c.personaKey}`)}
                </span>
                <span className="shrink-0 rounded-md border border-[#36e6a0]/40 px-1.5 py-0.5 font-mono text-xs text-[#36e6a0]">
                  {CONTACT_SCORE_ILLUSTRATIONS[index]!.points}
                  <span className="text-[#8a8aa0]">
                    {' '}
                    {tScore('outOf', { max: CONTACT_SCORE_ILLUSTRATIONS[index]!.outOf })}
                  </span>
                </span>
                <span className={cn('hidden shrink-0 items-center gap-1.5 text-xs sm:flex', ST[c.statusKey].cls)}>
                  <span className={cn('size-1.5 rounded-full', ST[c.statusKey].dot)} />
                  {t(`contacts.status.${c.statusKey}`)}
                </span>
              </div>
            ))}
          </div>

          {/* Le score n'est jamais nu : ses critères, et celui qui n'a pas pu
              être évalué — sorti du dénominateur, pas noté zéro. */}
          <div className="border-t border-white/[0.08] px-4 py-3">
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {coverage.axes.map(axis => (
                <span key={axis.key} className={cn('text-xs', axis.evaluated ? 'text-zinc-400' : 'text-zinc-500')}>
                  {tScore(`contactAxes.${axis.key}`)}
                  {axis.evaluated ? '' : ` · ${tScore('notEvaluated')}`}
                </span>
              ))}
            </div>
            <Text element="p" size="xs" color="text-zinc-500" className="mt-1.5 leading-snug">
              {tScore('contactNotEvaluatedReason', { max: coverage.outOf })}
            </Text>
          </div>
        </Card>
        <div>
          <Kicker>{t('contacts.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(26px,3.2vw,38px)] leading-tight"
          >
            {t('contacts.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mt-4 leading-relaxed">
            {t('contacts.desc')}
          </Text>
        </div>
      </div>
    </section>
  )
}
