import { useTranslation } from 'react-i18next'
import { useQueries } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { launchPlanQueryOptions } from '@/features/search/hooks/useLaunchPlan'
import { dataSourceLabel } from '@/lib/data-source-label'
import { useMarketVerificationPlan } from '../../hooks'
import { exactVerificationCost } from '../../lib/marketVerificationCost'
import { announcedPublicSources } from '../../lib/marketVerificationPublicSources'

/**
 * #2288.4 — LE COÛT ANNONCÉ AVANT LA VÉRIFICATION PAYANTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQ INFORMATIONS, AVANT LE GESTE, JAMAIS APRÈS
 * ─────────────────────────────────────────────────────────────────────────────
 * Combien de candidats · quelles natures de source · combien de crédits ·
 * combien de minutes · ce que ça peut faire bouger. Toutes viennent du serveur
 * (`POST /consultants/:id/market-verification/plan`), qui les dérive du plan de
 * rafraîchissement complet : le prix n'est écrit NULLE PART dans ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE DIALOGUE N'AFFICHE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune PROBABILITÉ — ni « chance de trouver », ni « taux de succès ». Ce
 * qu'on annonce est factuel ou n'est pas annoncé. Et aucun nom de FOURNISSEUR
 * PAYANT : on nomme des NATURES de source (registre officiel, offres
 * d'emploi…), jamais ce qui nous sert (GA-44). Un registre ou une autorité
 * PUBLIQUE n'est PAS un fournisseur qu'on tait (c66, décision Louis
 * 18/09/2026) : `announcedPublicSources` les nomme, sous les mêmes libellés
 * que `Réglages › Intégrations` (`dataSourceLabel`, un seul endroit, GA-26).
 * #2288.4 (18/09, suite) — les TROIS (France Travail, BOAMP, DECP) sont gatées
 * par entreprise, d'après les réponses du LANCEUR (`publicTenderSources` +
 * `scenario`), jamais d'une liste de noms ; `estimate.publicSources` reste
 * toujours vide (`planMarketVerification`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PORTE DE CRÉDITS EST CELLE DU PRODUIT, PAS UNE SECONDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `useCreditGate` — le MÊME crible que l'enrichissement d'organigramme et que
 * le lanceur (GA-26). Solde inconnu ⇒ le bouton reste cliquable : c'est le
 * serveur qui est la vraie porte, griser sur une ignorance bloquerait un
 * utilisateur solvable.
 *
 * ⚠️ Ce dialogue ne débite RIEN lui-même : il annonce. Son bouton confirme, et
 * c'est l'écran qui lance alors TOUTES les entreprises annoncées par le lanceur
 * d'« Analyser » (décision Louis, 18/09/2026) — le serveur y débite selon son
 * plan de lancement, le chiffre exact affiché ici.
 */
