import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { AnalysisBatch, AnalysisBatchInput, AnalysisBatchSource } from '@bellum/contracts'
import { toast } from 'sonner'
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
import { apiFetch } from '@/lib/api'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { SoftBrake } from '@/features/credits/components/SoftBrake'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { launchPlanQueryOptions } from '@/features/search/hooks/useLaunchPlan'
import { exactBatchAnalysisCost } from '@/features/discover/lib/discover-batch-analyze-cost'
import {
  buildBatchAnalyzeRequest,
  searchedZoneLabel,
  withoutSearchedZone,
} from '@/features/discover/lib/discover-batch-analyze'
import { discoverOriginCriteriaFor, type UnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { ActionPreview } from '@/components/ActionPreview'

/* ------------------------------------------------------------------ */
/*  #2166.56 — lancer une analyse de LOT depuis Découvrir.              */
/*                                                                     */
/*  ⚠️ ACTE PAYANT EN LOT — DÉCISION Louis 17/09 midi (QCM Découvrir) :  */
/*  « un clic, coût total annoncé, N jobs en file, progression suivie ; */
/*  rien ne part sans ce clic. »                                        */
/*                                                                     */
/*  LE COÛT ANNONCÉ EST LE COÛT DÉBITÉ (correctif 18/09 soir, suite de  */
/*  #2166.56, même règle que #2288.4) : ce n'est plus « N × prix de     */
/*  grille » (`batchAnalysisCost`, retiré) mais la somme, candidat par   */
/*  candidat, de `GET /analysis/launch-plan` (`launchPlanQueryOptions`, */
/*  PARTAGÉ avec le lanceur de `/search` — GA-26, même clé, même cache). */
/*  Un candidat DÉJÀ analysé dans l'espace est rouvert SANS débit — le   */
/*  devis le compte et le dit plutôt que d'annoncer 8 crédits pour 0     */
/*  débités. Voir `discover-batch-analyze-cost.ts`.                     */
/*                                                                     */
/*  Le solde vient de `useCreditGate`, LE MÊME hook que `/search` —     */
/*  deux lectures du même chiffre divergeraient sinon. Deux règles       */
/*  héritées du gate, jamais réécrites ici : le DOUTE n'interdit pas     */
/*  (solde inconnu → geste cliquable, le serveur tranchera) et la        */
/*  fenêtre EXPIRÉE bloque tout.                                        */
/*                                                                     */
/*  La PROGRESSION n'est pas une nouvelle jauge à construire : chaque   */
/*  analyse lancée est un job identique à celui d'une analyse simple    */
/*  depuis /search, et sa progression se lit déjà sur la fiche du       */
/*  compte — même chemin, réutilisé, pas dupliqué (GA-26).              */
/* ------------------------------------------------------------------ */

interface AnalyzeSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: DiscoverCandidate[]
  /** Appelé une fois le lot déposé — le caller vide sa sélection. */
  onDone: () => void
  /**
   * #2293.3 — la source réelle du lot, telle que `POST /analysis-batches` la
   * journalise. `'saved_search'` quand la sélection vient d'une recherche
   * enregistrée rejouée (`Discover.tsx`, `appliedSavedSearchId`), `'discover'`
   * sinon — jamais devinée ici, toujours fournie par l'appelant qui seul sait
   * d'où vient la liste.
   */
  source: AnalysisBatchSource
  /** #3819 (lot RBB) — les filtres posés : leurs critères satisfaits suivent chaque compte. */
  searchCriteria?: UnifiedFilters
}

