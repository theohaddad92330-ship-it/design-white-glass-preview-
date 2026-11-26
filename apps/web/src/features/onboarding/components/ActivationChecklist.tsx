import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ACTIVATION_STEP_KEYS, type ActivationStepKey, type OnboardingActivation } from '@bellum/contracts'
import { Text, cn } from '@bellum/ui'
import { ArrowRight, Check, ChevronDown, Rocket, X } from 'lucide-react'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useActivation } from '../hooks/useActivation'

/** Collapse preference — purely presentational, so localStorage is enough.
 *  Default: COLLAPSED. The checklist is a nudge, not the dashboard's headline —
 *  it opens on demand, and only an explicit « déployer » ('0') keeps it open. */
const COLLAPSE_STORAGE_KEY = 'bellum_activation_collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function persistCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Storage unavailable (private mode) — the toggle still works in-session.
  }
}

/**
 * #1794.2/.3 — masquage EXPLICITE, distinct du repli. Le repli (ci-dessus) est
 * réversible en un clic et vit tant que l'onboarding n'est pas fini ; masquer
 * est un choix qui ne s'offre qu'une fois toutes les étapes atteintes (#1794.2), et
 * qui doit rester défaisable ailleurs (#1794.3 — Réglages, voir le rapport de
 * livraison : aucun autre endroit dans le périmètre de ce lot n'existe déjà).
 *
 * ⚠️ Ce n'est PAS un second « collapsed » : les deux réglages répondent à des
 * questions différentes (« je veux la voir en grand maintenant » contre
 * « je ne veux plus la voir du tout ») et vivent donc chacun à SA clé, loi 1
 * du tome 7.
 */
const HIDE_STORAGE_KEY = 'bellum_activation_hidden'

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(HIDE_STORAGE_KEY, hidden ? '1' : '0')
  } catch {
    // Storage unavailable (private mode) — masquer reste possible en session,
    // simplement pas mémorisé.
  }
}

/**
 * #1794.3 — à appeler depuis l'endroit qui permettra de « relancer le tuto »
 * une fois qu'il a été masqué (Réglages > Préférences dans ce dépôt — voir le
 * rapport de livraison pour le fichier:ligne exact, hors périmètre de ce lot).
 * Le composant relit `localStorage` à chaque montage : naviguer vers le
 * tableau de bord après cet appel suffit à faire réapparaître la barre, sans
 * toucher à une seule réponse du questionnaire.
 */
export function unhideActivationChecklist(): void {
  persistHidden(false)
}

const STEP_LABEL_KEYS: Record<ActivationStepKey, string> = {
  profile_completed: 'activation.steps.profileCompleted',
  analysis_launched: 'activation.steps.analysisLaunched',
  dossier_viewed: 'activation.steps.dossierViewed',
  contact_enriched: 'activation.steps.contactEnriched',
  message_prepared: 'activation.steps.messagePrepared',
  // #1810 — le 6e jalon : personne n'était explicitement invité à connecter sa
  // messagerie, son agenda ou son CRM. Non bloquant, comme les cinq autres —
  // brancher un outil reste un choix (voir `ActivationService` côté API).
  tool_connected: 'activation.steps.toolConnected',
  // #2077.6 — le 7e : corriger un dossier. Non bloquant lui aussi.
  correction_made: 'activation.steps.correctionMade',
  // #2077.9 — le 8e : inviter un premier collègue. Tri-état (voir `isStepDone`
  // / `isStepApplicable` ci-dessous) : « sans objet » pour qui ne peut pas
  // inviter (rôle ou sièges) ne s'affiche PAS comme une étape à faire.
  colleague_invited: 'activation.steps.colleagueInvited',
}

/**
 * #2077.11 — ce que chaque étape FAIT GAGNER, en une phrase.
 *
 * Le retour était « ne présentez pas ça comme des devoirs administratifs »
 * (#2077.10). Une liste d'impératifs — « complète », « lance », « connecte » —
 * est exactement ça : elle dit ce que le PRODUIT attend de vous, jamais ce que
 * vous y gagnez. Le libellé reste l'action (c'est lui qui dit où l'on va), la
 * phrase qui suit dit pourquoi ça vaut le geste.
 *
 * Elle n'apparaît que sur les étapes RESTANTES : sur une étape faite, le
 * bénéfice est déjà acquis, et le répéter barré serait du bruit.
 */
