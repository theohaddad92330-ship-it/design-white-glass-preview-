import type { Account } from '@bellum/contracts'
import { parseIdentityMismatchMessage } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { AlertTriangle, Briefcase, RotateCcw, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AnalysisProgressCard } from '@/components/analysis/AnalysisProgressCard'
import { OperationStatusBadge } from '@/components/operations/OperationStatusBadge'
import { useAccountRelaunch } from '@/features/accounts/hooks/useAccountRelaunch'
import { useFailedAnalysisPhases } from '@/features/accounts/hooks/useFailedAnalysisPhases'
import { useResumeAnalysis } from '@/features/accounts/hooks/useResumeAnalysis'
import { ANALYSIS_PHASES, phaseLabel } from '@/lib/analysis-subscription'
import { analysisOperationStatus, type OperationStatus } from '@/lib/operation-status'

/** #2164.16 — position de course, transmise seulement quand un run est en
 *  cours sur CE compte (`null` au repos). `AccountDetail` la calcule (source
 *  déjà unique : `useAnalysisProgress` + `useCancelAnalysis`) ; cette bannière
 *  ne fait que la rendre, elle n'a pas à décider si un run tourne. */
interface AnalyzingBannerProps {
  phase: string
  onCancel: () => void
}

/** Sentinel value written by ``AccountsService.markCancelled`` — keep in
 *  sync with ``ANALYSIS_CANCELLED_MESSAGE`` on the API side. Used here to
 *  branch the error banner into a softer "annulée" variant. */
const ANALYSIS_CANCELLED_MESSAGE = "Analyse annulée par l'utilisateur."

/** Sentinel written by the API's ``StuckAnalysisReaper`` / ``getStatus`` self-heal
 *  when a run was interrupted (worker died mid-run) — keep in sync with
 *  ``ANALYSIS_INTERRUPTED_MESSAGE`` on the API side. Matched here so the banner
 *  shows a LOCALIZED "interrompue, relancez" message (FR/EN) instead of the raw
 *  French sentinel from the DB. */
const ANALYSIS_INTERRUPTED_MESSAGE = 'Analyse interrompue (délai dépassé). Relancez-la.'

interface AccountDetailStatusBannersProps {
  account: Account
  /** #2164.16 — présent seulement quand `account.status === 'analyzing'` ET
   *  que l'appelant a choisi de rendre le dossier existant plutôt que de
   *  bloquer l'écran (voir `hasReadableDossierWhileAnalyzing`, AccountDetail.tsx). */
  analyzing?: AnalyzingBannerProps | null
}

