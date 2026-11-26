import type { AnalysisContext, CompanySuggestion } from '@bellum/contracts'
import { companyNameRejection } from '@bellum/contracts'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input, Text, cn } from '@bellum/ui'
import {
  overlayBodyClassName,
  overlayDescriptionClassName,
  overlayDialogClassName,
  overlayFootClassName,
  overlayHeadClassName,
  overlayTitleClassName,
} from '@/components/layout/overlay'
import { AlertTriangle, Sparkles, Target } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCredits } from '@/features/billing/hooks/useCredits'
import { SoftBrake, SoftBrakeContact } from '@/features/credits/components/SoftBrake'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { CompanySearchField } from '@/features/search/components/CompanySearchField'
import { LaunchPlanNote } from '@/features/search/components/LaunchPlanNote'
import { useAnalysis } from '@/features/search/hooks/useAnalysis'
import { useLaunchPlan } from '@/features/search/hooks/useLaunchPlan'
import { analysisStepLabel } from '@/lib/analysis-step-progress'
import { useCompanySearch } from '@/features/search/hooks/useCompanySearch'
import { useSearchCountry } from '@/features/search/hooks/useSearchCountry'
import type { LaunchSurfaceProps } from './launch-surfaces'
import { isEsnProfileIncomplete, summarizeEsnFocus, type EsnFocusSummary } from './lib/esn-focus'

/**
 * Le lancement d'une analyse EN PLACE, depuis la liste des comptes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT CORRIGE (demande de Louis, 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * « dans la page compte, il faut un bouton lancer une analyse / ajouter un
 * compte qui permet de la lancer comme depuis Laura mais de manière plus
 * directe ».
 *
 * Mesuré : sur une liste de comptes NON VIDE, il n'existait AUCUN moyen de
 * lancer une analyse. La barre d'outils portait trois contrôles — recherche,
 * filtre, bascule de panneau — et rien d'autre. Les deux seules portes étaient
 * des états VIDES (`AccountsEmpty`, « aucun résultat »), c'est-à-dire
 * exactement les écrans qu'un utilisateur qui a déjà des comptes ne voit
 * jamais. Le geste fondateur du produit n'avait pas de porte sur l'écran qui
 * liste ce qu'il produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE RECODE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Rien du parcours. `useAnalysis` (le lancement, l'abonnement temps réel, la
 * reprise d'un run déjà en vol, le rejeu de démonstration), `useCompanySearch`
 * (l'autocomplétion registre, la requête élargie, la source muette),
 * `CompanySearchField` (la liste, les ensembles d'homonymes) et
 * `LaunchPlanNote` (le prix, le solde, le lien de recharge) existaient et sont
 * MONTÉS ici. Deux chemins qui lancent la même analyse divergeraient — c'est
 * précisément le défaut du 04/08, où un écran annonçait 1 crédit et 8
 * partaient.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LE BOUTON EXIGE UNE ENTREPRISE IDENTIFIÉE
 * ─────────────────────────────────────────────────────────────────────────
 * « Direct » ne veut pas dire « devine ». Le registre rend plusieurs sociétés
 * pour un même nom — « SG » en rend une centaine — et lancer sur le nom nu
 * laisserait le serveur choisir à la place de l'utilisateur. Une analyse à
 * huit crédits sur le mauvais homonyme n'est pas une erreur d'affichage, c'est
 * un dossier faux payé plein tarif.
 *
 * Le bouton ne s'active donc qu'une fois une entité CHOISIE dans la liste,
 * avec son identifiant de registre. Ce n'est pas une restriction par rapport à
 * `/search` : c'est la raison pour laquelle ce raccourci peut se permettre
 * d'être court. Le cas « le registre ne connaît pas ce nom » (une marque, un
 * marché étranger sans source de suggestions) reste servi par l'écran complet,
 * vers lequel ce panneau renvoie explicitement — voir `launch-surfaces.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI LE HOOK VIT ICI ET NON DANS LE CONTENU DU DIALOGUE
 * ─────────────────────────────────────────────────────────────────────────
 * `useAnalysis` détient l'abonnement Socket.IO ET, en démonstration, les
 * minuteurs de `playDemoAnalysis` — son effet de nettoyage les DÉSARME au
 * démontage. Ce composant est donc monté en permanence par `ListLauncher`
 * (il ne l'est pas « quand le dialogue est ouvert »), et c'est `<Dialog>` qui
 * monte et démonte son seul contenu. Refermer le panneau pendant un run ne
 * coupe donc ni la progression réelle ni la progression scriptée.
 */