export function AnalyzeSelectionDialog({
  open,
  onOpenChange,
  candidates,
  onDone,
  source,
  searchCriteria,
}: AnalyzeSelectionDialogProps) {
  const { t } = useTranslation('discover')
  const gate = useCreditGate()
  const [pending, setPending] = useState(false)

  const count = candidates.length

  // #2166.56 (18/09 soir) — le coût EXACT, candidat par candidat, tel que le
  // LANCEUR le débitera : `GET /analysis/launch-plan`, même route et même
  // clé de cache que `/search`. Coupée en démo — cet espace ne débite jamais
  // rien, et on ne l'interroge même pas (aucun appel réseau inventé).
  const isDemo = useIsDemo()
  const launchPlans = useQueries({
    queries: candidates.map(candidate => ({
      ...launchPlanQueryOptions(candidate.name, candidate.siren),
      enabled: open && !isDemo,
      retry: false,
      staleTime: 0,
    })),
  })
  const cost = exactBatchAnalysisCost({ isDemo, plans: launchPlans.map(query => query.data ?? null) })

  // Le doute n'interdit pas (GA-26, `useCreditGate`) : un solde non chargé
  // laisse le geste cliquable, c'est le serveur qui tranche. Mais un coût NON
  // MESURÉ, lui, bloque : un devis dont le prix n'a pas pu être lu ne propose
  // pas d'avancer « au cas où ».
  // #4464 — solde épuisé : frein doux (aucun chiffre), l'API reste seule juge du montant.
  const insufficientCredits = gate.known && !gate.canAnalyze && !gate.locked
  const canSubmit = count > 0 && !gate.locked && cost.measured && !insufficientCredits && !pending

  const navigate = useNavigate()
  // #4432.3 — la zone cherchée devient le PÉRIMÈTRE du dossier (côté serveur,
  // `geoScopeFromOriginCriteria`) : dite ici avant le lancement, et « Élargir à la France » la retire.
  const [nationwide, setNationwide] = useState(false)
  const criteriaFor = (candidate: DiscoverCandidate) => {
    const criteria = searchCriteria ? discoverOriginCriteriaFor(candidate, searchCriteria) : undefined
    return nationwide ? withoutSearchedZone(criteria) : criteria
  }
  const searchedZone = searchCriteria
    ? candidates.map(candidate => searchedZoneLabel(discoverOriginCriteriaFor(candidate, searchCriteria))).find(Boolean)
    : undefined

  /**
   * #2293.5 — UN geste, UN lot : un parent et un sous-job par candidat
   * (`POST /analysis-batches`), au lieu de N lancements un par un depuis le
   * navigateur. Le serveur lance chaque sous-job par le chemin de l'analyse
   * unitaire (même débit, même remboursement) et une entreprise en échec ne
   * bloque pas les autres (#2293.7) ; la progression se suit sur la page du lot.
   */
  const submit = async () => {
    if (!canSubmit) return
    setPending(true)
    try {
      const items: AnalysisBatchInput[] = candidates.map(candidate => {
        const request = buildBatchAnalyzeRequest(candidate, criteriaFor(candidate))
        return {
          name: request.company_name,
          siren: request.siren,
          suggestion_id: request.suggestion_id,
          ...(request.suggestion_reason ? { suggestion_reason: request.suggestion_reason } : {}),
          ...(request.suggestion_criteria ? { suggestion_criteria: request.suggestion_criteria } : {}),
        }
      })
      const batch = await apiFetch<AnalysisBatch, { source: AnalysisBatchSource; items: AnalysisBatchInput[] }>({
        path: '/analysis-batches',
        method: 'POST',
        body: { source, items },
      })
      toast.success(t('analyzeDialog.success', { count }))
      onDone()
      onOpenChange(false)
      if (batch?.id) void navigate({ to: '/discover/lots/$batchId', params: { batchId: batch.id } })
    } catch {
      toast.error(t('analyzeDialog.failed', { count }))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('analyzeDialog.cancel')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('analyzeDialog.title')}</DialogTitle>
          {/* Le coût CHIFFRÉ vit désormais dans `<ActionPreview>` plus bas — une
              seule porte d'annonce (GA-86), pour ne pas répéter le même chiffre
              dans deux nœuds de texte distincts. */}
          <DialogDescription>{t('analyzeDialog.previewTitle')}</DialogDescription>
        </DialogHeader>

        <Box display="flex" className="max-h-40 flex-col gap-1 overflow-y-auto">
          {candidates.map(candidate => (
            <Text key={candidate.siren} size="sm">
              {candidate.name}
            </Text>
          ))}
        </Box>

        {searchedZone && (
          <Box display="flex" className="flex-wrap items-center justify-between gap-2">
            <Text size="sm">
              {t('analyzeDialog.perimeter', { zone: nationwide ? t('analyzeDialog.perimeterFrance') : searchedZone })}
            </Text>
            <Button variant="ghost" className="min-h-11" onClick={() => setNationwide(value => !value)}>
              {nationwide ? t('analyzeDialog.perimeterBack', { zone: searchedZone }) : t('analyzeDialog.widenFrance')}
            </Button>
          </Box>
        )}

        {/* GA-86 — porte d'annonce du coût MONTÉE, pas seulement citée en texte
            libre : `ActionPreview` (extrait de `PendingActions.tsx`, même
            composant que `chat`) rend le coût EXACT (`exactBatchAnalysisCost`,
            jamais un prix de grille recalculé ici) dans une région nommée,
            juste avant le bouton qui lance. Un coût NON MESURÉ se NOMME —
            jamais « 0 crédit », qui se lirait « c'est gratuit » (GA-18/19). */}
        <ActionPreview
          title={t('analyzeDialog.previewTitle')}
          rows={
            cost.measured
              ? [
                  {
                    label: t('analyzeDialog.previewCountLabel'),
                    value: t('analyzeDialog.countAnnounce', { count }),
                  },
                  ...(cost.demo
                    ? [{ label: t('analyzeDialog.previewModeLabel'), value: t('analyzeDialog.costDemo') }]
                    : []),
                  ...(cost.alreadyAnalyzed > 0
                    ? [
                        {
                          label: t('analyzeDialog.alreadyAnalyzedLabel'),
                          value: t('analyzeDialog.alreadyAnalyzed', { count: cost.alreadyAnalyzed }),
                        },
                      ]
                    : []),
                ]
              : [{ label: t('analyzeDialog.previewCountLabel'), value: t('analyzeDialog.costUnmeasured') }]
          }
        />

        {/* `--bellum-text-danger` n'existe pas dans tokens.css — le même rouge
            « texte de refus » que `Search.tsx` (nameRejection) est
            `--danger-soft-text`, déclaré aux deux thèmes. */}
        {gate.locked && (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('analyzeDialog.locked')}
          </Text>
        )}
        {insufficientCredits ? <SoftBrake /> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('analyzeDialog.cancel')}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {t('analyzeDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
