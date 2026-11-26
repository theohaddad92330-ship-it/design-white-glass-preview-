import { cn, SPACE_SCALE, TYPE_SCALE } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Building2, Clock, ListTodo, MessageSquare, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PersonalCockpitKpis } from '@bellum/contracts'
import { FigureScope } from '@/components/primitives/FigureScope'
import type { FigureScopeValue } from '@/components/primitives/figure-scope'
import { revealTarget } from '@/lib/reveal-target'

/** Ancres des cartes du cockpit — posées par `PersonalCockpit`. Une tuile qui
 *  compte quelque chose mène à la liste qui le détaille : « un indicateur qui ne
 *  mène nulle part ne sert à rien » (règle du tableau de bord Qualité). */
export const COCKPIT_ANCHORS = {
  accounts: 'cockpit-accounts',
  relances: 'cockpit-relances',
  messages: 'cockpit-messages',
} as const

type Tile = {
  icon: LucideIcon
  label: string
  value: number
  /** Teinte de l'icône (repère visuel, jamais le seul porteur de l'état). */
  iconTone: string
  danger?: boolean
  /** Carte du cockpit que cette tuile détaille. */
  target: string
  /**
   * #1409 rouvert (16/09/2026) — l'ÉCRAN que cette tuile détaille, quand la
   * liste n'est plus dans le cockpit.
   *
   * Les deux tuiles de relances révélaient une carte du cockpit ; cette carte a
   * déménagé vers le Centre d'actions. Sans ce champ, elles ouvriraient une
   * section qui ne contient plus ce qu'elles comptent — « un indicateur qui ne
   * mène nulle part ne sert à rien », et un indicateur qui mène AILLEURS est
   * pire : il fait chercher.
   */
  to?: '/actions' | '/mailbox' | '/briefing'
  /**
   * #2717 — LA DESTINATION EXACTE, pas seulement l'écran. Un clic qui atterrit
   * sur `/actions` mais retombe sur « À valider » fait chercher un second
   * clic manuel — précisément le défaut que `to` (ci-dessus) existe déjà pour
   * éviter, un cran plus haut.
   */
  search?: { tab?: 'mine'; overdue?: boolean }
  /** Ce que la tuile compte, quand le libellé seul ne le dit pas. */
  hint?: string
  /** #4298.2 — la période et la source du chiffre, dites sous lui (`FigureScope`). */
  scope: FigureScopeValue
}

// #4298.2 — les quatre compteurs sont lus dans BellumAI lui-même (comptes du
// portefeuille, plans d'action, messages journalisés) : aucun ne vient d'un
// outil branché, et la ligne le dit plutôt que de laisser croire au CRM.
const NOW_PORTFOLIO: FigureScopeValue = { period: { kind: 'now' }, sources: ['portfolio'] }
const NOW_ACTIONS: FigureScopeValue = { period: { kind: 'now' }, sources: ['bellum'] }
// Même fenêtre que `PersonalCockpitService` (`weekAgo`, 7 jours glissants).
const LAST_7_DAYS_ACTIONS: FigureScopeValue = { period: { kind: 'lastDays', days: 7 }, sources: ['bellum'] }

