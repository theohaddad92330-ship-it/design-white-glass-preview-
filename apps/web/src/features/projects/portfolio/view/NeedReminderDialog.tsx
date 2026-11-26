import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { actionsApi } from '@/features/actions/api'
import { gestureIdempotency } from '@/features/actions/lib/gesture-idempotency'

/** Default the reminder to a week out, 9am local — a need is followed up in days,
 *  not in hours. Formatted for `<input type="datetime-local">`. */
function inAWeekLocal(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  date.setHours(9, 0, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

/**
 * « Créer un rappel de mise à jour » sur un besoin (restitution V2 §7).
 *
 * Le rappel est porté par le COMPTE, pas par un contact : un besoin appartient à
 * une entreprise, et désigner d'office l'un de ses contacts serait arbitraire. Il
 * part dans l'Action Router existant (`POST /actions/dispatch`,
 * `schedule_reminder`), qui re-résout l'appartenance du compte côté serveur et
 * écrit une ligne datée dans le journal d'activité.
 *
 * L'écriture n'a lieu qu'AU CLIC de confirmation : la fenêtre montre d'abord ce
 * qui sera enregistré (échéance + note), et l'issue réelle ensuite — y compris
 * quand le serveur a refusé (`skipped`), jamais un succès de façade.
 */
export function NeedReminderDialog({
  accountId,
  companyName,
  needLabel,
  open,
  onOpenChange,
}: {
  accountId: string
  companyName: string
  needLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('projects')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)

  // Re-seed on each opening: a second reminder must never inherit the previous
  // one's date, note or result.
  useEffect(() => {
    if (!open) return
    setAt(inAWeekLocal())
    setNote(t('reminder.notePrefill', { need: needLabel }))
    setOutcome(null)
  }, [open, needLabel, t])

  const run = useMutation({
    // #1952.38 — LA CLÉ D'IDEMPOTENCE DU GESTE, QUI MANQUAIT ICI.
    //
    // `ActionRouterService.dispatchIdempotent` rend la main à `dispatchOne` dès
    // que `idempotencyKey` est absente : la protection du routeur existait et ne
    // protégeait rien depuis cette fenêtre. Un double clic — ou un renvoi
    // réseau — enregistrait DEUX rappels sur le dossier.
    //
    // Les coordonnées sont celles de la décision prise dans la fenêtre : le
    // dossier, l'échéance choisie et la note écrite. Deux rappels à deux dates
    // sont deux gestes ; la même demande reconfirmée après un rafraîchissement
    // est le même. La règle entière : `gestureIdempotency`.
    //
    // ⚠️ La clé est réclamée AU CLIC (dans le `mutationFn`), pas au rendu :
    // une fenêtre ouverte puis annulée ne doit rien laisser derrière elle.
    mutationFn: async () => {
      const trimmed = note.trim()
      const scheduledFor = new Date(at).toISOString()
      const gesture = gestureIdempotency('need-reminder', [accountId, scheduledFor, trimmed])
      const result = await actionsApi.dispatch({
        type: 'schedule_reminder',
        accountId,
        at: scheduledFor,
        ...(trimmed ? { note: trimmed } : {}),
        idempotencyKey: gesture.key,
      })
      // L'issue est CONNUE et la fenêtre va la dire : le geste est fini. Jamais
      // sur `unknown` — la requête a peut-être abouti, et relâcher la clé
      // laisserait un re-clic enregistrer un rappel déjà enregistré (doctrine
      // « un timeout n'est pas un échec »).
      if (result.status !== 'unknown') gesture.release()
      return result
    },
    onSuccess: result => {
      if (result.status === 'done') {
        setOutcome(t('reminder.done'))
        return
      }
      // Le serveur a refusé (compte hors périmètre, écriture impossible) : on
      // affiche SA raison, on n'annonce pas un rappel qui n'existe pas.
      setOutcome(result.reason ?? t('reminder.refused'))
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error && error.message ? error.message : t('reminder.error')),
  })

  return (
    <Dialog open={open} onOpenChange={next => (run.isPending ? undefined : onOpenChange(next))}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">{t('reminder.title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('reminder.subtitle', { company: companyName })}
          </DialogDescription>
        </DialogHeader>

        {outcome ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {outcome}
          </Text>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="need-reminder-at">{t('reminder.at')}</Label>
              <Input
                id="need-reminder-at"
                type="datetime-local"
                value={at}
                onChange={event => setAt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="need-reminder-note">{t('reminder.note')}</Label>
              <Textarea id="need-reminder-note" rows={3} value={note} onChange={event => setNote(event.target.value)} />
            </div>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('reminder.hint')}
            </Text>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={run.isPending}>
            {outcome ? t('reminder.close') : t('reminder.cancel')}
          </Button>
          {outcome ? null : (
            <Button
              variant="black"
              size="sm"
              disabled={at.length === 0}
              isLoading={run.isPending}
              onClick={() => run.mutate()}
            >
              {t('reminder.confirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
