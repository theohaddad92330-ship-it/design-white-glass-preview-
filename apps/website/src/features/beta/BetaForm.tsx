'use client'

import { Button, Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text, cn } from '@bellum/ui'
import { Check, Users, Zap, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent, type ReactNode } from 'react'
import { PRIMARY_BUTTON } from '@/lib/button-styles'

const FIELD =
  'w-full rounded-xl border border-white/[0.14] bg-white/[0.025] px-3.5 py-3 text-base text-white outline-none transition placeholder:text-[#5e5e74] focus:border-violet-500 focus:bg-violet-500/[0.05] focus:ring-2 focus:ring-violet-500/15'

const TRIGGER =
  'h-auto w-full rounded-xl border-white/[0.14] bg-white/[0.025] px-3.5 py-3 text-base text-white data-[placeholder]:text-[#5e5e74] focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15 focus:ring-offset-0'

const NAME_PATTERN = "[A-Za-zÀ-ÿ' -]{2,}"
const EMAIL_PATTERN = '[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}'
const COMPANY_PATTERN = "[A-Za-z0-9À-ÿ&.,' -]{2,}"

/** Option `value` posted to the API stays the FR canonical string; only `label` is localized. */
type SelectOption = { value: string; label: string }

/** Benefit icons stay in the component; text comes from the `beta` namespace, zipped by index. */
const BENEFIT_ICONS: LucideIcon[] = [Zap, Users, Check]

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Text element="span" size="sm" weight="medium" color="text-zinc-300">
        {label}
      </Text>
      {children}
    </div>
  )
}

function BetaIntro() {
  const t = useTranslations('beta')
  const benefits = t.raw('form.benefits') as string[]

  return (
    <div className="animate-fade-up">
      <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
        <span className="size-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a78bfa]" />
        <Text element="span" size="xs" className="text-violet-200">
          {t('form.badge')}
        </Text>
      </span>

      <Text
        element="h2"
        weight="medium"
        color="text-white"
        leading="tight"
        className="mt-6 text-balance text-3xl lg:text-4xl"
      >
        {t('form.introTitle')}
      </Text>

      <Text element="p" size="lg" color="text-zinc-400" className="mt-4 max-w-xl leading-relaxed">
        {t('form.introSubtitle')}
      </Text>

      <div className="mt-8 flex flex-col gap-4">
        {BENEFIT_ICONS.map((Icon, i) => (
          <div key={benefits[i]} className="flex items-start gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-violet-500/25 bg-violet-500/[0.12] text-violet-300">
              <Icon size={18} />
            </span>
            <Text element="p" color="text-zinc-300" className="leading-relaxed">
              {benefits[i]}
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BetaForm() {
  const t = useTranslations('beta')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)

  const teamSizes = t.raw('form.teamSizes') as SelectOption[]
  const reassure = t.raw('form.reassure') as string[]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    setError(null)
    const payload = Object.fromEntries(new FormData(event.currentTarget))

    try {
      const response = await fetch('/api/beta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        setStatus('idle')
        if (response.status === 503) setError(t('form.error503'))
        else if (response.status === 400) setError(t('form.errorValidation'))
        else setError(t('form.errorGeneric'))
        return
      }
      setStatus('success')
    } catch {
      setStatus('idle')
      setError(t('form.errorGeneric'))
    }
  }

  return (
    <section id="candidature" className="scroll-mt-24 py-16">
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16">
        <BetaIntro />

        <div className="animate-fade-up">
          <Card className="rounded-3xl border-white/10 bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] p-7 backdrop-blur-[16px] sm:p-9">
            {status === 'success' ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-full border border-[rgba(54,230,160,0.4)] bg-[rgba(54,230,160,0.14)] text-[#36e6a0]">
                  <Check size={24} />
                </span>
                <Text element="h3" weight="bold" color="text-white" className="text-xl">
                  {t('form.successTitle')}
                </Text>
                <Text element="p" size="sm" color="text-zinc-400" className="max-w-xs leading-relaxed">
                  {t('form.successBody')}
                </Text>
              </div>
            ) : (
              <>
                <Text element="h3" weight="medium" color="text-white" className="text-xl">
                  {t('form.heading')}
                </Text>
                <Text element="p" size="sm" color="text-zinc-400" className="mt-2">
                  {t('form.subheading')}
                </Text>

                <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                  {/* Honeypot — invisible to humans, catches naive bots. */}
                  <div aria-hidden className="absolute left-[-9999px] top-[-9999px]" hidden>
                    <label htmlFor="beta-website">{t('form.honeypotLabel')}</label>
                    <input id="beta-website" type="text" name="website" tabIndex={-1} autoComplete="off" />
                  </div>

                  <Field label={t('form.fields.name.label')}>
                    <input
                      className={FIELD}
                      type="text"
                      name="name"
                      placeholder={t('form.fields.name.placeholder')}
                      pattern={NAME_PATTERN}
                      title={t('form.fields.name.title')}
                      required
                    />
                  </Field>
                  <Field label={t('form.fields.email.label')}>
                    <input
                      className={FIELD}
                      type="email"
                      name="email"
                      placeholder={t('form.fields.email.placeholder')}
                      pattern={EMAIL_PATTERN}
                      title={t('form.fields.email.title')}
                      required
                    />
                  </Field>
                  <Field label={t('form.fields.company.label')}>
                    <input
                      className={FIELD}
                      type="text"
                      name="company"
                      placeholder={t('form.fields.company.placeholder')}
                      pattern={COMPANY_PATTERN}
                      title={t('form.fields.company.title')}
                      required
                    />
                  </Field>

                  <Field label={t('form.fields.salesReps')}>
                    <Select name="salesReps" required>
                      <SelectTrigger aria-label={t('form.fields.salesReps')} className={TRIGGER}>
                        <SelectValue placeholder={t('form.selectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {teamSizes.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label={t('form.fields.tools.label')}>
                    <input
                      className={FIELD}
                      type="text"
                      name="tools"
                      placeholder={t('form.fields.tools.placeholder')}
                    />
                  </Field>

                  {error && (
                    <Text element="p" size="sm" className="text-red-400" role="alert">
                      {error}
                    </Text>
                  )}

                  <Button
                    type="submit"
                    isLoading={status === 'loading'}
                    loadingText={t('form.loading')}
                    className={cn(PRIMARY_BUTTON, 'mt-1 w-full')}
                  >
                    {t('form.submit')}
                  </Button>

                  <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                    {reassure.map(item => (
                      <span key={item} className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
                        <Check size={14} className="text-emerald-400" />
                        {item}
                      </span>
                    ))}
                  </div>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>
    </section>
  )
}
