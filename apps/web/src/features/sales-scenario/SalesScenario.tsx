import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, MOTION, Text, cn, useAnyModalOpen } from '@bellum/ui'
import { accountsApi } from '@/features/accounts/api'
import { contactsApi } from '@/features/contacts/api'
import { buildSalesScenarioSteps, type SalesScenarioData } from './sales-scenario'
import { useSalesScenarioStore } from './sales-scenario-store'

/**
 * #2731.2 — LA BARRE DU SCÉNARIO COMMERCIAL, MONTÉE À LA RACINE.
 *
 * Même forme et même place que la barre de la visite guidée
 * (`ProductTourCompanion`) : non modale, l'écran derrière reste utilisable, et
 * elle survit à la navigation — c'est ce qui permet de JOUER le scénario dans
 * le produit, écran après écran, sans perdre le fil. Lancer l'un arrête l'autre
 * (la porte de lancement, Réglages › Démarrage, s'en charge).
 *
 * Les données sont lues À L'OUVERTURE, jamais avant : le dernier compte
 * analysé de l'espace (`status: completed`, le plus récent), puis son
 * interlocuteur classé premier par le classement du compte, retrouvé par son
 * nom dans les contacts du compte. Tout ce qui manque sort du scénario
 * (`buildSalesScenarioSteps`) au lieu d'être deviné.
 */
export function SalesScenario() {
  const active = useSalesScenarioStore(state => state.active)
  if (!active) return null
  return <SalesScenarioBar />
}

function useSalesScenarioData(): { data: SalesScenarioData; ready: boolean } {
  const accountQuery = useQuery({
    queryKey: ['sales-scenario', 'account'],
    queryFn: () => accountsApi.list({ status: 'completed', sort: 'date_desc', limit: 1 }),
  })
  const row = accountQuery.data?.data?.[0]
  const account = row?.id ? { id: row.id, name: row.company_name || '' } : null
  const accountId = account?.id

  const contactsQuery = useQuery({
    queryKey: ['sales-scenario', 'contacts', accountId],
    queryFn: () => contactsApi.listByAccount(accountId as string),
    enabled: Boolean(accountId),
  })
  const rankingQuery = useQuery({
    queryKey: ['sales-scenario', 'ranking', accountId],
    queryFn: () => contactsApi.rankByAccount(accountId as string),
    enabled: Boolean(accountId),
  })

  const firstId = rankingQuery.data?.ranked?.[0]?.contact_id
  const top = firstId ? contactsQuery.data?.find(contact => contact.id === firstId) : undefined
  const contact = top?.full_name ? { id: top.id, name: top.full_name } : null

  const ready =
    accountQuery.isFetched &&
    (!accountId ||
      ((contactsQuery.isFetched || contactsQuery.isError) && (rankingQuery.isFetched || rankingQuery.isError)))
  return { data: { account, contact }, ready }
}

function SalesScenarioBar() {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const rawIndex = useSalesScenarioStore(state => state.index)
  const goTo = useSalesScenarioStore(state => state.goTo)
  const stop = useSalesScenarioStore(state => state.stop)
  const { data, ready } = useSalesScenarioData()
  // #4623 — rien ne flotte au-dessus des actions d'un dialogue ouvert : cette barre s'efface (z-widget 80 > z-overlay 60).
  const anyModalOpen = useAnyModalOpen()

  const steps = buildSalesScenarioSteps(data)
  const index = Math.min(rawIndex, steps.length - 1)
  const step = steps[index]!
  const isLast = index + 1 >= steps.length

  const visit = (target: number) => {
    const next = steps[target]
    if (!next) return
    goTo(target)
    void navigate({ to: next.route })
  }

  return (
    <motion.div
      initial={MOTION.enterFromBelow.initial}
      animate={MOTION.enterFromBelow.animate}
      transition={MOTION.enterFromBelow.transition}
      className={cn(
        'fixed inset-x-4 bottom-[calc(4.75rem+var(--bellum-mobile-nav-height,0px))] z-widget',
        'mx-auto max-w-[34rem] rounded-xl border border-[var(--bellum-border)]',
        'bg-[var(--bellum-surface-1)] p-3 shadow-[var(--shadow-elevated)]',
        anyModalOpen && 'hidden',
      )}
      role="region"
      aria-label={t('salesScenario.label')}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <Text size="xs" aria-live="polite" className="text-[var(--bellum-text-secondary)]">
            {ready
              ? t('salesScenario.position', { position: index + 1, total: steps.length })
              : t('salesScenario.loading')}
          </Text>
          {ready ? (
            <>
              <Text size="sm" weight="medium">
                {t(`salesScenario.step.${step.key}.title`, step.values)}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`salesScenario.step.${step.key}.body`, step.values)}
              </Text>
            </>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('salesScenario.quit')}
          onClick={stop}
          icon={X}
          className="shrink-0"
        />
      </div>

      {ready ? (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => visit(index)}
            className="min-w-0 flex-1 truncate"
          >
            {t('salesScenario.go')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('salesScenario.previous')}
            disabled={index === 0}
            onClick={() => visit(index - 1)}
            icon={ChevronLeft}
            className="shrink-0"
          />
          {isLast ? (
            <Button type="button" size="sm" onClick={stop} className="min-w-0 flex-1 truncate">
              {t('salesScenario.finish')}
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              aria-label={t('salesScenario.next')}
              onClick={() => visit(index + 1)}
              icon={ChevronRight}
              className="shrink-0"
            />
          )}
        </div>
      ) : null}
    </motion.div>
  )
}
