import { sinceLastVisitLineSpeaks, type SinceLastVisitLine } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatActionDate } from '@/features/action-history/view/actionHistoryPresentation'
import { useAccountKnownMovements } from '@/features/accounts/hooks/useAccountKnownMovements'
import { sinceLastVisitLineText } from '@/features/briefing/view/sinceLastVisitLines'

/**
 * #2556 — UN COMPTE DÉJÀ CONNU DOIT VALOIR MIEUX QU'UN ANNUAIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « CONNU » VEUT DIRE ICI, ET CE QUE CETTE CARTE NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Retour client (François Thomas, call bêta du 17/09/2026) : sur un compte
 * que le commercial connaît déjà, produire « quelque chose » à tout prix est
 * exactement ce qui détruit la confiance. `known` est DÉDUIT côté serveur
 * (#2556.1, `AccountKnownService`) d'une trace D'ACTIVITÉ — jamais demandé à
 * l'utilisateur — et cette carte ne se rend PAS DU TOUT sur un compte non
 * connu : pas de panneau vide, pas de « rien à signaler », rien. La page
 * reste exactement ce qu'elle était.
 *
 * Sur un compte connu, deux issues honnêtes, jamais une troisième inventée :
 * au moins un mouvement DATÉ et SOURCÉ (réutilisant `sinceLastVisitLineText`
 * et les clés i18n du Brief, GA-26 — un mouvement se décrit à UN seul
 * endroit), ou l'aveu explicite qu'il n'y a rien de neuf depuis la fenêtre
 * annoncée (`sinceLastVisit.upToDate`, la MÊME phrase que le Brief).
 *
 * Une PANNE (503, lecture qui échoue) ne se raconte JAMAIS comme « rien de
 * neuf » : les deux appellent des gestes opposés (attendre / réessayer vs. ne
 * rien faire), et les confondre est le défaut que ce dépôt refuse partout
 * ailleurs (`sinceLastVisit.unreadable`, ici réutilisée).
 */
export function AccountKnownMovementsCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts')
  const { t: tBriefing } = useTranslation('briefing')
  const { data, isPending, isError } = useAccountKnownMovements(accountId)

  // En cours de lecture : rien à annoncer encore, pas de flash « inconnu ».
  if (isPending) return null

  if (isError) {
    return (
      <Card className="p-4">
        <CardHeader title={t('knownMovements.title')} />
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {tBriefing('sinceLastVisit.unreadable')}
        </Text>
      </Card>
    )
  }

  // #2556.1 — compte NON connu : cette carte ne rend RIEN, jamais un panneau
  // vide. Produire un encart sur un compte que la déduction ne reconnaît pas
  // serait précisément le risque nommé par le client.
  if (!data.known || data.since === null) return null

  const date = formatActionDate(data.since)
  const speakingLines = data.lines.filter(sinceLastVisitLineSpeaks)

  return (
    <Card className="p-4">
      <CardHeader title={t('knownMovements.title')} />
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('knownMovements.subtitle')}
      </Text>
      {speakingLines.length === 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-primary)]">
          {tBriefing('sinceLastVisit.upToDate', { date })}
        </Text>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {speakingLines.map((line: SinceLastVisitLine) => {
            const text = sinceLastVisitLineText(tBriefing, line)
            if (!text) return null
            return (
              <li key={line.kind}>
                <Text size="xs" className="text-[var(--bellum-text-primary)]">
                  {text}
                </Text>
              </li>
            )
          })}
        </ul>
      )}
      <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
        {tBriefing('sinceLastVisit.window', { date })}
      </Text>
    </Card>
  )
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <History className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
    </div>
  )
}
