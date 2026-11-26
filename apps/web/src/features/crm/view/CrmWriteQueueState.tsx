import { Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { CrmWriteRequests } from '@bellum/contracts'

/**
 * #2201.51 — L'ÉTAT de la file des écritures CRM, à côté de son contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `/actions/ecritures` REDIRIGE depuis le 16/09/2026 (le patron : une route
 * qui quitte la navigation redirige — `sections.test.ts`). L'écran qu'elle
 * rendait ne montrait pas seulement une liste : il disait TROIS états, et
 * aucun ne se confond — « aucune demande » ≠ « aucun CRM branché » ≠ « pas
 * encore lu ». Rediriger sans emporter ces états aurait supprimé la moitié de
 * la capacité en croyant la déplacer (#1508), qui est précisément ce que la
 * décision interdit.
 *
 * C'est le « 0 qui ment » d'un cran plus haut : sans ce bloc, l'absence de
 * ligne se lit « tout est validé » alors que rien ne PEUT l'être.
 *
 * Quand la file est lisible ET branchée (#4714.4) : pas de verdict d'état, mais
 * une note qui dit ce qui part SANS clic et ce qui attend une prévisualisation.
 */
export function CrmWriteQueueState({ status, unread }: { status?: CrmWriteRequests['status']; unread: boolean }) {
  const { t } = useTranslation('crm')
  // Pas encore lu, ou lecture échouée : on n'affirme RIEN. Ni file vide, ni
  // connecteur absent — un verdict tiré d'une lecture qui n'a pas eu lieu est
  // pire que pas de verdict.
  if (unread || !status) return null
  // #4714.4 — file lisible ET branchée : plus de verdict d'état, mais l'écran DIT ce qui part sans clic
  // (exception c147, #4714.1 : la synchro remplit un champ VIDE e-mail/téléphone, n'écrase jamais) et
  // ce qui attend une prévisualisation. Dire seulement — aucun comportement changé.
  if (status === 'ready') {
    return (
      <Card className="flex flex-col gap-1 p-4">
        <Text size="sm" weight="semibold">
          {t('writeRequests.autoWrites.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('writeRequests.autoWrites.body')}
        </Text>
      </Card>
    )
  }
  const key = status === 'not_connected' ? 'notConnected' : 'notConfigured'
  return (
    <Card className="flex flex-col gap-1 p-4">
      <Text size="sm" weight="semibold">
        {t(`writeRequests.${key}.title`)}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t(`writeRequests.${key}.body`)}
      </Text>
      {status === 'not_connected' ? (
        <Link to="/integrations" className="mt-1 text-[var(--bellum-text-accent)] underline underline-offset-2">
          <Text size="sm" element="span">
            {t('writeRequests.notConnected.cta')}
          </Text>
        </Link>
      ) : null}
    </Card>
  )
}
