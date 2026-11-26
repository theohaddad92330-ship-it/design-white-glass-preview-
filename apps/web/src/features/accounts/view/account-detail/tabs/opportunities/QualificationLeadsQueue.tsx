import { labelWithCount } from '@/lib/count-label'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import {
  DEFAULT_STAGE_LABELS,
  LEAD_DISMISS_REASONS,
  LEAD_DISMISS_REASON_LABELS,
  DEFAULT_ENTRY_STAGE,
  LEAD_EVIDENCE_LABELS,
  LEAD_EVIDENCE_REQUIREMENTS,
  LEAD_PROPOSAL_REASON_LABELS,
  LEAD_VERIFICATION_LABELS,
  PIPELINE_STAGES,
  type LeadConversion,
  type LeadDismissReason,
  type LeadMissingInfo,
  type ProjectReadRow,
} from '@bellum/contracts'
import { Badge, Button, Card, FilterChips, SelectField, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { apiFetch } from '@/lib/api'
import { formatDate } from '@/lib/locale'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { projectOriginSearch } from '@/features/projects/lib/projectOrigin'
import { useOptionalContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'
import { matchContactsForRole } from './account-missions'
import { LineNatureBadge } from './LineNatureBadge'
import {
  accountQualificationLeads,
  leadImpact,
  leadPrimaryAction,
  leadGapLabel,
  leadReserve,
  splitLeadsByProof,
  type LeadDecisionRow,
  type QualificationLeadCard,
} from './qualificationLeads'

/**
 * #2172 — LA FILE « PISTES À QUALIFIER » DE LA SECTION OPPORTUNITÉS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN DIT, ET CE QU'IL REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une piste n'est PAS une opportunité. La phrase d'introduction le dit en toutes
 * lettres, parce que c'est la seule chose qui empêche un commercial d'appeler un
 * DSI sur un « projet » qui n'est qu'un communiqué de presse relu par une
 * machine. Chaque ligne répond donc à quatre questions, et à aucune autre : ce
 * qu'on sait, d'où ça vient, ce qui manque, et la vérification suivante.
 *
 * ⚠️ AUCUNE PROBABILITÉ. Le rang est un score DÉCOMPOSÉ sur six axes nommés
 * (`ScoreWithAxes`), et un axe non évaluable SORT du dénominateur en étant
 * NOMMÉ. Pas de « chance de closing », pas de pourcentage de fit.
 *
 * ⚠️ UNE VUE DENSE, pas un mur de cartes. Une ligne par piste — logo, niveau de
 * preuve, date, action — et le détail s'ouvre sous la ligne qu'on interroge. Une
 * file de qualification se PARCOURT ; vingt cartes de texte se referment.
 *
 * ⚠️ CHAQUE CHIFFRE DU RÉSUMÉ OUVRE SA LISTE. Un compteur qui ne mène nulle part
 * est un cul-de-sac : il annonce un état du dossier sans permettre de le voir.
 */

type QualificationLeadsQueueProps = {
  accountId: string
  /** Les contacts connus du dossier — l'axe « présence d'un contact ». */
  contactCount: number
  /** Les domaines d'offre de l'espace, quand l'écran les connaît. Vide =
   *  l'adéquation reste NON MESURÉE, jamais devinée. */
  ownDomainCodes?: readonly string[]
  /** Ouvrir une autre sous-partie du même dossier — les trois actions qui n'ont
   *  rien à écrire mènent là où le travail se fait déjà. */
  onOpenTab: (tab: 'overview' | 'contacts', contactSeed?: string) => void
}

type Bucket = 'active' | 'snoozed' | 'dismissed'
/** Le panneau ouvert sous une ligne. Un seul à la fois : deux formulaires
 *  ouverts sur la même piste demanderaient deux décisions contradictoires. */
type OpenPanel = { key: string; panel: 'more' | 'detail' | 'dismiss' | 'snooze' | 'convert' } | null

/**
 * #2172.36 → .54 — décider d'une piste (écarter, mettre en veille) ou la convertir en projet. UN seul endroit
 * pour ces deux appels : la file des pistes ET l'encart « Projet possible » du tableau des signaux (#4755,
 * lot 761) les partagent, avec les mêmes invalidations.
 */
export function useLeadActions(accountId: string, onDone?: () => void) {
  const queryClient = useQueryClient()
  const decide = useMutation({
    mutationFn: (input: { leadKey: string; body: Record<string, unknown> }) =>
      apiFetch<LeadDecisionRow>({
        path: `/accounts/${accountId}/qualification-leads/${input.leadKey}/decision`,
        method: 'POST',
        body: input.body,
      }),
    onSuccess: () => {
      onDone?.()
      void queryClient.invalidateQueries({ queryKey: ['accounts', 'signal-lines', accountId] })
      void queryClient.invalidateQueries({ queryKey: ['qualification-leads', 'decisions', accountId] })
    },
  })

  /**
   * #2172.36 → .40 — convertir une piste, c'est la faire ENTRER dans le pipe :
   * la ligne existe déjà, et la conversion écrit d'un coup ce que le contrat
   * demande — l'étape de départ, le porteur, l'objectif, la prochaine action et
   * le besoin éventuel.
   *
   * UN seul appel, et pas quatre : quatre requêtes enchaînées côté écran
   * rendraient une conversion à moitié faite indiscernable d'une conversion
   * réussie. Le corps est `LeadConversion` — le MÊME schéma que le DTO de l'API,
   * `.strict()` des deux côtés.
   */
  const convert = useMutation({
    mutationFn: (input: { leadKey: string; body: LeadConversion }) =>
      apiFetch<unknown, LeadConversion>({
        path: `/projects/${input.leadKey}/convert`,
        method: 'POST',
        body: input.body,
      }),
    onSuccess: () => {
      onDone?.()
      void queryClient.invalidateQueries({ queryKey: ['accounts', 'signal-lines', accountId] })
      void queryClient.invalidateQueries({ queryKey: ['projects', 'by-account', accountId] })
      // La prochaine action est une TÂCHE : sans ça, le brief du jour et la
      // carte du pipe continueraient d'afficher « aucune prochaine action » sur
      // une piste qui vient d'en recevoir une.
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return { decide, convert }
}

export function QualificationLeadsQueue({
  accountId,
  contactCount,
  ownDomainCodes = [],
  onOpenTab,
}: QualificationLeadsQueueProps) {
  const { t, i18n } = useTranslation('projects')
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'
  const queryClient = useQueryClient()
  const [bucket, setBucket] = useState<Bucket>('active')
  const [open, setOpen] = useState<OpenPanel>(null)
  const [showAll, setShowAll] = useState(false)

  // ⚠️ LA MÊME CLÉ que la tête de section et que le tableau du dessous : React
  // Query sert la liste une fois pour les trois. Une clé voisine ferait trois
  // appels pour la même liste, et trois listes qui peuvent se contredire.
  const projects = useQuery({
    queryKey: ['projects', 'by-account', accountId],
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${accountId}` }),
  })
  const decisions = useQuery({
    queryKey: ['qualification-leads', 'decisions', accountId],
    queryFn: () => apiFetch<LeadDecisionRow[]>({ path: `/accounts/${accountId}/qualification-leads/decisions` }),
  })

  // #4755 (lot 761) — les MÊMES mutations que la ligne « Projet possible » du tableau des signaux (GA-26).
  const { decide, convert } = useLeadActions(accountId, () => setOpen(null))

  const reopen = useMutation({
    mutationFn: (leadKey: string) =>
      apiFetch<{ reopened: true }>({
        path: `/accounts/${accountId}/qualification-leads/${leadKey}/decision`,
        method: 'DELETE',
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['qualification-leads', 'decisions', accountId] }),
  })

  // #3679 reste — « Préparer l'approche » ouvrait la préparation de
  // conversion (`ConvertForm`) : la MÊME lecture, le MÊME rapprochement rôle
  // ↔ contact et le MÊME composer que `AccountMissions` (#3823.2), jamais un
  // second calcul (GA-26). Sans contact dont le titre recoupe le rôle, ou
  // sans provider d'engagement monté, la porte la plus honnête reste
  // d'aller IDENTIFIER l'interlocuteur plutôt que de deviner lequel écrire.
  const contacts = useContactsByAccount(accountId)
  const engagement = useOptionalContactEngagement()
  const prepareApproach = (lead: QualificationLeadCard) => {
    const matched = matchContactsForRole(lead.potential_role, contacts.data ?? [])
    if (engagement && matched.length > 0) {
      engagement.openEngagement([matched[0]], 'email')
      return
    }
    openTabWithSeed(onOpenTab, 'contacts', lead.potential_role ?? lead.perimeter)
  }

  const leads = useMemo(
    () =>
      accountQualificationLeads({
        rows: projects.data ?? [],
        decisions: decisions.data ?? [],
        ownDomainCodes,
        contactCount,
      }),
    [projects.data, decisions.data, ownDomainCodes, contactCount],
  )

  // Rien à qualifier ET rien d'archivé : la file se tait. Annoncer « 0 piste »
  // au-dessus d'une section pleine dit au commercial que son compte est vide.
  if (leads.counts.total === 0) return null

  // #3499 — « on sait absolument pas quoi en foutre » (Théo, 01/10/2026) : les
  // TROIS plus utiles d'abord (la liste arrive déjà triée par rang), le reste
  // derrière « Voir les N autres » — rien n'est retiré, seulement replié.
  const bucketLeads = leads[bucket]
  // #4329.1 (call refonte UX 19/10 — « trop de projets plausibles ») — le SEUIL DE PREUVE : en tête,
  // seulement les projets possibles dont le fait porte une source DATÉE ; les autres sont REPLIÉS sous
  // une ligne qui les compte. Rien n'est décidé à la place du commercial : le filtre compte toujours
  // TOUTES les pistes actives (GA-259), et une piste repliée garde tous ses gestes. Les seaux « en
  // veille » et « écartées » sont des décisions déjà prises : ils restent entiers.
  const { proven: headLeads, unproven } =
    bucket === 'active' ? splitLeadsByProof(bucketLeads) : { proven: bucketLeads, unproven: [] }
  const hiddenCount = Math.max(0, headLeads.length - LEADS_SHOWN_FIRST)
  const shown = showAll ? headLeads : headLeads.slice(0, LEADS_SHOWN_FIRST)
  // #3678.6 (recette démo 10/10) — « Réserve » et « À faire » identiques sur les 30 pistes ne sont
  // pas une info PAR piste : un seul énoncé au-dessus de la liste, les lignes ne le répètent pas (GA-26).
  // #3678.6 (recette G4 11/10, lot RAX) — jugé sur les pistes AFFICHÉES : une seule piste différente
  // cachée derrière « Voir les N autres » empêchait le regroupement et chaque ligne répétait l'énoncé.
  const shared = sharedLeadStatements(shown, lang)
  const renderRow = (lead: QualificationLeadCard, hoisted: { reserve: boolean; action: boolean }) => (
    <LeadRow
      lead={lead}
      lang={lang}
      hoisted={hoisted}
      accountId={accountId}
      open={open?.key === lead.key ? open.panel : null}
      onOpen={panel =>
        setOpen(current => (current?.key === lead.key && current.panel === panel ? null : { key: lead.key, panel }))
      }
      onOpenTab={onOpenTab}
      onDecide={body => decide.mutate({ leadKey: lead.key, body })}
      onReopen={() => reopen.mutate(lead.key)}
      onConvert={body => convert.mutate({ leadKey: lead.key, body })}
      onPrepareApproach={prepareApproach}
      pending={decide.isPending || convert.isPending}
    />
  )

  return (
    <section aria-label={t('qualificationLeads.title')} className="min-w-0 space-y-3">
      <div className="space-y-1">
        <Text element="h2" size="sm" weight="semibold">
          {t('qualificationLeads.title')}
        </Text>
        {/* #2172.3 — la phrase qui empêche de lire cette file comme un pipe. */}
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('qualificationLeads.intro')}
        </Text>
      </div>

      {/* #2172.56 — chaque chiffre OUVRE sa liste. La rangée passe par le
          composant partagé (GA-249) : une rangée de filtres réécrite à la main
          se met à ressembler à la précédente sans lui être identique. */}
      <FilterChips
        ariaLabel={t('qualificationLeads.title')}
        size="sm"
        value={bucket}
        onChange={next => {
          setBucket((next ?? 'active') as Bucket)
          setOpen(null)
        }}
        options={(['active', 'snoozed', 'dismissed'] as const).map(name => ({
          value: name,
          // #4433.9 — « En veille (0) » n'existe pas : un seau vide se lit sans chiffre (GA-18 / GA-19).
          label: labelWithCount(t(`qualificationLeads.filters.${name}`), leads.counts[name], 'paren'),
        }))}
      />
      {/* GA-259 — un compteur nomme ce qu'il compte. */}
      <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
        {t('qualificationLeads.countsHint')}
      </Text>
      {/* #3680.6 — le chiffre du filtre (« À vérifier (22) ») et la liste tronquée
          à trois ne doivent jamais se lire comme deux comptes qui se contredisent :
          même convention que WatchOverviewStats (#3680.2), « X affichées sur Y »,
          seulement quand la liste est réellement tronquée. */}
      {!showAll && hiddenCount > 0 ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('qualificationLeads.shownOf', { shown: shown.length, total: headLeads.length })}
        </Text>
      ) : null}

      {shown.length === 0 ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {unproven.length > 0 ? t('qualificationLeads.noneProven') : t(`qualificationLeads.empty.${bucket}`)}
        </Text>
      ) : (
        <Card className="overflow-hidden p-0 [--card-spacing:0px]">
          {shared.reserve || shared.action ? (
            <div className="flex min-w-0 flex-col gap-0.5 border-b border-[var(--bellum-border)] px-4 py-3">
              {shared.reserve ? (
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('qualificationLeads.reserve', { reserve: leadGapLabel(shown[0]!, shared.reserve, lang) })}
                </Text>
              ) : null}
              {shared.action ? (
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('qualificationLeads.todo', { action: shared.action })}
                </Text>
              ) : null}
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--bellum-border)]">
            {shown.map(lead => (
              <li key={lead.key} className="min-w-0">
                {renderRow(lead, { reserve: shared.reserve !== null, action: shared.action !== null })}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {hiddenCount > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-fit pointer-coarse:min-h-11"
          aria-expanded={showAll}
          onClick={() => setShowAll(current => !current)}
        >
          {showAll ? t('qualificationLeads.showLess') : t('qualificationLeads.showMore', { count: hiddenCount })}
        </Button>
      ) : null}
      {/* #4329.1 — sous le seuil de preuve : replié, compté, atteignable d'un clic ; aucune ligne sans elles. */}
      {unproven.length > 0 ? (
        <details data-testid="leads-unproven" className="min-w-0">
          <summary className="cursor-pointer text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
            {t('qualificationLeads.unproven', { count: unproven.length })}
          </summary>
          <Card className="mt-3 overflow-hidden p-0 [--card-spacing:0px]">
            <ul className="divide-y divide-[var(--bellum-border)]">
              {unproven.map(lead => (
                <li key={lead.key} className="min-w-0">
                  {renderRow(lead, { reserve: false, action: false })}
                </li>
              ))}
            </ul>
          </Card>
        </details>
      ) : null}

      {decide.isError ? (
        <Text element="p" size="xs" color="text-[var(--danger-soft-text)]">
          {t('qualificationLeads.error')}
        </Text>
      ) : null}
    </section>
  )
}

type LeadPanel = 'more' | 'detail' | 'dismiss' | 'snooze' | 'convert'

function LeadRow({
  lead,
  lang,
  hoisted,
  accountId,
  open,
  onOpen,
  onOpenTab,
  onDecide,
  onReopen,
  onConvert,
  onPrepareApproach,
  pending,
}: {
  lead: QualificationLeadCard
  lang: 'fr' | 'en'
  /** #3678.6 — énoncés déjà dits UNE fois au-dessus de la liste : la ligne ne les répète pas. */
  hoisted: { reserve: boolean; action: boolean }
  accountId: string
  open: LeadPanel | null
  onOpen: (panel: LeadPanel) => void
  onOpenTab: (tab: 'overview' | 'contacts', contactSeed?: string) => void
  onDecide: (body: Record<string, unknown>) => void
  onReopen: () => void
  onConvert: (body: LeadConversion) => void
  /** #3679 reste — brouillon de message allégé (composer existant) pour « Préparer l'approche ». */
  onPrepareApproach: (lead: QualificationLeadCard) => void
  pending: boolean
}) {
  const { t } = useTranslation('projects')
  const primary = leadPrimaryAction(lead)

  return (
    <div className="min-w-0 px-4 py-3">
      {/* LA LIGNE DENSE : logo · niveau de preuve · date · libellé · action. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <LeadLogo lead={lead} />
        <LineNatureBadge nature="leadToExplore" />
        <Badge variant="outline">{LEAD_EVIDENCE_LABELS[lead.evidence_level][lang]}</Badge>
        {/* #2172.13 — la date, ou son absence NOMMÉE. Jamais un tiret. */}
        {lead.observed_on ? (
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualificationLeads.detectedOn', { date: formatDate(lead.observed_on) })}
          </Text>
        ) : (
          // #2692.1 — retour bêta « corrige la mise en forme » : cette absence
          // occupait `text-sm` (le défaut de `UnknownValue`), la taille du
          // LIBELLÉ de la piste, alors qu'elle tient la même position que la
          // date en `text-xs` juste au-dessus. Le `className` gagne sur la
          // taille par défaut du composant partagé (`cn` → `tailwind-merge`,
          // dernière classe conflictuelle retenue) : aligné sur la date sans
          // toucher aux ~40 autres appelants de `UnknownValue`.
          <UnknownValue reason={t('qualificationLeads.undated')} className="text-xs" />
        )}
        {/* #2619.1 — le libellé n'est pas un texte de LECTURE : c'est une ligne
            de tableau de bord (D81 / GA-34), elle prend la largeur RÉELLE de
            la ligne. `full` retire le `max-w-[70ch]` que `Text` pose par
            défaut — sans lui, un libellé long s'écrasait dans 70 caractères
            et chevauchait les deux boutons qui suivent sur la même ligne.
            `break-words` (même remède que #1804 sur `MissionsTable.tsx`)
            laisse un mot trop long passer à la ligne plutôt que déborder.

            #2708.1 / #2692.2 — LA DENSITÉ, ET CE N'EST PAS GA-63 (22/09/2026).
            GA-63 (commit 98c1c189b, juste au-dessus dans l'historique) a élargi
            CETTE MÊME ligne de 650 à 1 195 px : c'était le bon correctif pour le
            défaut qu'elle visait, et il TIENT — rien n'y est repris ici. Mesuré
            en prod (compte 8ea17309…, onglet Projets) APRÈS GA-63 : la ligne la
            plus haute atteint quand même 145 px, parce que `lead.label` porte le
            texte INTÉGRAL d'un signal détecté par l'analyse (jusqu'à ~400
            caractères, aucune borne de longueur) sur ~6 lignes à 14 px, alors que
            les lignes courtes tiennent en 57-65 px. Deux défauts différents sur
            le même écran : GA-63 corrigeait la LARGEUR, celui-ci borne la
            HAUTEUR. `line-clamp-2` ramène la ligne au voisinage de 57-65 px sans
            toucher la donnée : `title` porte le texte intégral, atteignable au
            survol — on tronque l'AFFICHAGE, jamais ce qu'on a (GA-385).

            RE-MESURE 22/09 SOIR — LE CLAMP CI-DESSUS NE PORTAIT PAS, MÊME
            LIGNE. Le correctif posait bien `line-clamp-2` + `title` sur
            `lead.label`, mais DIRECTEMENT sur l'item flex de la ligne dense
            (`flex … items-center`) : `-webkit-line-clamp` exige
            `display: -webkit-box`, un mode de boîte que `align-items: center`
            sur le parent flex empêche d'engager correctement — piège connu du
            modèle flexbox, pas de Tailwind. Re-mesuré en prod (même compte,
            `?tab=needs`) : `webkitLineClamp` = "none" sur les 18 lignes, deux
            libellés (204 et 469 caractères, contre ~400 la première fois)
            rendus sur 3 et 6 lignes NATURELLES, sans troncature. Le `<div>`
            ci-dessous porte l'item flex (`min-w-0 flex-1`) ; le `<Text>`
            qu'il enveloppe est un enfant de BLOC ordinaire, hors de portée de
            l'étirement flex, et peut engager `-webkit-box` normalement. */}
        <div className="min-w-0 flex-1">
          <Text element="span" size="sm" weight="medium" full className="line-clamp-2 break-words" title={lead.label}>
            {lead.label}
          </Text>
        </div>
        {/* #3679 — UNE action principale dont le libellé EST le résultat du
            clic, au lieu de huit gestes équivalents. Les gestes secondaires
            (pipe, veille, écart, Laura, détail) tiennent derrière « Autres
            options » : rien n'est retiré, seulement replié. */}
        {primary.kind === 'opportunity' ? (
          <Button asChild size="sm" variant="outline" className="pointer-coarse:min-h-11">
            {/* #3683.6 — l'origine voyage dans l'URL : « Retour au dossier du
                compte » retrouve le même compte et le même onglet. */}
            <Link
              to="/projects/$id"
              params={{ id: primary.id }}
              search={projectOriginSearch({ accountId, tab: 'veille' })}
            >
              {t(`qualificationLeads.primary.${primary.label}`)}
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => {
              // #3683.3 — « Identifier un interlocuteur » GARDE le rôle (à défaut le périmètre) de la piste :
              // l'onglet Contacts s'ouvre déjà cherché dessus, pas sur une liste générale.
              if (primary.kind === 'tab') {
                openTabWithSeed(onOpenTab, primary.tab, lead.potential_role ?? lead.perimeter)
                return
              }
              if (primary.kind === 'draft_message') {
                onPrepareApproach(lead)
                return
              }
              onOpen(primary.panel)
            }}
          >
            {t(`qualificationLeads.primary.${primary.label}`)}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          aria-expanded={open === 'more'}
          onClick={() => onOpen('more')}
        >
          {t('qualificationLeads.moreOptions')}
        </Button>
      </div>

      {/* #3499 — chaque piste dit en clair D'OÙ elle vient (source nommée et
          date, quand on les a) et QUOI FAIRE (la prochaine vérification). */}
      <LeadOriginAndTodo lead={lead} lang={lang} hoisted={hoisted} />

      {lead.state !== 'active' ? <DecidedLine lead={lead} lang={lang} onReopen={onReopen} /> : null}

      {open === 'more' ? <LeadMoreActions onOpen={onOpen} leadId={lead.key} accountId={accountId} /> : null}
      {open === 'detail' ? <LeadDetail lead={lead} lang={lang} /> : null}
      {open === 'dismiss' ? <DismissForm onDecide={onDecide} pending={pending} lang={lang} /> : null}
      {open === 'snooze' ? <SnoozeForm onDecide={onDecide} pending={pending} /> : null}
      {open === 'convert' ? <ConvertForm lead={lead} lang={lang} onConvert={onConvert} pending={pending} /> : null}
    </div>
  )
}

/** #3683.3 — n'ajoute l'argument de recherche que s'il existe : une piste sans rôle ni périmètre ouvre l'onglet nu. */
function openTabWithSeed(
  onOpenTab: (tab: 'overview' | 'contacts', contactSeed?: string) => void,
  tab: 'overview' | 'contacts',
  seed: string | null,
): void {
  if (seed) onOpenTab(tab, seed)
  else onOpenTab(tab)
}

/**
 * #3678.2 (recette démo 10/10) — `matched_expertise` porte le code de PACK (`esn_it`) : jamais
 * affiché brut. Même vocabulaire que « Famille de prestation » (`sectors.domains.*`) ; un code
 * inconnu du dictionnaire reste lisible tel quel plutôt que de disparaître.
 */
function expertiseLabel(t: (key: string, options?: Record<string, unknown>) => string, code: string): string {
  return t(`sectors.domains.${code}`, { defaultValue: code })
}

/**
 * #3678.6 — la réserve et l'action COMMUNES à toutes les pistes de la liste (≥ 2 pistes) :
 * dites une fois, pas par ligne. Au moindre écart, rien n'est regroupé.
 */
function sharedLeadStatements(
  leads: readonly QualificationLeadCard[],
  lang: 'fr' | 'en',
): { reserve: LeadMissingInfo | null; action: string | null } {
  if (leads.length < 2) return { reserve: null, action: null }
  const reserves = new Set(leads.map(item => leadReserve(item)))
  const actions = new Set(leads.map(item => LEAD_VERIFICATION_LABELS[item.next_verification]?.[lang] ?? null))
  const [reserve] = [...reserves]
  const [action] = [...actions]
  return {
    reserve: reserves.size === 1 && reserve ? reserve : null,
    action: actions.size === 1 && action ? action : null,
  }
}

/** Les pistes rendues d'emblée ; le reste derrière « Voir les N autres » (#3499). */
const LEADS_SHOWN_FIRST = 3

/**
 * #3499 — d'où vient la piste et quoi en faire, en une ligne chacun. La source
 * est celle que la piste porte (le fait, son origine nommée, sa date) ; une
 * source non identifiée n'écrit RIEN — l'absence n'a pas de ligne.
 */
function LeadOriginAndTodo({
  lead,
  lang,
  hoisted,
}: {
  lead: QualificationLeadCard
  lang: 'fr' | 'en'
  hoisted: { reserve: boolean; action: boolean }
}) {
  const { t } = useTranslation('projects')
  const fact = lead.source_facts.find(item => item.source) ?? null
  const origin = fact
    ? [fact.source, fact.observed_on ? formatDate(fact.observed_on) : null].filter(Boolean).join(' · ')
    : null
  const action = hoisted.action ? null : (LEAD_VERIFICATION_LABELS[lead.next_verification]?.[lang] ?? null)
  // #3678.2/.3 (recette R8a, EDF, 14/10) — ce que ça change pour la recherche :
  // lié à une expertise connue, hors cible (consultable, jamais une
  // recommandation), ou pas encore classé. Les TROIS états s'écrivent : une
  // piste ne reste jamais silencieuse sur cette ligne (jamais une case vide
  // qui se confondrait avec « hors cible »).
  const impact = leadImpact(lead)
  const impactLine =
    impact.kind === 'matched'
      ? t('qualificationLeads.impact.matched', { expertise: expertiseLabel(t, impact.expertise) })
      : impact.kind === 'off_target'
        ? t('qualificationLeads.impact.offTarget')
        : t('qualificationLeads.impact.unknown')
  // #3678.6 — la réserve qui change l'action, dite AVANT le dépliage.
  const reserve = hoisted.reserve ? null : leadReserve(lead)
  if (!origin && !action && !impactLine && !reserve) return null
  return (
    <div className="mt-1 flex min-w-0 flex-col gap-0.5">
      {impactLine ? (
        <div className="flex min-w-0 flex-col">
          {/* #3678.2 — l'intitulé promis de la ligne : « Ce que ça change ». */}
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualificationLeads.impact.label')}
          </Text>
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {impactLine}
          </Text>
        </div>
      ) : null}
      {reserve ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('qualificationLeads.reserve', { reserve: leadGapLabel(lead, reserve, lang) })}
        </Text>
      ) : null}
      {origin ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.origin', { origin })}
        </Text>
      ) : null}
      {action ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('qualificationLeads.todo', { action })}
        </Text>
      ) : null}
    </div>
  )
}

/** Le logo du compte, ou ses initiales. Jamais une URL devinée (#1325). */
function LeadLogo({ lead }: { lead: QualificationLeadCard }) {
  const { t } = useTranslation('projects')
  const name = lead.company_name ?? ''
  if (lead.logo_url) {
    return (
      <img
        src={lead.logo_url}
        alt={t('qualificationLeads.logoAlt', { company: name })}
        className="size-6 shrink-0 rounded object-contain"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded bg-[var(--bellum-surface-2)] text-[var(--bellum-text-muted)]"
    >
      <Text element="span" size="xs">
        {name.slice(0, 2).toUpperCase()}
      </Text>
    </span>
  )
}

/** #2172.10 → .19 — tout ce que la piste porte, et tout ce qu'elle ne sait pas. */
function LeadDetail({ lead, lang }: { lead: QualificationLeadCard; lang: 'fr' | 'en' }) {
  const { t } = useTranslation('projects')
  // La réserve est déjà dite sur la ligne : le détail ne la répète pas (#3678.6).
  const reserve = leadReserve(lead)
  const detailGaps = lead.missing.filter(gap => gap !== reserve)
  return (
    <div className="mt-3 space-y-3 rounded-md border border-[var(--bellum-border)] p-3">
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
        {LEAD_EVIDENCE_REQUIREMENTS[lead.evidence_level][lang]}
      </Text>

      <Field label={t('qualificationLeads.perimeter')} value={lead.perimeter} />
      <Field
        label={t('qualificationLeads.expertise')}
        value={lead.matched_expertise ? expertiseLabel(t, lead.matched_expertise) : null}
      />
      <Field label={t('qualificationLeads.role')} value={lead.potential_role} />

      {/* #2172.12 — LE FAIT, ou les signaux, sur lesquels elle repose. */}
      <div className="space-y-1">
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.facts')}
        </Text>
        <ul className="space-y-1">
          {lead.source_facts.map(fact => (
            <li key={`${fact.label}-${fact.observed_on ?? 'undated'}`}>
              <Text element="span" size="xs">
                {fact.label}
              </Text>{' '}
              <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                {fact.source
                  ? t('qualificationLeads.factSource', { source: fact.source })
                  : t('qualificationLeads.factSourceUnknown')}
              </Text>
            </li>
          ))}
        </ul>
      </div>

      <Field label={t('qualificationLeads.reason')} value={LEAD_PROPOSAL_REASON_LABELS[lead.proposal_reason][lang]} />
      {/* #2172.19 — la prochaine vérification, PRÉCISE. */}
      <Field
        label={t('qualificationLeads.verification')}
        value={LEAD_VERIFICATION_LABELS[lead.next_verification][lang]}
      />

      {detailGaps.length > 0 ? (
        <div className="space-y-1">
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualificationLeads.missingTitle')}
          </Text>
          <ul className="space-y-1">
            {detailGaps.map(gap => (
              <li key={gap}>
                <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {leadGapLabel(lead, gap, lang)}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * #3679 — les gestes SECONDAIRES d'une piste, en une rangée compacte. « Travailler
 * dans le pipe » ouvre la préparation de conversion (le compte et les éléments
 * connus y sont repris, seul ce qui manque est demandé) sans passer par un
 * « Qualifier maintenant » ; écarter et mettre en veille gardent leurs formulaires.
 */
function LeadMoreActions({
  onOpen,
  leadId,
  accountId,
}: {
  onOpen: (panel: LeadPanel) => void
  leadId: string
  accountId: string
}) {
  const { t } = useTranslation('projects')
  const openLauraInPlace = useOpenLauraInPlace()
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {/* #3683 (recette prod 06/10) — « Ouvrir dans le Pipe » : la piste EST déjà
          une ligne du pipe (`lead.key` = id du projet), son dossier existe
          (`/projects/$id`). Ce lien OUVRE, il n'écrit rien — à côté de
          « Travailler dans le pipe », qui, lui, convertit.
          #3683.6 — l'origine (compte + onglet veille) voyage dans l'URL, comme
          sur `TabProjects.tsx` / `TabNeeds.tsx` / `SignalOpportunityAction.tsx`. */}
      <Button asChild type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11">
        <Link to="/projects/$id" params={{ id: leadId }} search={projectOriginSearch({ accountId, tab: 'veille' })}>
          {t('accountTab.summary.openInPipe')}
        </Link>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => onOpen('convert')}
      >
        {t('qualificationLeads.actions.add_to_pipe')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => onOpen('detail')}
      >
        {t('qualificationLeads.actions.see_detail')}
      </Button>
      {openLauraInPlace ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          onClick={() => openLauraInPlace('')}
        >
          {t('qualificationLeads.actions.ask_laura')}
        </Button>
      ) : (
        <Button asChild type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11">
          <Link to="/chat">{t('qualificationLeads.actions.ask_laura')}</Link>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => onOpen('snooze')}
      >
        {t('qualificationLeads.actions.snooze')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => onOpen('dismiss')}
      >
        {t('qualificationLeads.actions.dismiss')}
      </Button>
    </div>
  )
}

/** Une valeur connue. Une absence ne fait AUCUNE ligne (#3679 : pas de « Non mesuré » en lecture). */
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text element="span" size="xs" className="min-w-0">
        {value}
      </Text>
    </div>
  )
}

/**
 * #2172.42 → .49 — L'ÉCARTEMENT : sept motifs, et une phrase qui dit jusqu'où il
 * porte. Le motif est OBLIGATOIRE : « écartée sans raison » ne se relit pas dans
 * six mois, et c'est la relecture qui fait la valeur d'une file triée.
 */
export function DismissForm({
  onDecide,
  pending,
  lang,
}: {
  onDecide: (body: Record<string, unknown>) => void
  pending: boolean
  lang: 'fr' | 'en'
}) {
  const { t } = useTranslation('projects')
  const [reason, setReason] = useState<LeadDismissReason | null>(null)
  const [note, setNote] = useState('')

  return (
    <form
      className="mt-3 space-y-3 rounded-md border border-[var(--bellum-border)] p-3"
      onSubmit={event => {
        event.preventDefault()
        if (!reason) return
        onDecide({ decision: 'dismissed', reason, note: note.trim() || null })
      }}
    >
      <Text element="p" size="xs" weight="medium">
        {t('qualificationLeads.dismiss.title')}
      </Text>
      <fieldset className="space-y-2">
        <legend>
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualificationLeads.dismiss.reasonLabel')}
          </Text>
        </legend>
        <FilterChips
          ariaLabel={t('qualificationLeads.dismiss.reasonLabel')}
          size="sm"
          value={reason}
          onChange={next => setReason(next)}
          options={LEAD_DISMISS_REASONS.map(candidate => ({
            value: candidate,
            label: LEAD_DISMISS_REASON_LABELS[candidate][lang],
          }))}
        />
      </fieldset>

      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.dismiss.noteLabel')}
        </Text>
        <input
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder={t('qualificationLeads.dismiss.notePlaceholder')}
          maxLength={500}
          className="h-9 min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)]"
        />
      </label>

      {/* #2172.54 — jusqu'où porte ce refus. La phrase n'est pas décorative :
          c'est la seule chose qui distingue « je n'ai pas d'accès » de « ce
          compte est fermé ». */}
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('qualificationLeads.dismiss.scopeHint')}
      </Text>

      <Button type="submit" size="sm" disabled={!reason || pending} className="pointer-coarse:min-h-11">
        {t('qualificationLeads.dismiss.confirm')}
      </Button>
    </form>
  )
}

/** La mise en veille : une PAUSE datée, pas un refus — donc aucun motif. */
function SnoozeForm({ onDecide, pending }: { onDecide: (body: Record<string, unknown>) => void; pending: boolean }) {
  const { t } = useTranslation('projects')
  const [until, setUntil] = useState('')

  return (
    <form
      className="mt-3 space-y-3 rounded-md border border-[var(--bellum-border)] p-3"
      onSubmit={event => {
        event.preventDefault()
        if (!until) return
        onDecide({ decision: 'snoozed', snoozed_until: until })
      }}
    >
      <Text element="p" size="xs" weight="medium">
        {t('qualificationLeads.snoozeForm.title')}
      </Text>
      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.snoozeForm.untilLabel')}
        </Text>
        <input
          type="date"
          value={until}
          onChange={event => setUntil(event.target.value)}
          className="h-9 min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)]"
        />
      </label>
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('qualificationLeads.snoozeForm.hint')}
      </Text>
      <Button type="submit" size="sm" disabled={!until || pending} className="pointer-coarse:min-h-11">
        {t('qualificationLeads.snoozeForm.confirm')}
      </Button>
    </form>
  )
}

/**
 * #2172.36 → .41 / .53 — LA CONVERSION EN OPPORTUNITÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DEMANDÉ ICI, ET POURQUOI PAS LE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle du point est « on ne demande QUE l'owner, l'objectif, l'étape
 * initiale, la prochaine action et le besoin éventuel — et rien d'autre » : tout
 * ce que le dossier sait déjà est REPRIS, jamais retapé. Elle est figée au
 * contrat (`leadConversionSchema`, `.strict()`, qui REFUSE une clé de plus) et
 * gardée par son test.
 *
 * ⚠️ L'écran n'en demandait QU'UN — l'étape — parce que c'était le seul que
 * l'API savait recevoir (`PATCH /projects/:id/stage`). Les quatre autres
 * n'avaient aucun endpoint, et l'écran renvoyait à la fiche : honnête, mais la
 * moitié du point manquait. Depuis, `POST /projects/:id/convert` reçoit les
 * CINQ et les écrit dans les trois tables qui les portent — la ligne (étape,
 * porteur, objectif), une tâche (la prochaine action), un rôle (le besoin).
 *
 * ⚠️ Rien ne part tant qu'un champ requis manque : le bouton reste inactif
 * plutôt que d'aller chercher un 400, et le besoin laissé vide part en `null` —
 * jamais en chaîne vide, qui se relirait comme un besoin sans intitulé.
 *
 * Ce qui est REPRIS (et donc jamais redemandé) est rappelé au-dessus : le
 * compte, le libellé, le périmètre et le niveau de preuve.
 */
export function ConvertForm({
  lead,
  lang,
  onConvert,
  pending,
}: {
  lead: QualificationLeadCard
  lang: 'fr' | 'en'
  onConvert: (body: LeadConversion) => void
  pending: boolean
}) {
  const { t } = useTranslation('projects')
  const members = useWorkspaceMembers()
  const [stage, setStage] = useState<string>(DEFAULT_ENTRY_STAGE)
  const [ownerId, setOwnerId] = useState<string>('')
  const [objective, setObjective] = useState('')
  const [nextActionTitle, setNextActionTitle] = useState('')
  const [nextActionDue, setNextActionDue] = useState('')
  const [need, setNeed] = useState('')

  const ready =
    ownerId !== '' && objective.trim() !== '' && nextActionTitle.trim() !== '' && nextActionDue.trim() !== ''

  return (
    <form
      className="mt-3 space-y-3 rounded-md border border-[var(--bellum-border)] p-3"
      onSubmit={event => {
        event.preventDefault()
        if (!ready) return
        onConvert({
          owner_id: ownerId,
          objective: objective.trim(),
          initial_stage: stage as LeadConversion['initial_stage'],
          next_action: { title: nextActionTitle.trim(), due_on: nextActionDue },
          // `null` = pas encore de besoin, et c'est une vraie réponse.
          need: need.trim() || null,
        })
      }}
    >
      <Text element="p" size="xs" weight="medium">
        {t('qualificationLeads.convert.title')}
      </Text>
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('qualificationLeads.convert.hint')}
      </Text>

      {/* Ce qui ne se ressaisit pas — rappelé, pas redemandé. */}
      <div className="rounded-md bg-[var(--bellum-surface-2)] p-2">
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.convert.knownTitle')}
        </Text>
        <Text element="p" size="xs">
          {[lead.company_name, lead.label, lead.perimeter, LEAD_EVIDENCE_LABELS[lead.evidence_level][lang]]
            .filter((value): value is string => Boolean(value))
            .join(' · ')}
        </Text>
      </div>

      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.convert.stage')}
        </Text>
        <SelectField
          value={stage}
          onChange={setStage}
          size="sm"
          ariaLabel={t('qualificationLeads.convert.stage')}
          options={PIPELINE_STAGES.map(candidate => ({
            value: candidate,
            // #2693 — `t(\`stages.${candidate}\`)` collisionnait avec les
            // buckets de la file de qualification (`projects:stages.qualified`
            // est un OBJET {tab,label,help}, pas une chaîne) : i18next refuse
            // alors `defaultValue` et rend la clé BRUTE. `DEFAULT_STAGE_LABELS`
            // est la source déjà lue ailleurs pour ces mêmes cinq étapes
            // (`PipelineSlaView.tsx`) — pas un doublon i18n de plus.
            label: DEFAULT_STAGE_LABELS[candidate][lang],
          }))}
        />
      </label>

      {/* #2172.36 — le PORTEUR, choisi parmi les membres de l'espace. Jamais
          déduit du créateur du compte, et jamais d'office celui qui clique : une
          conversion se confie, elle ne s'attribue pas toute seule. */}
      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.convert.owner')}
        </Text>
        <SelectField
          value={ownerId}
          onChange={setOwnerId}
          size="sm"
          ariaLabel={t('qualificationLeads.convert.owner')}
          emptyOption={{ label: t('qualificationLeads.convert.ownerNone') }}
          options={(members.data ?? []).map(member => ({
            value: member.userId,
            label: member.fullName ?? member.email ?? member.userId,
          }))}
        />
      </label>

      {/* #2172.37 — l'OBJECTIF : une phrase, pas un montant. */}
      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.convert.objective')}
        </Text>
        <input
          value={objective}
          onChange={event => setObjective(event.target.value)}
          placeholder={t('qualificationLeads.convert.objectivePlaceholder')}
          maxLength={200}
          className={CONVERT_FIELD_CLASS}
        />
      </label>

      {/* #2172.39 — la PROCHAINE ACTION : ce qu'on fait, et quand. Elle devient
          une tâche sur le projet, donc elle remonte dans le brief du jour. */}
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualificationLeads.convert.nextAction')}
          </Text>
          <input
            value={nextActionTitle}
            onChange={event => setNextActionTitle(event.target.value)}
            placeholder={t('qualificationLeads.convert.nextActionPlaceholder')}
            maxLength={200}
            className={CONVERT_FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('qualificationLeads.convert.nextActionDue')}
          </Text>
          <input
            type="date"
            value={nextActionDue}
            onChange={event => setNextActionDue(event.target.value)}
            className={CONVERT_FIELD_CLASS}
          />
        </label>
      </div>

      {/* #2172.40 — le BESOIN, s'il y en a déjà un. Facultatif, et son absence
          est une réponse : on ne crée pas un rôle sans intitulé. */}
      <label className="flex flex-col gap-1">
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('qualificationLeads.convert.need')}
        </Text>
        <input
          value={need}
          onChange={event => setNeed(event.target.value)}
          placeholder={t('qualificationLeads.convert.needPlaceholder')}
          maxLength={200}
          className={CONVERT_FIELD_CLASS}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={!ready || pending} className="pointer-coarse:min-h-11">
          {t('qualificationLeads.convert.submit')}
        </Button>
        <Button asChild type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11">
          <Link to="/projects">{t('qualificationLeads.convert.openPipe')}</Link>
        </Button>
      </div>
    </form>
  )
}

/** La forme des champs de saisie du formulaire de conversion — une seule fois :
 *  six champs qui divergeraient d'un pixel se verraient. */
const CONVERT_FIELD_CLASS =
  'h-9 min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)]'

/** Ce qu'on a décidé, et depuis quand — la pierre tombale se LIT. */
function DecidedLine({
  lead,
  lang,
  onReopen,
}: {
  lead: QualificationLeadCard
  lang: 'fr' | 'en'
  onReopen: () => void
}) {
  const { t } = useTranslation('projects')
  const decision = lead.decision
  if (!decision) return null
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
      <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
        {lead.state === 'dismissed'
          ? t('qualificationLeads.decided.dismissedOn', { date: formatDate(decision.decided_at) })
          : t('qualificationLeads.decided.snoozedUntil', {
              date: decision.snoozed_until ? formatDate(decision.snoozed_until) : '',
            })}
      </Text>
      {decision.reason ? (
        <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('qualificationLeads.decided.reason', { reason: LEAD_DISMISS_REASON_LABELS[decision.reason][lang] })}
        </Text>
      ) : null}
      <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onReopen}>
        {t('qualificationLeads.decided.reopen')}
      </Button>
    </div>
  )
}