/** Personal KPI strip: my accounts, relances to do, overdue, messages (7d). */
export function PersonalKpiRow({
  kpis,
  openTasks = null,
}: {
  kpis: PersonalCockpitKpis
  /**
   * #4297.2 — les tâches ENCORE ouvertes, lues par `useDailyBriefing` (même
   * lecture que « Aujourd'hui », jamais un second calcul). `null` = la source
   * n'a pas répondu : aucun compteur, jamais un « 0 » inventé (GA-18).
   */
  openTasks?: number | null
}) {
  const { t } = useTranslation('dashboard')
  // ⚠️ Un geste, pas un rendu : `<Navigate>` compare l'identité de son objet de
  // props et rejoue en boucle (GA-27).
  const navigate = useNavigate()
  const tasksTile: Tile[] =
    openTasks === null
      ? []
      : [
          {
            icon: ListTodo,
            label: t('personal.kpiTasks'),
            value: openTasks,
            iconTone: 'bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
            target: COCKPIT_ANCHORS.relances,
            // Les tâches se TRAITENT sur « Aujourd'hui » : la tuile y mène.
            to: '/briefing',
            scope: NOW_ACTIONS,
          },
        ]
  const tiles: Tile[] = [
    ...tasksTile,
    {
      icon: Building2,
      // ⚠️ LA POPULATION A CHANGÉ LE 04/09/2026 (#1408), ET LE LIBELLÉ AVEC.
      //
      // Ce KPI comptait les comptes CRÉÉS (`accounts.user_id`), et le libellé le
      // disait honnêtement — « Comptes créés » — parce que la recette du
      // 29/08/2026 avait montré « 27 Comptes suivis » ici contre « 23 suivis »
      // sur `/accounts` : deux nombres justes, un mot qui désignait la mauvaise
      // population.
      //
      // Le libellé était le bon correctif pour un mauvais découpage. Le vrai
      // défaut était plus bas : `/comptes` filtrait sur le RESPONSABLE et le
      // cockpit sur le CRÉATEUR, parce que lancer une analyse ne posait jamais
      // `assigned_to`. Les deux écrans lisent maintenant la même population —
      // le portefeuille —, donc le repère peut enfin s'appeler « mon
      // portefeuille » sans mentir.
      //
      // « Suivi » reste une TROISIÈME chose (`followedAccounts`), et elle a son
      // propre compteur dans le bloc de couverture, juste en dessous.
      label: t('personal.kpiAccounts'),
      hint: t('personal.kpiAccountsHint'),
      value: kpis.my_accounts,
      iconTone: 'bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
      target: COCKPIT_ANCHORS.accounts,
      scope: NOW_PORTFOLIO,
    },
    {
      icon: Clock,
      label: t('personal.kpiRelances'),
      value: kpis.relances_open,
      iconTone: 'bg-[var(--info-soft-bg)] text-[var(--info-soft-text)]',
      target: COCKPIT_ANCHORS.relances,
      to: '/actions',
      // #2717 — MÊME défaut que la tuile « En retard » juste en dessous : sans
      // `tab`, le clic atterrissait sur « À valider », pas sur « Mes relances ».
      search: { tab: 'mine' },
      scope: NOW_ACTIONS,
    },
    {
      icon: AlertTriangle,
      label: t('personal.kpiOverdue'),
      value: kpis.relances_overdue,
      iconTone: 'bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
      danger: kpis.relances_overdue > 0,
      target: COCKPIT_ANCHORS.relances,
      to: '/actions',
      // #2717 — la destination EXACTE : l'onglet « Mes relances », filtré sur
      // le retard (même portée que `kpis.relances_overdue`, voir
      // `countPersonalRelances` côté API). Avant ce lot, le clic atterrissait
      // sur « À valider » sans filtre — un second clic manuel, puis une liste
      // qui ne correspondait pas au chiffre rouge.
      search: { tab: 'mine', overdue: true },
      // #1096 : « quand ça met retard en rouge et je ne peux pas cliquer dessus
      // aie aie aie stress… est-ce que ça correspond aux relances juste en
      // dessous ? ». Oui — et la tuile le DIT maintenant, au lieu de laisser
      // deviner d'où sort le chiffre rouge.
      hint: t('personal.kpiOverdueHint'),
      scope: NOW_ACTIONS,
    },
    {
      icon: MessageSquare,
      label: t('personal.kpiMessages'),
      value: kpis.messages_this_week,
      iconTone: 'bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
      target: COCKPIT_ANCHORS.messages,
      // #2108.37 — mesuré à l'écran le 18/09/2026 : `revealTarget('cockpit-messages')`
      // amenait au mieux « Mes opportunités & ma dynamique relationnelle » (pas les
      // messages), et RIEN quand `perspective` n'est pas dans la réponse (la section
      // ne monte alors pas du tout) — un bouton qui sonne comme une lecture sans en
      // être une. La messagerie existe déjà comme écran : la tuile y mène.
      to: '/mailbox',
      scope: LAST_7_DAYS_ACTIONS,
    },
  ]

  // #1095 : le curseur main s'affichait sur des tuiles qui n'étaient pas
  // cliquables. La réponse n'est pas de retirer le curseur — c'est que ces
  // chiffres MÈNENT quelque part : chacun détaille une carte du cockpit, juste
  // en dessous. `<button>` et non `<div onClick>` (GA-35) : ça se tabule, ça
  // s'annonce, ça répond à Entrée.
  //
  // Le geste lui-même vit désormais dans `@/lib/reveal-target` : `/pilotage` en
  // avait besoin à son tour (#1128) et deux mécanismes séparés auraient divergé
  // à la première correction. Le comportement, lui, est inchangé.

  // #4298.1 / #4296.2 — la grammaire du Cockpit (PR #4211, `WeekDeltaStrip`) :
  // une rangée DENSE de compteurs au lieu de quatre grosses cartes d'ouverture
  // (pastille d'icône de 44 px, chiffre en `text-2xl`, ~100 px de haut chacune).
  // Rien n'est retiré : chiffre, libellé, explication, portée et destination
  // restent sur chaque compteur ; seule la hauteur perdue part.
  return (
    <ul
      aria-label={t('personal.kpiListLabel')}
      className={cn('grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-5', SPACE_SCALE.group)}
    >
      {tiles.map(tile => {
        const Icon = tile.icon
        return (
          <li key={tile.label} className="min-w-0">
            <button
              type="button"
              onClick={() =>
                tile.to
                  ? // #2717 — `search` voyage AVEC `to` : la destination et son filtre
                    // partent dans le même geste, jamais un second clic manuel.
                    void navigate({ to: tile.to, search: tile.search })
                  : revealTarget(tile.target)
              }
              // `value` et non `count` : `count` est une clé RÉSERVÉE d'i18next, qui
              // ferait chercher une forme plurielle (`kpiGoTo_one`) inexistante.
              aria-label={t('personal.kpiGoTo', { label: tile.label, value: tile.value })}
              className="flex h-full min-h-11 w-full min-w-11 flex-col items-start justify-start gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-4 text-left transition-colors hover:border-[var(--accent-soft-border)] hover:bg-[var(--bellum-surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              {/* Théo « v18-stat » : le libellé au-dessus, le chiffre en grand, l'explication dessous. */}
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn('flex size-6 items-center justify-center rounded-md', tile.iconTone)}>
                  <Icon className="size-3.5" />
                </span>
                <span className={cn(TYPE_SCALE.label, 'text-[var(--bellum-text-secondary)]')}>{tile.label}</span>
              </span>
              <span
                className={cn(
                  // `.v18-stat strong` vaut 30 px chez Théo ; l'échelle du lot (#4332.1) tient le
                  // chiffre clé à `keyFigure` — l'écart est remonté à Louis, pas forcé ici.
                  TYPE_SCALE.keyFigure,
                  tile.danger ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-primary)]',
                )}
              >
                {tile.value}
              </span>
              {tile.hint ? <span className="text-xs text-[var(--bellum-text-muted)]">{tile.hint}</span> : null}
              <FigureScope scope={tile.scope} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
