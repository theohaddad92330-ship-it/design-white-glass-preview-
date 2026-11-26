import { AUTOMATION_SIGNALS, OUTREACH_PLAYBOOK_KEYS, signalPlaybook, type AutomationRuleView } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formOfRule, INACTIVE_DAYS_BOUNDS, type RuleForm, type RuleResult } from '../ruleDraft'

const RESULTS: RuleResult[] = ['email_to_review', 'call_to_make', 'enroll_sequence']

/**
 * Théo C automations-editeur — « RÉGLER CETTE AUTOMATISATION » : le panneau que la maquette chargeait, rangé en trois
 * groupes (mise en page tranchée par Louis 22/10) :
 *
 *  - QUAND : le nom, le déclencheur — les six de la règle, pas le seul exemple de la maquette (A2) — et son délai ;
 *  - QUOI : ce que la règle prépare (e-mail à relire, appel à passer, inscription en séquence) ;
 *  - COMBIEN : le plafond de crédits sur 30 jours (A1) et la promesse « jamais seul ».
 *
 * « Appliquer au brouillon » n'écrit JAMAIS la règle qui tourne : il enregistre le brouillon et efface le dernier essai.
 */
export function AutomationRuleSettingsDialog({
  rule,
  open,
  onOpenChange,
  onApply,
  pending,
}: {
  rule: AutomationRuleView
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (form: RuleForm) => void
  pending: boolean
}) {
  const { t } = useTranslation('routines')
  const ids = { name: useId(), days: useId(), cap: useId() }
  const [form, setForm] = useState<RuleForm>(() => formOfRule(rule))
  const patch = (next: Partial<RuleForm>) => setForm(current => ({ ...current, ...next }))
  const carriesDays = form.signal === 'inactive_account'
  const days = Number(form.inactiveDays)
  const daysValid =
    !carriesDays ||
    form.inactiveDays === '' ||
    (Number.isInteger(days) && days >= INACTIVE_DAYS_BOUNDS.min && days <= INACTIVE_DAYS_BOUNDS.max)
  const cap = form.creditCap.trim()
  const capValid = cap === '' || (Number.isInteger(Number(cap)) && Number(cap) >= 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('editor.close')} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('editor.settings.title')}</DialogTitle>
          <DialogDescription>{t('editor.settings.description')}</DialogDescription>
        </DialogHeader>

        <Group title={t('editor.settings.when')}>
          <Box className="flex flex-col gap-1.5">
            <Label htmlFor={ids.name}>{t('editor.settings.name')}</Label>
            <Input
              id={ids.name}
              value={form.name}
              maxLength={120}
              onChange={event => patch({ name: event.target.value })}
            />
          </Box>
          <Field label={t('editor.settings.trigger')}>
            <Select
              value={form.signal}
              onValueChange={value => {
                const signal = value as RuleForm['signal']
                // Changer de déclencheur change la séquence proposée : celle de son modèle, jamais une qui n'irait pas.
                patch({ signal, playbook: signalPlaybook(signal) })
              }}
            >
              <SelectTrigger aria-label={t('editor.settings.trigger')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_SIGNALS.map(signal => (
                  <SelectItem key={signal} value={signal}>
                    {t(`actions:automations.signal.${signal}`, { days: '…' })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {carriesDays ? (
            <Box className="flex flex-col gap-1.5">
              <Label htmlFor={ids.days}>{t('editor.settings.days')}</Label>
              <Input
                id={ids.days}
                type="number"
                inputMode="numeric"
                min={INACTIVE_DAYS_BOUNDS.min}
                max={INACTIVE_DAYS_BOUNDS.max}
                value={form.inactiveDays}
                aria-invalid={!daysValid}
                onChange={event => patch({ inactiveDays: event.target.value })}
              />
              {!daysValid ? (
                <Text size="xs" className="text-[var(--danger-soft-text)]">
                  {t('editor.settings.daysRange', INACTIVE_DAYS_BOUNDS)}
                </Text>
              ) : null}
            </Box>
          ) : null}
        </Group>

        <Group title={t('editor.settings.what')}>
          <Field label={t('editor.settings.result')}>
            <Select value={form.result} onValueChange={value => patch({ result: value as RuleResult })}>
              <SelectTrigger aria-label={t('editor.settings.result')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTS.map(result => (
                  <SelectItem key={result} value={result}>
                    {t(`editor.result.${result}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {form.result === 'enroll_sequence' ? (
            <Field label={t('editor.settings.sequence')}>
              <Select
                value={form.playbook ?? signalPlaybook(form.signal)}
                onValueChange={value => patch({ playbook: value as RuleForm['playbook'] })}
              >
                <SelectTrigger aria-label={t('editor.settings.sequence')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTREACH_PLAYBOOK_KEYS.map(key => (
                    <SelectItem key={key} value={key}>
                      {t(`outreach:playbooks.trigger.${key}.name`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </Group>

        <Group title={t('editor.settings.howMuch')}>
          <Box className="flex flex-col gap-1.5">
            <Label htmlFor={ids.cap}>{t('editor.settings.cap')}</Label>
            <Input
              id={ids.cap}
              type="number"
              inputMode="numeric"
              min={0}
              value={form.creditCap}
              placeholder={t('editor.settings.capNone')}
              aria-invalid={!capValid}
              onChange={event => patch({ creditCap: event.target.value })}
            />
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('editor.settings.capHelp')}
            </Text>
          </Box>
          <Box className="flex flex-col gap-0.5">
            <Text size="sm" weight="medium">
              {t('editor.settings.externalSend')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('editor.settings.externalSendBody')}
            </Text>
          </Box>
        </Group>

        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('editor.settings.resetsTest')}
        </Text>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('editor.cancel')}
          </Button>
          <Button disabled={pending || !daysValid || !capValid} onClick={() => onApply(form)}>
            {t('editor.settings.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {title}
      </legend>
      {children}
    </fieldset>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box className="flex flex-col gap-1.5">
      <Text size="sm" weight="medium">
        {label}
      </Text>
      {children}
    </Box>
  )
}
