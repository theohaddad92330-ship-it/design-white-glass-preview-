import type { DailyBriefing } from '@bellum/contracts'
import { Box, Text, TYPE_SCALE, cn } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UserDropdownMenu } from '@/components/sidebar/UserDropdownMenu'
import { useProfile } from '@/features/profiles/hooks/useProfile'

/**
 * L'EN-TÊTE DE « TA JOURNÉE » — le contrat éditorial de la page (#2113), redessiné d'après Théo A today-jour.R1.
 *
 * Refonte Théo (23/10/2026) : l'en-tête porte le titre, la phrase, la ligne
 * « actualisé » et ses gestes à droite ; le RÉSUMÉ et le GESTE PRINCIPAL ont
 * rejoint la carte « Commencer ici » (`TodayStartCallout`), juste sous les tuiles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL PORTE, ET CE QU'IL NE PORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2113.7 à #2113.11 listent cinq choses qu'un en-tête doit dire : où on est, à
 * quoi la page sert, ce que le produit sait déjà, ce qu'il recommande, et par
 * où commencer. Quatre sont ici — le titre personnalisé, la phrase de bénéfice,
 * le résumé dynamique, le geste principal.
 *
 * ⚠️ LE RÔLE NE CHANGE RIEN ICI (Louis, 21/09/2026) : le rôle change l'ORDRE des blocs, jamais leur contenu. Le
 * copilote n'a pas de seconde porte dans l'en-tête : `AskLaura` vit sous les priorités (#1395).
 */
export function BriefingHero({
  data,
  isMobile = false,
  updatedLine,
  actions,
}: {
  data: DailyBriefing
  isMobile?: boolean
  /** Refonte Théo — « Brief actualisé à 08:12 · jeudi 22 octobre », sous la phrase. */
  updatedLine?: ReactNode
  /** Refonte Théo (`.v18-head-actions`) — le périmètre, « Ajouter une tâche » et le menu « … ». */
  actions?: ReactNode
}) {
  const { t } = useTranslation('briefing')
  const decisionCount = data.actions?.length ?? 0

  return (
    <Box as="header" className="flex flex-wrap items-start justify-between gap-4">
      <Box className="flex min-w-0 flex-col gap-1.5">
        <Box className="flex min-w-0 items-center gap-2.5">
          {/* #2097 — l'avatar, SEULEMENT là où la barre latérale ne le porte pas
              (sous 768 px) ; monté ou non, jamais lu sans condition (voir plus haut). */}
          {isMobile && <BriefingHeroAvatar fallbackName={data.firstName ?? ''} />}
          {/* #2456 — le seul niveau 1 de la page. F2-FIX #4332 — le rôle `pageTitle`, une valeur
              pour toutes les pages d'ouverture (garde `pages-open-with-the-page-title-role`) ; la
              maquette Théo le veut à 30 px : écart nommé, à trancher, pas corrigé en douce. */}
          <Text element="h1" className={cn(TYPE_SCALE.pageTitle, 'min-w-0')}>
            {/* Louis 23/10 — « Ma journée » remplace « Aujourd'hui » : le titre dit « Ta journée », comme la maquette. */}
            {t('day.title')}
          </Text>
        </Box>
        {/* #2113.7-.12 — la phrase PERSONNALISÉE (le nom, et ce qu'on vient faire ici) passe sous le titre (Louis 23/10). */}
        <Text size="lg" weight="medium" className="text-[var(--bellum-text-primary)]">
          {data.firstName ? t('page.headingWithName', { name: data.firstName }) : t('page.heading')}
        </Text>
        {/* LA PHRASE DE BÉNÉFICE (#2113.8, #2113.13) — dynamique quand il y a un nombre
            RÉEL de sujets à nommer (`data.actions`), générique sinon. #2097.17 — le verdict
            de Laura, `lg` (18 px) sur l'échelle GA-31. */}
        <Text size="lg" className="text-[var(--bellum-text-secondary)]">
          {decisionCount > 0 ? t('page.subtitleWithDecisions', { count: decisionCount }) : t('page.subtitle')}
        </Text>
        {updatedLine}
      </Box>
      {actions ? <Box className="flex flex-wrap items-center gap-2">{actions}</Box> : null}
    </Box>
  )
}

function BriefingHeroAvatar({ fallbackName }: { fallbackName: string }) {
  const { data: profile } = useProfile()
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || fallbackName

  return (
    <UserDropdownMenu
      user={{ name: fullName, avatarUrl: profile?.avatar_url ?? null }}
      triggerVariant="avatar"
      side="bottom"
      align="start"
    />
  )
}
