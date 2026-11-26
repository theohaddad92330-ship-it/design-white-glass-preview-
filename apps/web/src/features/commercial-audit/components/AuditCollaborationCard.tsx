import { Link } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { useTeam } from '@/features/team/hooks/useTeam'
import { AuditCard } from './AuditCard'
import { dismissCollaborationPrompt, isCollaborationPromptDismissed } from '../lib/collaboration-prompt-dismissal'

/** #2081.8 — même écran que l'invitation existante (`workspace-team.service.ts`
 *  via `TeamView`) : cette carte NAVIGUE, elle ne réimplémente pas l'invitation. */
const TEAM_ROUTE = '/settings/team'

/**
 * #2081 — LA COLLABORATION APRÈS L'AUDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET POURQUOI MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le registre (`.claude/notes/registre-2026-09-15-onboarding-audit-welcome.md`,
 * #2081) demandait, après l'audit, « ton collègue gère-t-il une partie de ces
 * comptes ? » — question restée sans écran, dernière du lot W26 « Collaboration
 * après la valeur ». Elle arrive en fin de `CommercialAuditScreen` : après que
 * le produit a montré ce qu'il sait, pas avant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CLOISONNEMENT PAR ESPACE, PAS RÉINVENTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien n'est écrit ici : `useTeam()` lit `GET /workspaces/me`, déjà
 * workspace-scopé côté serveur (`workspace-team.service.ts`). Le report
 * (#2081.11) est lui-même scopé par `workspace.id`
 * (`collaboration-prompt-dismissal.ts`) — un report dans un espace ne
 * s'applique jamais à un autre (garde GA-43).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS BLOCS, PUIS L'ACTION — JAMAIS L'INVERSE (#2081.12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Partagé (#2081.2), personnel (#2081.3, D58/D65 — messagerie, agenda,
 * conversations avec Laura, préférences : jamais transmis, même wording que
 * `team.json:handover.personalKinds`), visibilité (#2081.7, lue sur
 * `workspace.portfolioVisibility`, jamais devinée). L'invitation et le report
 * arrivent APRÈS ces trois blocs dans l'ordre de rendu — pas avant que la
 * personne ait pu les lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NE SE MONTRE QUE TANT QUE LA QUESTION TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un espace qui a déjà plusieurs membres a déjà sa réponse — la question ne se
 * repose pas. Sans équipe chargée, rien ne s'affiche (facultatif, ne bloque
 * jamais l'audit).
 */
export function AuditCollaborationCard() {
  const { t } = useTranslation('commercialAudit', { keyPrefix: 'collaboration' })
  const { team, isLoading } = useTeam()
  const [dismissedNow, setDismissedNow] = useState(false)

  if (isLoading || !team) return null
  const { workspace } = team
  if (workspace.memberCount > 1) return null
  if (dismissedNow || isCollaborationPromptDismissed(workspace.id)) return null

  function onDismiss() {
    dismissCollaborationPrompt(workspace.id)
    setDismissedNow(true)
  }

  return (
    <AuditCard className="space-y-4" data-testid="audit-collaboration-card">
      <div className="flex items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
        <div className="space-y-1">
          <Text element="h2" size="sm" weight="semibold">
            {t('title')}
          </Text>
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('subtitle')}
          </Text>
        </div>
      </div>
      {/* #2081.2 / #2081.3 / #2081.7 — dans cet ordre, avant toute action. */}
      <div className="space-y-3">
        <div>
          <Text
            element="h3"
            size="xs"
            weight="semibold"
            className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {t('shared.title')}
          </Text>
          <Text element="p" size="sm">
            {t('shared.description')}
          </Text>
        </div>
        <div>
          <Text
            element="h3"
            size="xs"
            weight="semibold"
            className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {t('personal.title')}
          </Text>
          <Text element="p" size="sm">
            {t('personal.description')}
          </Text>
        </div>
        <div>
          <Text
            element="h3"
            size="xs"
            weight="semibold"
            className="uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {t('visibility.title')}
          </Text>
          <Text element="p" size="sm">
            {t(`visibility.${workspace.portfolioVisibility}`)}
          </Text>
        </div>
      </div>
      {/* #2081.12 — l'invitation et le report arrivent EN DERNIER, après les
          trois blocs d'explication ci-dessus, jamais avant. */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button asChild variant="violet" size="sm" className="pointer-coarse:min-h-11">
          <Link to={TEAM_ROUTE}>{t('invite')}</Link>
        </Button>
        <Button variant="ghost" size="sm" className="pointer-coarse:min-h-11" onClick={onDismiss}>
          {t('later')}
        </Button>
      </div>
    </AuditCard>
  )
}