const STEP_BENEFIT_KEYS: Record<ActivationStepKey, string> = {
  profile_completed: 'activation.benefits.profileCompleted',
  analysis_launched: 'activation.benefits.analysisLaunched',
  dossier_viewed: 'activation.benefits.dossierViewed',
  contact_enriched: 'activation.benefits.contactEnriched',
  message_prepared: 'activation.benefits.messagePrepared',
  tool_connected: 'activation.benefits.toolConnected',
  correction_made: 'activation.benefits.correctionMade',
  colleague_invited: 'activation.benefits.colleagueInvited',
}

/** Where each incomplete step sends the user (the page where it gets done). */
const STEP_TARGETS = {
  // #2077.3 — la validation (D9) se fait sur l'écran d'audit commercial, pas
  // sur le formulaire de profil : c'est là qu'est le bouton « Valider ».
  profile_completed: '/settings/profile/audit',
  analysis_launched: '/search',
  dossier_viewed: '/accounts',
  contact_enriched: '/contacts',
  message_prepared: '/accounts',
  // La seule porte qui nomme les capacités sans jamais nommer un éditeur.
  tool_connected: '/integrations',
  // #2077.6 — on corrige un dossier depuis le dossier : c'est là que le retour
  // structuré (`account_feedback`) se pose.
  correction_made: '/accounts',
  // #2077.9 — l'écran Équipe, où `team:manage` invite (`WorkspaceTeamService`).
  colleague_invited: '/settings/team',
} as const satisfies Record<ActivationStepKey, string>

/** #2077.9 — `colleague_invited` est tri-état ; les sept autres jalons sont
 *  booléens. `true` seulement pour `'done'` — `'pending'` reste actionnable,
 *  `'not_applicable'` n'entre même pas dans {@link applicableSteps}. */
function isStepDone(data: OnboardingActivation, step: ActivationStepKey): boolean {
  if (step === 'colleague_invited') return data.colleague_invited === 'done'
  return data[step]
}

/** #2077.9 — un jalon `not_applicable` sort du dénominateur ET de la liste
 *  affichée : ni « prochaine étape » (ce serait un geste aveugle), ni compté
 *  (doctrine « non mesuré n'est jamais 0 »). */
function isStepApplicable(data: OnboardingActivation, step: ActivationStepKey): boolean {
  return step !== 'colleague_invited' || data.colleague_invited !== 'not_applicable'
}

/**
 * Self-serve activation checklist (chantier D1) — the real milestones toward
 * « premier dossier consulté ». Every flag comes from `GET /onboarding/activation`
 * (derived from esn_profiles / analysis_runs / product_events / user_actions):
 * the widget NEVER invents progress. Collapsible, and disappears entirely once
 * all steps are done (`is_complete`) — activated users never see it again.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1405 — REPLIÉ NE VOULAIT PAS DIRE UTILE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour dit que le bloc « prend beaucoup trop d'espace pour un utilisateur
 * qui a déjà commencé ». La moitié de la réponse existait déjà : il est replié
 * PAR DÉFAUT et n'affiche alors qu'une pastille « 4/5 ».
 *
 * L'autre moitié manquait, et c'est celle qui compte : replié, il ne disait pas
 * QUOI FAIRE. « 4/5 » sans la prochaine étape demande de déplier pour apprendre
 * quelque chose — c'est-à-dire de refaire le geste qu'on venait d'annuler.
 * L'état replié porte donc la première étape incomplète et son bouton, exactement
 * comme le retour le rédige.
 *
 * ⚠️ Ce n'est PAS un second interrupteur : déplié, la liste complète reste la
 * seule vérité et la ligne compacte disparaît. Le même réglage vit à un seul
 * endroit (loi 1 du tome 7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1794 — LE TUTORIEL SE RELANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour : une fois les étapes faites, la barre doit RESTER — pas
 * disparaître — pour qu'on puisse la rouvrir « autant qu'on veut », et pouvoir
 * choisir de la masquer (récupérable ailleurs), plutôt que de la perdre.
 *
 * `is_complete` ne fait donc plus disparaître le composant : seul un geste
 * explicite de masquage (#1794.2) le fait, et ce geste est un choix local,
 * réversible, qui ne touche à AUCUNE donnée serveur — ni les milestones
 * (dérivés, inchangés), ni les réponses du questionnaire (`esn_profiles`,
 * jamais lues ni écrites d'ici, voir `ActivationChecklist.test.tsx`).
 */