export function AccountDetailStatusBanners({ account, analyzing = null }: AccountDetailStatusBannersProps) {
  const { t } = useTranslation('accounts')
  const resume = useResumeAnalysis()
  const { relaunch } = useAccountRelaunch(account)
  // #2478 — appelé avant tout retour conditionnel (règle des hooks) ; n'émet
  // une requête que sur un compte réellement en erreur.
  const completedPhases = useFailedAnalysisPhases(account.id, account.status === 'error')

  // #2164.16 — LE DOSSIER RESTE VISIBLE PENDANT UNE ACTUALISATION.
  // `AnalysisProgressCard` porte depuis longtemps un variant `embed` prévu pour
  // cet emplacement précis ; rien ne l'appelait en production. Rendue AVANT le
  // `prospect`/`error` ci-dessous : un compte ne peut être `analyzing` ET
  // `prospect`/`error` à la fois (`account.status` est une valeur unique), donc
  // l'ordre ne masque jamais l'un des deux.
  if (analyzing) {
    return (
      <AnalysisProgressCard
        companyName={account.company_name || ''}
        phase={analyzing.phase}
        accountId={account.id}
        onCancel={analyzing.onCancel}
        variant="embed"
      />
    )
  }

  // Compte ajouté au portefeuille depuis Découvrir, jamais analysé : les onglets
  // sont vides par la VÉRITÉ (aucun run n'a eu lieu), pas par un bug. On le dit,
  // et on offre le seul geste qui remplit le dossier.
  if (account.status === 'prospect') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3">
        <Briefcase className="h-4 w-4 text-[var(--bellum-text-muted)] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
            {t('statusBanner.prospectTitle')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('statusBanner.prospectMessage')}
          </Text>
        </div>
        <Button variant="outline" size="sm" icon={Sparkles} onClick={relaunch} className="shrink-0">
          {t('statusBanner.prospectCta')}
        </Button>
      </div>
    )
  }

  if (account.status !== 'error') return null

  // Soften the banner for the two RECOVERABLE, non-failure cases — the user
  // cancelled themselves, or the run was interrupted (worker died mid-run) — with
  // neutral copy + the muted "ghost" color scheme instead of the red "error" one.
  // Both map their sentinel to LOCALIZED copy so an EN user never sees the raw
  // French DB string.
  const wasCancelled = account.error_message === ANALYSIS_CANCELLED_MESSAGE
  const wasInterrupted = account.error_message === ANALYSIS_INTERRUPTED_MESSAGE
  // GA-96 — le rafraîchissement a été REFUSÉ parce que la résolution a rendu une
  // autre société que celle du dossier. Ce n'est pas une panne : c'est le
  // produit qui a tenu sa promesse (« sur CE dossier »), et le dossier est
  // intact. La copie doit donc dire ce qui a été PROTÉGÉ, pas s'excuser d'un
  // échec — et nommer les deux identités, sans quoi l'utilisateur ne peut pas
  // décider de la suite.
  //
  // Le format du message est lu par le contrat partagé, pas par une phrase
  // française recopiée ici : c'est ce qui permet de le traduire (FR + EN) sans
  // casser la reconnaissance — le défaut des deux sentinelles au-dessus.
  const identityMismatch = parseIdentityMismatchMessage(account.error_message)
  const soft = wasCancelled || wasInterrupted || identityMismatch != null
  const title = wasCancelled
    ? t('statusBanner.cancelledTitle')
    : wasInterrupted
      ? t('statusBanner.interruptedTitle')
      : identityMismatch
        ? t('statusBanner.identityMismatchTitle')
        : t('statusBanner.failedTitle')
  // Known sentinels resolve to their localized copy; an unknown error keeps its
  // raw DB message (falling back to the generic failure copy when it's empty).
  const message = wasCancelled
    ? t('statusBanner.cancelledMessage')
    : wasInterrupted
      ? t('statusBanner.interruptedMessage')
      : identityMismatch
        ? t('statusBanner.identityMismatchMessage', {
            expected: identityMismatch.expected,
            resolved: identityMismatch.resolved,
          })
        : account.error_message || t('statusBanner.failedMessage')
  const borderColor = soft ? 'border-[var(--bellum-border)]' : 'border-[var(--bellum-danger)]'
  const bgColor = soft ? 'bg-[var(--bellum-surface-1)]' : 'bg-[var(--bellum-bg-lighter)]'
  const iconColor = soft ? 'text-[var(--bellum-text-muted)]' : 'text-[var(--danger-soft-text)]'
  const titleColor = soft ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--danger-soft-text)]'
  // #4295.1 — l'état d'une analyse ARRÊTÉE se dit en un mot : « Partielle » quand des phases ont abouti
  // (`completedPhases` non vide), « Interrompue » sinon. Une annulation voulue n'est pas un arrêt subi : aucun mot.
  const stopStatus: OperationStatus | null = wasCancelled
    ? null
    : completedPhases && completedPhases.length > 0
      ? 'partial'
      : analysisOperationStatus({ state: 'error', warnings: [] })
  const buttonClass = soft ? 'shrink-0' : 'shrink-0 border-[var(--bellum-danger)] text-[var(--danger-soft-text)]'

  return (
    <div className={`flex items-start gap-3 rounded-xl border ${borderColor} ${bgColor} px-4 py-3`}>
      <AlertTriangle className={`h-4 w-4 ${iconColor} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" weight="medium" className={titleColor}>
            {title}
          </Text>
          {stopStatus ? <OperationStatusBadge status={stopStatus} /> : null}
        </div>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {message}
        </Text>
        {/*
          #2478 — « les analyses échouent presque à chaque fois et en plus
          c'est faux, une grande partie a fonctionné ». Un « Analyse échouée »
          nu efface le travail des phases déjà checkpointées. `!soft` exclut
          l'annulation utilisateur et le refus d'identité, qui ont déjà leur
          propre récit complet ; `completedPhases` est `null` tant que
          `useFailedAnalysisPhases` n'a pas répondu — on n'affiche RIEN plutôt
          que d'inventer un compte, et un tableau VRAIMENT vide (rien
          checkpointé) n'affiche rien non plus, ce qui est la vérité de ce
          cas-là.
        */}
        {!soft && completedPhases && completedPhases.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('statusBanner.partialDone', {
                phases: completedPhases.map(phase => phaseLabel(phase)).join(', '),
              })}
            </Text>
            {(() => {
              const missing = ANALYSIS_PHASES.filter(phase => !completedPhases.includes(phase))
              return missing.length > 0 ? (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('statusBanner.partialMissing', { phases: missing.map(phase => phaseLabel(phase)).join(', ') })}
                </Text>
              ) : null
            })()}
          </div>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        icon={RotateCcw}
        disabled={resume.isPending}
        onClick={() => resume.mutate(account.id)}
        className={buttonClass}
      >
        {resume.isPending ? t('statusBanner.resuming') : t('statusBanner.resume')}
      </Button>
    </div>
  )
}