export function VerificationPlanDialog({
  open,
  onOpenChange,
  talentId,
  companies,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  talentId: string | undefined
  companies: readonly string[]
  onConfirm: () => void
}) {
  const { t } = useTranslation('consultants')
  const { t: tCommon } = useTranslation('common')
  const gate = useCreditGate()
  // Le devis est demandé sur le périmètre EXACT, au moment où on le regarde :
  // un prix annoncé d'après un cache serait un prix d'hier.
  const plan = useMarketVerificationPlan(open ? talentId : undefined, companies)

  const estimate = plan.data ?? null

  // #2288.4 — LE COÛT EXACT, entreprise par entreprise, tel que le LANCEUR le
  // débitera : `GET /analysis/launch-plan` (`planLaunch`, même ordre de lecture
  // que `start()`, prix pris dans `resolveAnalysisCost`, la fonction du débit).
  // Un dossier déjà analysé est rouvert sans débit ; la démonstration ne débite
  // rien. Jamais « prix de grille × nombre » — voir `marketVerificationCost.ts`.
  const isDemo = useIsDemo()
  const candidateNames = (estimate?.states ?? [])
    .filter(entry => entry.state !== 'kept' && entry.state !== 'corrected')
    .map(entry => entry.companyName)
  const launchPlans = useQueries({
    queries: candidateNames.map(name => ({
      ...launchPlanQueryOptions(name),
      enabled: !isDemo,
      retry: false,
      staleTime: 0,
    })),
  })
  const plans = launchPlans.map(query => query.data ?? null)
  const cost = exactVerificationCost({ isDemo, plans })
  // #2288.4 (c66, 18/09 suite) — les TROIS sources publiques (France Travail,
  // BOAMP, DECP) viennent désormais du LANCEUR, entreprise par entreprise :
  // France Travail se nomme dès qu'un lancement sera RÉEL, jamais quand tous
  // les candidats seront simplement rouverts.
  const publicSources = announcedPublicSources({ planSources: estimate?.publicSources ?? [], plans })
  // Aucun lancement sans coût ANNONCÉ : un devis dont le prix n'a pas pu être
  // lu ne propose pas d'avancer « au cas où ».
  const canLaunch = estimate !== null && estimate.candidates > 0 && !gate.locked && cost.measured

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={tCommon('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('reverseMarket.verification.plan.title')}</DialogTitle>
          <DialogDescription>{t('reverseMarket.verification.plan.subtitle')}</DialogDescription>
        </DialogHeader>

        {plan.isFetching && estimate === null ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.verification.plan.loading')}
          </Text>
        ) : plan.isError || estimate === null ? (
          // JAMAIS un repli deviné : sans plan lisible, on ne propose pas un
          // prix « probable », on dit que le devis n'a pas pu être établi.
          <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
            {t('reverseMarket.verification.plan.unavailable')}
          </Text>
        ) : (
          <Box className="flex flex-col gap-2" data-testid="verification-plan">
            <PlanLine
              label={t('reverseMarket.verification.plan.candidates')}
              value={t('reverseMarket.verification.plan.candidatesValue', { count: estimate.candidates })}
            />
            <PlanLine
              label={t('reverseMarket.verification.plan.sources')}
              value={estimate.sources.map(source => t(`reverseMarket.verification.sourceNature.${source}`)).join(' · ')}
            />
            {/* c66 — les sources PUBLIQUES prévues se nomment (jamais un
                fournisseur payant, GA-44) ; absente quand aucune n'est prévue. */}
            {publicSources.sources.length > 0 ? (
              <PlanLine
                label={t('reverseMarket.verification.plan.publicSources')}
                value={[...new Set(publicSources.sources.map(id => dataSourceLabel(tCommon, id)))].join(' · ')}
              />
            ) : null}
            {/* #2288.4 — les marchés publics ne valent que pour les lancements
                dont la gate est connue : le devis dit pour combien. */}
            {publicSources.tenders && publicSources.tenders.shown < publicSources.tenders.launched ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('reverseMarket.verification.plan.publicTendersScope', {
                  shown: publicSources.tenders.shown,
                  total: publicSources.tenders.launched,
                })}
              </Text>
            ) : null}
            {/* GA-18/GA-19 — un coût qu'on n'a pas su lire se NOMME, il ne
                s'affiche pas « 0 crédit », qui se lirait « c'est gratuit ». */}
            {cost.measured ? (
              <>
                {cost.demo ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('reverseMarket.verification.plan.costDemo')}
                  </Text>
                ) : null}
                {cost.reopened > 0 ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('reverseMarket.verification.plan.reopened', { count: cost.reopened })}
                  </Text>
                ) : null}
              </>
            ) : null}
            <PlanLine
              label={t('reverseMarket.verification.plan.duration')}
              value={t('reverseMarket.verification.plan.durationValue', {
                min: estimate.durationMinutes.min,
                max: estimate.durationMinutes.max,
              })}
            />
            <PlanLine
              label={t('reverseMarket.verification.plan.adds')}
              value={estimate.adds.map(output => t(`reverseMarket.verification.output.${output}`)).join(' · ')}
            />

            {/* La CONSERVATION, dite à l'endroit où elle change le prix : ce
                qui est déjà vérifié ne repasse pas à la caisse. */}
            {estimate.kept > 0 ? (
              <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                {t('reverseMarket.verification.plan.kept', { count: estimate.kept })}
                {/* GA-66 — un total de coût dit qu'il est un PLANCHER : les
                    lignes dont le coût n'est pas connu sont COMPTÉES, jamais
                    additionnées comme des zéros. */}
                {estimate.keptWithoutKnownCost > 0
                  ? ` ${t('reverseMarket.verification.plan.keptFloor', { count: estimate.keptWithoutKnownCost })}`
                  : ''}
              </Text>
            ) : null}

            {gate.locked ? (
              <Text size="xs" role="note" className="text-[var(--warning-soft-text)]">
                {t('reverseMarket.verification.plan.locked')}
              </Text>
            ) : null}
          </Box>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            variant="black"
            size="sm"
            icon={ShieldCheck}
            disabled={!canLaunch}
            title={gate.locked ? t('reverseMarket.verification.plan.locked') : undefined}
            onClick={onConfirm}
          >
            {t('reverseMarket.verification.plan.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <Box className="flex items-baseline justify-between gap-3">
      <Text size="sm" className="shrink-0 text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm" weight="medium" className="min-w-0 text-right">
        {value}
      </Text>
    </Box>
  )
}