export function ActivationChecklist() {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const { data, isLoading } = useActivation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [hidden, setHidden] = useState(readHidden)
  // #2117.84 — recette iPhone du 25/09 : repliée, la ligne portait le titre,
  // la prochaine étape (texte libre) ET « Continuer », à côté de la pastille
  // et du chevron — six éléments sur une rangée `flex nowrap` avec deux blocs
  // `min-w-0 flex-1` en concurrence. Sous 768px, les `shrink-0` (bouton,
  // pastille, chevron) prenaient toute la largeur et les blocs flexibles
  // s'écrasaient à quelques pixels, faisant tenir le titre sur plusieurs
  // lignes. Sous la borne mobile, la ligne ne porte plus que le titre, la
  // pastille de progression et le chevron ; la prochaine étape et
  // « Continuer » restent un raccourci de BUREAU, où la largeur ne manque pas.
  const isMobile = useIsMobile()

  // No data (loading/error) → render nothing rather than a fake 0/5.
  // Masqué explicitement (#1794.2) → rien non plus, jusqu'à ce qu'on le
  // redemande depuis l'endroit où ce choix se défait (#1794.3).
  if (hidden) return null
  // #3490 (recette 02/10) — pendant le chargement, la barre REPLIÉE (~58 px) a déjà
  // sa place : sans elle, tout le contenu descendait d'un bloc à l'arrivée des
  // données. Rien n'y est écrit (aucun faux « 0/7 ») ; une erreur ne réserve rien.
  if (!data) {
    return isLoading ? (
      <div aria-hidden data-testid="activation-checklist-placeholder" className="mb-4 h-[3.625rem] w-full" />
    ) : null
  }

  // #2077.9 — un jalon `not_applicable` (ex. inviter, sans `team:manage` ou
  // sans siège libre) sort de la liste ET du dénominateur : ni « prochaine
  // étape », ni compté dans « n/total » (doctrine « non mesuré n'est jamais 0 »).
  const applicableSteps = ACTIVATION_STEP_KEYS.filter(step => isStepApplicable(data, step))

  // ⚠️ DÉRIVÉE, jamais stockée. Un « index de l'étape courante » gardé à côté
  // des drapeaux serait un second état à tenir d'accord avec eux, et il
  // divergerait le jour où une étape se valide par un autre chemin.
  // Une fois toutes les étapes faites, `nextStep` est `undefined` — c'est ce qui
  // efface naturellement la ligne « prochaine étape » ci-dessous, sans code
  // séparé pour le cas complet.
  const nextStep = applicableSteps.find(step => !isStepDone(data, step))

  const toggle = () => {
    setCollapsed(prev => {
      persistCollapsed(!prev)
      return !prev
    })
  }

  // #1794.2 — geste EXPLICITE, offert seulement une fois l'onboarding fini :
  // masquer une checklist encore en cours retirerait une relance active que
  // personne n'a demandée.
  const hide = () => {
    persistHidden(true)
    setHidden(true)
  }

  return (
    <section
      aria-label={t('activation.title')}
      className="mb-4 w-full rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] shadow-sm"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-primary-500)]/10 text-[var(--bellum-primary-500)]">
          <Rocket className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Text element="h2" size="sm" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
            {t('activation.title')}
          </Text>
          {!collapsed && (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('activation.subtitle')}
            </Text>
          )}
        </div>
        {/* Replié, la ligne dit la PROCHAINE étape — sans elle, « 4/5 » oblige à
            déplier pour apprendre quoi que ce soit. Déplié, elle disparaît :
            la liste dit déjà tout, et la répéter serait la loi 4 enfreinte.
            #2117.84 — un texte SANS borne de longueur, à côté d'un bouton et
            d'une pastille `shrink-0` : sous 768px, ça n'a plus la largeur.
            Reste un raccourci de BUREAU (`!isMobile`) ; le mobile garde le
            titre, la pastille et le chevron, sur une seule ligne. */}
        {collapsed && nextStep && !isMobile ? (
          <Text element="p" size="xs" className="min-w-0 flex-1 truncate text-[var(--bellum-text-secondary)]">
            {t('activation.nextStep', { label: t(STEP_LABEL_KEYS[nextStep]) })}
          </Text>
        ) : null}
        {collapsed && nextStep && !isMobile ? (
          <button
            type="button"
            onClick={() => void navigate({ to: STEP_TARGETS[nextStep] })}
            className="shrink-0 rounded-lg border border-[var(--bellum-border)] px-2.5 py-1 text-xs font-medium text-[var(--bellum-text-accent)] transition-colors hover:bg-[var(--bellum-surface-1)] pointer-coarse:min-h-11"
          >
            {t('activation.continue')}
          </button>
        ) : null}
        <span className="shrink-0 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]">
          {t('activation.progressLabel', { done: data.completed_count, total: applicableSteps.length })}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          // ⚠️ Le chevron EST le « Voir toutes les étapes » du retour : le renommer
          // aurait cassé la symétrie déployer/réduire, et en AJOUTER un second
          // aurait mis deux interrupteurs sur le même réglage (loi 1 du tome 7).
          aria-label={collapsed ? t('activation.expand') : t('activation.collapse')}
          className="shrink-0 rounded p-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-1)] hover:text-[var(--bellum-text-primary)]"
        >
          <ChevronDown className={cn('size-4 transition-transform', collapsed ? '' : 'rotate-180')} />
        </button>
        {/* #1794.2 — n'apparaît qu'une fois l'onboarding fini : masquer une
            checklist encore en cours retirerait une relance active. Masquer
            n'efface rien côté serveur (les milestones restent acquis) —
            seul l'AFFICHAGE de la barre est concerné, et #1794.3 le rend
            réversible ailleurs. */}
        {data.is_complete && (
          <button
            type="button"
            onClick={hide}
            aria-label={t('activation.hide')}
            className="shrink-0 rounded p-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-1)] hover:text-[var(--bellum-text-primary)]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <ul className="border-t border-[var(--bellum-border)] px-2 py-2">
          {applicableSteps.map((step, index) => {
            const done = isStepDone(data, step)
            const label = t(STEP_LABEL_KEYS[step])
            return (
              <li key={step}>
                {done ? (
                  <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                    <span
                      aria-hidden
                      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[var(--success-soft-text)]"
                    >
                      <Check className="size-3.5" />
                    </span>
                    <Text element="span" size="sm" className="text-[var(--bellum-text-muted)] line-through">
                      {label}
                    </Text>
                    <span className="sr-only">{t('activation.stepDone')}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void navigate({ to: STEP_TARGETS[step] })}
                    // #2002 (famille) — le chevron et la croix de ce composant
                    // portaient déjà leurs 44 px ; la rangée cliquable, qui est
                    // le geste le plus pressé du parcours, tenait dans 36 px.
                    className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--bellum-surface-1)] pointer-coarse:min-h-11"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--bellum-border)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Text element="span" size="sm" className="block text-[var(--bellum-text-primary)]">
                        {label}
                      </Text>
                      {/* #2077.11 — la raison du geste, sous le geste. */}
                      <Text element="span" size="xs" className="block text-[var(--bellum-text-secondary)]">
                        {t(STEP_BENEFIT_KEYS[step])}
                      </Text>
                    </span>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
