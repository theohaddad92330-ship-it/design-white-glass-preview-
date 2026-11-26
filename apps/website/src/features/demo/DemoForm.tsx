'use client'

import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  cn,
  toast,
} from '@bellum/ui'
import { Check } from 'lucide-react'
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

function SelectField({
  label,
  name,
  options,
  placeholder,
}: {
  label: string
  name: string
  options: readonly SelectOption[]
  placeholder: string
}) {
  return (
    <Field label={label}>
      <Select name={name} required>
        <SelectTrigger aria-label={label} className={TRIGGER}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function DemoForm() {
  const t = useTranslations('demo')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const teamSizes = t.raw('form.teamSizes') as SelectOption[]
  const goals = t.raw('form.goals') as SelectOption[]
  const reassure = t.raw('form.reassure') as string[]
  const selectPlaceholder = t('form.selectPlaceholder')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('loading')
    const payload = Object.fromEntries(new FormData(event.currentTarget))

    try {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('request failed')
      setStatus('success')
      toast.success(t('form.successToast'))
    } catch {
      setStatus('idle')
      toast.error(t('form.errorToast'))
    }
  }

  return (
    <Card className="rounded-3xl border-white/10 bg-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] p-7 backdrop-blur-[16px] sm:p-9">
      {status === 'success' ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full border border-[rgba(54,230,160,0.4)] bg-[rgba(54,230,160,0.14)] text-[#36e6a0]">
            <Check size={24} />
          </span>
          <Text element="h2" weight="bold" color="text-white" className="text-xl">
            {t('form.successTitle')}
          </Text>
          <Text element="p" size="sm" color="text-zinc-400" className="max-w-xs leading-relaxed">
            {t('form.successBody')}
          </Text>
        </div>
      ) : (
        <>
          <Text element="h2" weight="medium" color="text-white" className="text-xl">
            {t('form.heading')}
          </Text>
          <Text element="p" size="sm" color="text-zinc-400" className="mt-2">
            {t('form.subheading')}
          </Text>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t('form.fields.teamSize')}
                name="teamSize"
                options={teamSizes}
                placeholder={selectPlaceholder}
              />
              <SelectField label={t('form.fields.goal')} name="goal" options={goals} placeholder={selectPlaceholder} />
            </div>

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
  )
}