export function AccountLaunchSurface({ open, onOpenChange }: LaunchSurfaceProps) {
  const { t } = useTranslation('launcher')
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  /**
   * L'entité RÉELLEMENT choisie dans la liste — le verrou d'homonymie. Éditer
   * le champ l'efface : on ne cible plus cette société, et garder son SIREN
   * ferait partir le run sur une entreprise que l'utilisateur ne regarde plus.
   */
  const [scopedEntity, setScopedEntity] = useState<CompanySuggestion | null>(null)
  // #1584 — « Modifier le focus » : UN champ facultatif, jamais un formulaire.
  // Purgé dès que le nom édité change (voir `handleQueryChange`) : un objectif
  // tapé pour TF1 ne doit pas partir avec une analyse BNP.
  const [focusOpen, setFocusOpen] = useState(false)
  const [objective, setObjective] = useState('')

  const { country, setCountry } = useSearchCountry()
  const {
    suggestions,
    broadenedFrom,
    sourceUnavailable,
    loading: suggestionsLoading,
    search,
    clearSuggestions,
  } = useCompanySearch(country)

  // #1584 — le PROFIL ESN RÉEL qui alimente « Ce que Bellum va chercher pour
  // toi », et son incomplétude (même grille que l'onboarding — jamais une
  // seconde règle de complétude qui pourrait diverger).
  const { data: esnAnswers } = useEsnProfile()
  const focus = summarizeEsnFocus(esnAnswers)
  const profileIncomplete = isEsnProfileIncomplete(esnAnswers)

  // Ouvrir un dossier existant — chemin UNIQUE, monté à la fois sur la fin
  // d'un run réel (`onComplete`) et sur « Ouvrir le dossier » du cache-hit
  // annoncé AVANT le clic (#1583, CAS 2).
  const openAccount = useCallback(
    (id: string) => {
      onOpenChange(false)
      void navigate({ to: '/accounts/$id', params: { id } })
    },
    [navigate, onOpenChange],
  )
  const { status, phase, currentStep, error, startAnalysis } = useAnalysis({
    // Le dossier s'ouvre à la fin du run — même sortie que l'écran complet, et
    // c'est la seule : la navigation pend à l'état `completed` du store, que la
    // diffusion temps réel ET la relecture d'état font converger.
    onComplete: openAccount,
  })

  const gate = useCreditGate()
  const isAnalyzing = status === 'starting' || status === 'analyzing'
  const trimmed = query.trim()
  // Ce champ acceptait n'importe quelle chaîne : une analyse complète a tourné
  // en production sur « Que penses-tu de Saint-Gobain ? » — huit crédits, aucun
  // fait sourcé. Le refus se dit ICI, avant le clic, plutôt qu'en 400 après.
  const nameRejection = trimmed.length > 0 ? companyNameRejection(query) : null
  // Le verrou ne vaut que s'il désigne encore ce qui est écrit dans le champ.
  const identified = scopedEntity && scopedEntity.name === trimmed ? scopedEntity : null
  const canLaunch = Boolean(identified) && !nameRejection && !isAnalyzing && gate.canAnalyze
  // Ancre le run sur le SIREN choisi quand c'en est un — une suggestion
  // étrangère n'en porte pas (son identifiant national voyage autrement).
  // Lu par le lancement ET par `LaunchPlanNote` (#1583) : une seule dérivation,
  // jamais deux qui pourraient annoncer une société et en analyser une autre.
  const identifiedSiren = identified && /^\d{9}$/.test(identified.siren) ? identified.siren : undefined
  const { credits } = useCredits()
  const { plan } = useLaunchPlan({
    companyName: query,
    siren: identifiedSiren,
    scopeMode: 'groupe',
    enabled: credits?.is_demo !== true,
  })

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      // Le verrou suit le champ — sauf si on retape exactement le nom choisi.
      setScopedEntity(previous => (previous && previous.name === value ? previous : null))
      setShowDropdown(value.trim().length >= 2)
      // #1584 — un objectif tapé pour une entreprise ne doit pas suivre une
      // autre société qu'on se met à taper à la place.
      setFocusOpen(false)
      setObjective('')
      // ⚠️ C'est CETTE ligne qui interroge le registre. Sans elle, le champ se
      // remplissait et la liste restait vide pour toujours : `useCompanySearch`
      // détient sa propre requête, et la frappe ne l'atteint que par `search`.
      // Les tests ne l'ont pas vu — ils simulent le hook, donc les suggestions
      // arrivaient sans qu'on les demande. C'est le lint qui l'a dit, en
      // signalant une liaison déstructurée jamais appelée.
      search(value)
    },
    [search],
  )

  const handleSelectSuggestion = useCallback(
    (suggestion: CompanySuggestion) => {
      setQuery(suggestion.name)
      setScopedEntity(suggestion)
      setShowDropdown(false)
      clearSuggestions()
    },
    [clearSuggestions],
  )

  const handleConfirm = useCallback(
    // `relaunch` reste `undefined` sur le chemin normal — comme avant #1583 —
    // et ne vaut `true` que sur « Actualiser l'analyse » (#1583, CAS 2) :
    // passer `false` explicitement changerait la forme de la requête envoyée
    // au serveur pour un premier lancement.
    (relaunch?: boolean) => {
      if (!identified) return
      // #1584 — un objectif facultatif écrit dans le champ « Un objectif
      // particulier ? » ; vide par défaut ⇒ `user_context` reste `undefined`,
      // comportement inchangé.
      const userContext: AnalysisContext | undefined = objective.trim()
        ? { preset: 'free', notes: objective.trim() }
        : undefined
      // Périmètre `groupe` : le défaut du catalogue, et celui que `LaunchPlanNote`
      // chiffre juste au-dessus. Les six périmètres restent sur l'écran complet —
      // c'est ce qui fait de ce panneau un raccourci et non un second formulaire.
      //
      // ⚠️ `relaunch` n'est ajouté aux arguments QUE lorsqu'il vaut `true` — un
      // `undefined` explicite change le NOMBRE d'arguments reçus par
      // `startAnalysis` par rapport à un appel qui l'omet, et changerait donc
      // la requête envoyée pour un premier lancement.
      if (relaunch) {
        startAnalysis(identified.name, userContext, identifiedSiren, 'groupe', undefined, country, true)
      } else {
        startAnalysis(identified.name, userContext, identifiedSiren, 'groupe', undefined, country)
      }
    },
    [identified, identifiedSiren, objective, startAnalysis, country],
  )

  // #1583, CAS 2 — « Actualiser l'analyse » cliqué depuis la note de coût :
  // même geste que « Analyser », marqué relance.
  const handleRefreshExisting = useCallback(() => handleConfirm(true), [handleConfirm])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Théo `dialog` : tête à filet, corps, pied collant aux gestes alignés à droite. */}
      <DialogContent
        closeLabel={t('common:actions.close')}
        className={cn('flex max-w-lg flex-col', overlayDialogClassName)}
      >
        <div className={cn(overlayHeadClassName, 'flex-col items-start gap-1')}>
          <DialogTitle className={overlayTitleClassName}>{t('run.accountAnalysis')}</DialogTitle>
          <DialogDescription className={overlayDescriptionClassName}>
            {t('direct.account.description')}
          </DialogDescription>
        </div>

        {isAnalyzing ? (
          <div className={cn(overlayBodyClassName, 'space-y-2')}>
            <Text size="sm">{t('direct.account.running', { company: trimmed })}</Text>
            {/* #3666 (Louis 13/10, « étapes, pas de % ») — l'étape MESURÉE du job ;
                inconnue, « en cours » SANS chiffre : jamais un pourcentage. */}
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {analysisStepLabel(currentStep) ?? t('direct.account.runningStepUnknown')}
              {phase ? ` · ${phase}` : ''}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('direct.account.runningHint')}
            </Text>
          </div>
        ) : (
          <div className={cn(overlayBodyClassName, 'space-y-3')}>
            <CompanySearchField
              query={query}
              onQueryChange={handleQueryChange}
              onSelectSuggestion={handleSelectSuggestion}
              onShowDropdown={setShowDropdown}
              onSubmit={() => handleConfirm()}
              showDropdown={showDropdown}
              suggestions={suggestions}
              suggestionsLoading={suggestionsLoading}
              broadenedFrom={broadenedFrom}
              sourceUnavailable={sourceUnavailable}
              country={country}
              onCountryChange={setCountry}
            />

            {identified ? (
              <div className="flex items-center gap-2 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
                <Target className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
                <Text size="xs" className="min-w-0 flex-1">
                  {[identified.name, identified.city, identified.siren].filter(Boolean).join(' · ')}
                </Text>
              </div>
            ) : (
              /* L'homonymie ne se saute pas : tant qu'aucune société n'est
                 choisie, le bouton reste inactif et la phrase dit POURQUOI —
                 plutôt qu'un bouton gris qu'on croit cassé. */
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('direct.account.identify')}
              </Text>
            )}

            {/* #1584 — cadrage express : une fois l'entreprise choisie, ce
                que Bellum va chercher, tiré du PROFIL ESN RÉEL — jamais un
                second formulaire. Pour un autre périmètre, une filiale, des
                exclusions, le renvoi vers l'analyse complète plus bas reste
                la seule porte. */}
            {identified ? (
              <EsnFocusPanel
                focus={focus}
                profileIncomplete={profileIncomplete}
                focusOpen={focusOpen}
                onToggleFocus={() => setFocusOpen(open => !open)}
                objective={objective}
                onObjectiveChange={setObjective}
              />
            ) : null}

            {nameRejection ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {nameRejection}
              </Text>
            ) : null}

            {/* #4463 — plus de coût annoncé : la note dit seulement qu'un dossier
                existe déjà, ou (solde épuisé) porte le frein doux. */}
            <LaunchPlanNote plan={plan} onOpenExisting={openAccount} onRefreshExisting={handleRefreshExisting} />
            {gate.known && !gate.canAnalyze && !gate.locked ? <SoftBrake /> : null}
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('direct.beforeConfirm')}
            </Text>

            {/* Le solde ferme la porte AVANT le clic. `useCreditGate` laisse
                ouvert tant qu'il ne SAIT pas : un solde qu'on n'a pas pu lire
                n'est pas un solde vide, et c'est le serveur qui tranche. */}
            {gate.known && gate.locked ? (
              <Text size="xs" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--danger-soft-text)]">
                {t('direct.locked')}
                {/* #4464.2 — un accès fermé garde un moyen de joindre l'équipe. */}
                <SoftBrakeContact />
              </Text>
            ) : null}

            {/* La porte de sortie vers l'écran complet : une marque absente du
                registre, un marché étranger sans source, un autre périmètre
                géographique, une filiale, des exclusions. Ce panneau est un
                raccourci — il n'a jamais prétendu remplacer `/search`. */}
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              <Link
                to="/search"
                search={trimmed ? { company: trimmed } : {}}
                className="text-[var(--bellum-text-accent)] underline underline-offset-2"
                onClick={() => onOpenChange(false)}
              >
                {t('direct.account.fullSearch')}
              </Link>
            </Text>

            {error ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {error}
              </Text>
            ) : null}
          </div>
        )}
        {isAnalyzing ? null : (
          <div className={overlayFootClassName}>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('direct.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={!canLaunch} onClick={() => handleConfirm()}>
              {t('direct.account.confirm')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * #1584 — « Ce que Bellum va chercher pour toi », compact et non
 * modifiable au-delà d'UN champ facultatif. Chaque ligne du profil ne se
 * rend QUE si l'ESN a répondu à la question correspondante — une liste vide
 * ne se remplit jamais de zéros ni de texte de remplissage.
 */
function EsnFocusPanel({
  focus,
  profileIncomplete,
  focusOpen,
  onToggleFocus,
  objective,
  onObjectiveChange,
}: {
  focus: EsnFocusSummary
  profileIncomplete: boolean
  focusOpen: boolean
  onToggleFocus: () => void
  objective: string
  onObjectiveChange: (value: string) => void
}) {
  const { t } = useTranslation('launcher')
  const rows: { key: string; labelKey: string; items: string[] }[] = [
    { key: 'expertise', labelKey: 'direct.account.focusExpertise', items: focus.expertise },
    { key: 'territory', labelKey: 'direct.account.focusTerritory', items: focus.territory },
    { key: 'accountTypes', labelKey: 'direct.account.focusAccountTypes', items: focus.accountTypes },
    { key: 'priority', labelKey: 'direct.account.focusPriority', items: focus.priority },
  ].filter(row => row.items.length > 0)

  return (
    <div className="flex flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text size="xs" weight="medium">
          {t('direct.account.focusTitle')}
        </Text>
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {rows.map(row => (
            <li key={row.key}>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t(row.labelKey, { items: row.items.join(' · ') })}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}

      {profileIncomplete ? (
        <div className="flex items-start gap-2 rounded-control border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-2 py-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text size="xs" className="text-[var(--warning-soft-text)]">
              {t('direct.account.profileIncomplete')}
            </Text>
            <Link
              to="/settings/profile"
              className="w-fit text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
            >
              {t('direct.account.completeProfile')}
            </Link>
          </div>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={onToggleFocus}
          aria-expanded={focusOpen}
          className="inline-flex min-h-6 items-center text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {t('direct.account.editFocus')}
        </button>
      </div>

      {focusOpen ? (
        <div className="flex flex-col gap-1">
          <Text
            element="label"
            htmlFor="account-launch-objective"
            size="xs"
            color="text-[var(--bellum-text-secondary)]"
          >
            {t('direct.account.objectiveLabel')}
          </Text>
          <Input
            id="account-launch-objective"
            value={objective}
            onChange={e => onObjectiveChange(e.target.value)}
            placeholder={t('direct.account.objectivePlaceholder')}
            className="h-8 bg-transparent text-sm"
          />
        </div>
      ) : null}
    </div>
  )
}
