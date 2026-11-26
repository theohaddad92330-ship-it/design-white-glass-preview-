import { Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePlaybooks } from '../api'

/** Où se RÈGLE ce qui part tout seul — un seul endroit (#1438). */
const ROUTINES_ROUTE = '/settings/routines'

/**
 * LES AUTOMATISATIONS, EN SYNTHÈSE — #1438.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE ICI, ET CE QUI EST PARTI
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Pilotage montre l'état et les problèmes. La page Automatisations sert à
 * configurer. »* Le seuil en jours, « Simuler » et « Armer » sont donc partis
 * dans Réglages › Routines. Ce bloc dit l'ÉTAT, et ouvre la porte.
 *
 * ⚠️ **« 1 en anomalie » n'est pas livré, et ce n'est pas un oubli.** Un
 * playbook porte trois choses : armé ou non, son délai de silence, sa date de
 * mise à jour. Il n'existe **aucun** état d'anomalie — ni échec d'envoi remonté,
 * ni compteur d'erreur. « 1 en anomalie » ne serait pas un chiffre faux : ce
 * serait un chiffre sans source. La synthèse dit ce qu'elle sait.
 *
 * ⚠️ **Une lecture en échec ne s'écrit pas « 0 armée ».** Zéro armé est une
 * information vraie et rassurante ; ne pas avoir pu lire ne l'est pas, et les
 * deux mèneraient à des gestes opposés.
 */
export function PlaybooksSummary() {
  const { t } = useTranslation('playbooks')
  const { data, isError, isLoading } = usePlaybooks()

  if (isLoading) return null

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text element="p" size="sm" weight="semibold">
          {t('summary.title')}
        </Text>
        <Link
          to={ROUTINES_ROUTE}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('summary.manage')}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      </div>
      {isError || !data ? (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('summary.unreadable')}
        </Text>
      ) : (
        <>
          <Text element="p" size="base" weight="semibold" className="mt-1">
            {t('summary.counts', {
              armed: data.filter(playbook => playbook.enabled).length,
              idle: data.filter(playbook => !playbook.enabled).length,
            })}
          </Text>
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('summary.hint')}
          </Text>
        </>
      )}
    </Card>
  )
}
