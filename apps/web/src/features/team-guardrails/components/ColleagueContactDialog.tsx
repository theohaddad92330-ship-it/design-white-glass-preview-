import { useCallback, useState, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { ContactGuardrail } from '@bellum/contracts'
import { teamGuardrailsApi } from '../api'

/**
 * #4158.21 / #4158.22 — la confirmation AVANT de copier ou de marquer fait un
 * message pour un contact que l'espace connaît déjà : sur la liste « ne pas
 * contacter » (en premier), ou contacté par un collègue dans les 30 derniers
 * jours (envoi vérifié OU déclaré, nommé comme tel).
 *
 * Jamais de blocage dur, jamais d'envoi : « Continuer quand même » rend la main.
 * Si l'espace ne sait rien du contact — ou si la lecture échoue — le geste
 * s'exécute SANS dialogue : une garde d'information ne doit pas empêcher le
 * travail quand elle n'a rien à dire.
 */
export function useColleagueContactGuard(contactId: string | null | undefined): {
  /** Exécute `action` — après confirmation si l'espace a quelque chose à dire. */
  run: (action: () => void) => void
  dialog: ReactNode
} {
  const [pending, setPending] = useState<{ action: () => void; finding: ContactGuardrail } | null>(null)

  const run = useCallback(
    (action: () => void) => {
      if (!contactId) return action()
      // Une lecture FRAÎCHE à chaque geste (pas de cache) : la confirmation lit un fait
      // récent, et le hook ne demande aucun fournisseur de requêtes à son appelant.
      void teamGuardrailsApi.checkContacts([contactId]).then(
        response => {
          const finding = response.items.find(item => item.contact_id === contactId)
          if (finding) setPending({ action, finding })
          else action()
        },
        () => action(),
      )
    },
    [contactId],
  )

  const dialog = pending ? (
    <ColleagueContactDialog
      finding={pending.finding}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const { action } = pending
        setPending(null)
        action()
      }}
    />
  ) : null

  return { run, dialog }
}

function ColleagueContactDialog({
  finding,
  onCancel,
  onConfirm,
}: {
  finding: ContactGuardrail
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('teamGuardrails')
  return (
    <Dialog open onOpenChange={open => (open ? undefined : onCancel())}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('guard.title')}</DialogTitle>
          <DialogDescription>{t('guard.intro')}</DialogDescription>
        </DialogHeader>
        <FindingLines finding={finding} />
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onCancel}>
            {t('guard.cancel')}
          </Button>
          <Button className="min-h-11" onClick={onConfirm}>
            {t('guard.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FindingLines({ finding }: { finding: ContactGuardrail }) {
  const { t } = useTranslation('teamGuardrails')
  const dnc = finding.do_not_contact
  const contacted = finding.contacted
  return (
    <ul className="space-y-2">
      {/* La liste « ne pas contacter » d'abord : c'est la plus forte des deux. */}
      {dnc ? (
        <li>
          <Text size="sm" weight="medium" color="text-[var(--warning-soft-text)]">
            {dnc.kind === 'domain'
              ? t('guard.doNotContactDomain', {
                  domain: dnc.domain ?? '',
                  reason: dnc.reason,
                  name: dnc.added_by_name,
                })
              : t('guard.doNotContact', { reason: dnc.reason, name: dnc.added_by_name })}
          </Text>
        </li>
      ) : null}
      {contacted ? (
        <li>
          <Text size="sm">
            {contacted.days_ago === 0
              ? t(contacted.proof === 'verified' ? 'guard.contactedToday' : 'guard.contactedTodayDeclared', {
                  name: contacted.by_name,
                })
              : t(contacted.proof === 'verified' ? 'guard.contactedVerified' : 'guard.contactedDeclared', {
                  name: contacted.by_name,
                  count: contacted.days_ago,
                })}
          </Text>
        </li>
      ) : null}
    </ul>
  )
}

/**
 * #4158.47 / #4158.51 — la même confirmation pour PLUSIEURS contacts à la fois
 * (création d'une séquence en lot). Seuls les contacts « contactés par un
 * collègue » comptent : la liste « ne pas contacter » arrête déjà côté serveur.
 * Jamais de blocage dur ; une lecture en échec laisse le geste partir.
 */
export function useColleagueContactsGuard(nameOf: (contactId: string) => string): {
  run: (contactIds: readonly string[], action: () => void) => void
  dialog: ReactNode
} {
  const { t } = useTranslation('teamGuardrails')
  const [pending, setPending] = useState<{ action: () => void; findings: ContactGuardrail[] } | null>(null)

  const run = useCallback((contactIds: readonly string[], action: () => void) => {
    if (contactIds.length === 0) return action()
    void teamGuardrailsApi.checkContacts([...contactIds]).then(
      response => {
        const findings = (response?.items ?? []).filter(item => item.contacted)
        if (findings.length > 0) setPending({ action, findings })
        else action()
      },
      () => action(),
    )
  }, [])

  const dialog = pending ? (
    <Dialog open onOpenChange={open => (open ? undefined : setPending(null))}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('guard.title')}</DialogTitle>
          <DialogDescription>{t('guard.intro')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {pending.findings.map(finding => (
            <li key={finding.contact_id}>
              <Text size="sm" weight="medium">
                {nameOf(finding.contact_id)}
              </Text>
              <FindingLines finding={finding} />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => setPending(null)}>
            {t('guard.cancel')}
          </Button>
          <Button
            className="min-h-11"
            onClick={() => {
              const { action } = pending
              setPending(null)
              action()
            }}
          >
            {t('guard.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null

  return { run, dialog }
}
