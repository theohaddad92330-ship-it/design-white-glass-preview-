import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { AlertTriangle, Check, Ban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { matchingApi } from '../api'

/**
 * Le modal de confirmation du positionnement (PDF 4 §10.1).
 *
 * Trois blocs, dans cet ordre, et l'ordre EST le message : ce que je crée
 * (inévitable, dit d'avance), ce que je peux préparer (proposé, jamais coché
 * d'office pour ce qui part vers l'extérieur), ce que je vérifie (les points
 * d'attention, qui n'empêchent pas et qui sont journalisés).
 *
 * Trouvé en recette : le bouton positionnait DIRECTEMENT. La préflight était
 * calculée côté serveur — elle refusait bien un consentement expiré — mais
 * personne ne la voyait. Un geste qui engage la crédibilité de l'ESN chez son
 * client partait sans que rien ne soit annoncé, et le point d'attention que le
 * document veut « affiché ET journalisé » n'était que journalisé.
 */
export function PositionDialog({
  needId,
  runId,
  consultantId,
  name,
  open,
  onOpenChange,
}: {
  needId: string
  runId: string
  consultantId: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('matching')
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof matchingApi.preview>> | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setPreflight(null)
    matchingApi
      .preview(needId, { runId, consultantId })
      .then(result => {
        setPreflight(result)
        setChecked(result.canPrepare.filter(action => action.defaultChecked).map(action => action.action))
      })
      .catch((error: Error) => toast.error(error.message))
  }, [open, needId, runId, consultantId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('position.title', { name })}</DialogTitle>
          <DialogDescription>{t('position.subtitle')}</DialogDescription>
        </DialogHeader>

        {!preflight ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('loading')}
          </Text>
        ) : (
          <Box display="flex" className="flex-col gap-4">
            <Section title={t('position.creates')}>
              {preflight.creates.map(line => (
                <Line key={line}>{line}</Line>
              ))}
            </Section>

            <Section title={t('position.canPrepare')}>
              {preflight.canPrepare.map(action => (
                <Box key={action.action} display="flex" className="items-center gap-2">
                  <Checkbox
                    checked={checked.includes(action.action)}
                    onCheckedChange={() =>
                      setChecked(current =>
                        current.includes(action.action)
                          ? current.filter(entry => entry !== action.action)
                          : [...current, action.action],
                      )
                    }
                    aria-label={action.label}
                  />
                  <Text size="xs">{action.label}</Text>
                </Box>
              ))}
            </Section>

            <Section title={t('position.checks')}>
              {preflight.checks.map(check => (
                <Box key={check.label} display="flex" className="items-start gap-2">
                  {check.level === 'ok' ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
                  ) : check.level === 'warning' ? (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
                  ) : (
                    <Ban className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
                  )}
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {check.label}
                  </Text>
                </Box>
              ))}
            </Section>

            {preflight.missing.length > 0 && !preflight.blocked ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('position.acknowledged')}
              </Text>
            ) : null}
          </Box>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('position.cancel')}
          </Button>
          <Button
            disabled={!preflight || preflight.blocked || pending}
            onClick={() => {
              setPending(true)
              matchingApi
                .position(needId, { runId, consultantId, prepare: checked })
                .then(() => {
                  toast.success(t('position.done'))
                  onOpenChange(false)
                })
                .catch((error: Error) => toast.error(error.message))
                .finally(() => setPending(false))
            }}
          >
            {t('position.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text size="xs" weight="semibold" className="uppercase text-[var(--bellum-text-muted)]">
        {title}
      </Text>
      <Box display="flex" className="mt-1 flex-col gap-1">
        {children}
      </Box>
    </Box>
  )
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
      · {children}
    </Text>
  )
}
