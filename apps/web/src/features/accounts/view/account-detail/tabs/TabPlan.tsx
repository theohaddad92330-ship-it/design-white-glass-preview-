import type { Account, AccountStrategy5PDimension } from '@bellum/contracts'
import type { TabId } from '../components/AccountDetailTabsBar'
import { AccountStrategy5PSection } from './sections/AccountStrategy5PSection'
import { parseAccountAnalysis } from '@bellum/contracts'
import { motion } from 'framer-motion'
import { Target } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { stagger } from '../motion'
import { PlanTasksPanel } from '../theo/PlanTasksPanel'
import { KeyNotesCard } from './sections/KeyNotesCard'
import { ActionPlanBoard } from './plan/ActionPlanBoard'
import { AttackAnglesSection } from './plan/AttackAnglesSection'
import { ReinforcedAnglesCard } from './plan/ReinforcedAnglesCard'
import { Rank2PathCard } from './plan/Rank2PathCard'
import { PlanAttackSummary } from './plan/PlanAttackSummary'
import { PlanNextMoves } from './plan/PlanNextMoves'
import { ReplanDialog } from './plan/ReplanDialog'
import { PlanSections } from './plan/PlanSections'
import { PlanSalesContext } from './plan/PlanSalesContext'
import { ReplanNudge } from './plan/ReplanNudge'
import { accountPlanFreshness, planGeneratedDate } from '../../../model/lastAnalyzed'
import { PlanFreshnessBadge } from './plan/PlanFreshnessBadge'
import { AccountGateStateChip } from '../components/AccountGateStateChip'
import { planAbsence } from './plan/planAbsence'
import { aggregatedTrajectoryDestinations, buildPlanViewData, type PlanRecord } from './plan/planViewData'
import { MeetingPrepCard } from './plan/MeetingPrepCard'
import { MeetingR1R2Panel } from './plan/MeetingR1R2Panel'
import { QuestionLibraryCard } from './plan/QuestionLibraryCard'
import { ReverseProspectsSection } from './plan/ReverseProspectsSection'
import { AggregatedTrajectoriesSection } from './plan/AggregatedTrajectoriesSection'
import { MeetingNotesCard } from '@/features/meeting-notes/view/MeetingNotesCard'
import { NetworkPlaybookCard } from '@/features/linkedin/view/NetworkPlaybookCard'
import { AccountDeliverables } from '@/features/documents/view/AccountDeliverables'
import { useTranslation } from 'react-i18next'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { readStrategicVerdict } from './useAccountOverviewData'
import { useAccountVerdictRevision } from '@/features/accounts/hooks/useAccountVerdictRevision'
import { useAccountVerdictUnchanged } from '@/features/accounts/hooks/useAccountVerdictUnchanged'
import { VerdictRevisionCard } from './sections/VerdictRevisionCard'
import { SegmentStaleCollectionNotice } from '../components/SegmentStaleCollectionNotice'
import { PlanStepsList } from './plan/PlanStepsList'
import { usePlanSteps } from './plan/usePlanSteps'

export function TabPlan({
  account,
  highlightActionId = null,
  prepareOpen = false,
  onOpenTab,
  onAddStrategyGapToPlan,
}: {
  account: Account
  /** #3777 — « Cinq questions de terrain » (ex-Synthèse) : ouvre l'onglet qui porte la preuve. */
  onOpenTab?: (tab: TabId) => void
  /** #3777 / #3277.3 — « Ajouter au plan » de la carte 5P. */
  onAddStrategyGapToPlan?: (dimension: AccountStrategy5PDimension) => void
  /** #2107.32 — la ligne à amener à l'écran, désignée par `?item=action:<id>`. */
  highlightActionId?: string | null
  /** #4424.4 — « Préparer le RDV » (toast de création) amène ici : le panneau arrive ouvert. */
  prepareOpen?: boolean
}) {
  const { t } = useTranslation('accountDetail')
  const [replanOpen, setReplanOpen] = useState(false)
  // #4088 (15/10) — même entrée que la Synthèse pour NOMMER le verdict (un seul libellé partout).
  const hasObjective = useHasOfferObjective()
  const data = buildPlanViewData((account.raw_analysis || {}) as PlanRecord, account.website)
  // #3235 (recette R14) — « pourquoi le verdict a changé » se lit sous lui ; le NOM du verdict vient de
  // `readStrategicVerdict` (#4088), qui lit déjà le déclencheur NO-GO : une seule source (GA-26).
  const { data: revision } = useAccountVerdictRevision(account.id)
  const { data: unchanged } = useAccountVerdictUnchanged(account.id) // #4180
  // FINIR-V2-27-09 — bloc CSV 15_DOMAINES_OPPORTUNITE : des domaines
  // d'opportunité observés, sans score ni persona repris (voir le docblock
  // d'`opportunity_domains`, account-analysis.ts).
  const opportunityDomains = useMemo(
    () => parseAccountAnalysis(account.raw_analysis).opportunity_domains,
    [account.raw_analysis],
  )
  // Un plan est un objet VIVANT (tome 5 §37). Le badge est affiché même quand
  // le plan est périmé (D78) : le masquer ferait croire qu'il n'y en a pas, et
  // l'utilisateur en redemanderait un sans savoir qu'il en avait déjà un.
  const freshness = accountPlanFreshness(account, new Date())
  // #4415.1 — EN TÊTE, au plus trois étapes : les prochaines actions OUVERTES du plan, dans son ordre
  // (aucune génération ici). L'état « fait » vient de la même ligne persistée que le tableau (GA-26) ;
  // tant qu'il charge on ne se prononce pas (le zéro de chargement n'est pas « rien de fait »).
  const rawAnalysis = (account.raw_analysis || {}) as Record<string, unknown>
  const steps = usePlanSteps({ accountId: account.id, weeks: data.planWeeks, rawAnalysis })

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="flex min-h-0 flex-col py-4 gap-5 xl:flex-row xl:items-start"
    >
      {/* #1089, #1090 : neuf cartes vivaient dans le rail de 320 px pendant que
          la colonne principale, deux fois plus large, n'en portait que trois —
          et restait blanche à l'écran. « Ici dans la marge, je trouve pas ça
          top » ; « à voir si ça s'affiche au centre, pour que ce soit plus
          confortable pour lire ».

          Le partage n'est pas esthétique, il suit ce qu'on FAIT de la carte :
          ce qui se LIT longuement (la préparation du rendez-vous, les angles,
          la chronologie) et ce qui s'ÉCRIT (les notes de rendez-vous) prend la
          largeur ; le rail garde ce qui se consulte d'un coup d'œil — le
          résumé, le contexte, les livrables.

          Le conteneur défilant imbriqué a disparu avec : la colonne portait
          `max-h-[100dvh] overflow-y-auto` À L'INTÉRIEUR du défilement de la
          page, si bien qu'arrivé au bout de l'un le geste partait sur l'autre —
          c'est ce qui laissait la colonne principale vide sous les yeux. Une
          seule zone défile, celle de la page (règle mobile, valable partout). */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* #2543.7 — l'aveu de fraîcheur du segment stratégie. */}
        <SegmentStaleCollectionNotice dimension="strategy" collectedAt={account.strategy_collected_at ?? null} />
        {/* Refonte Théo (23/10) — `plan:tasks` : les actions du compte d'abord, la stratégie ensuite. */}
        <PlanTasksPanel accountId={account.id} />
        <PlanFreshnessBadge freshness={freshness} generatedAt={planGeneratedDate(account)} />
        {/* #3420.2 — la porte « À trancher » se lit aussi sur le plan : le plan d'un compte non arbitré n'est pas une décision. */}
        <AccountGateStateChip account={account} />
        {/* p27 « le plan se replanifie après chaque réponse » — nudge posé quand
            un événement contact périme le plan ; le clic replanifie. */}
        <ReplanNudge suggestedAt={account.replan_suggested_at} accountId={account.id} angles={data.angles} />
        {/* #2123.12-.19 — le plan ouvre sur ses six sections nommées, dans un
            ordre fixe : le commercial sait par quoi commencer, et ce qui
            manque le DIT au lieu de disparaître. */}
        {/* #2123.11 — le « Verdict stratégique » en tête, LU comme la Synthèse le lit. */}
        <VerdictRevisionCard revision={revision} hasObjective={hasObjective} unchanged={unchanged} />
        {/* #4415.1 — trois étapes numérotées EN TÊTE ; le détail long du plan reste accessible, REPLIÉ dessous. */}
        <PlanStepsList steps={steps} rawAnalysis={rawAnalysis} title={t('planSteps.title')} />
        <PlanDetailFold folded={steps.length > 0} open={highlightActionId !== null} title={t('planSteps.detailTitle')}>
          <PlanSections data={data} verdict={readStrategicVerdict(account, { hasObjective })} />
          {/* #3717.7 — l'ancre que « Résumé du plan » vise quand sa « Première
            action » répète mot pour mot le premier élément d'ici (mesuré,
            `planListOverlap.ts`) : un aperçu, pas une troisième copie. */}
          <div id="plan-next-moves">
            <PlanNextMoves
              movement={data.recommendedMovement}
              route={data.recommendedRoute}
              followedSignal={data.followedSignal}
              nextActions={data.nextActions}
              nextActionsByHorizon={data.nextActionsByHorizon}
              ifNoResponse={data.ifNoResponse}
              planWeeks={data.planWeeks}
              onChangeAngle={() => setReplanOpen(true)}
            />
          </div>
          {/* #3777 (décision Louis 10/10) — « Cinq questions de terrain » : DÉPLACÉE de Synthèse › Stratégie
            vers le Plan, jamais dupliquée (GA-26). */}
          <AccountStrategy5PSection accountId={account.id} onOpenTab={onOpenTab} onAddToPlan={onAddStrategyGapToPlan} />
          {/* #2646.2 — le catalogue Action OS nomme déjà le chemin rang 2 → preuve
            → rang 1 (`WORKFLOW_OUTCOME_CATALOG.rank2_to_rank1`) et l'onglet
            Partenaires lit déjà `rank`/`relationship` : rien ne les reliait.
            Muette sans partenaire au rang 2 — pas de bruit sur les autres comptes. */}
          <Rank2PathCard accountId={account.id} />
          {/* La date d'analyse est la base des échéances RELATIVES du plan
            (« J+1 » = le lendemain du PLAN, pas de la lecture). C'est la même
            date que le badge de fraîcheur ci-dessus : un plan et ses échéances
            ne peuvent pas dater de deux jours différents. */}
          {/* POURQUOI le plan est vide quand il l'est. Le tableau ne voit que ses
            actions, et « zéro action » a quatre causes qui appellent quatre
            gestes opposés — attendre, relancer, analyser, ou écrire. Sans ça il
            disait « crée une première action » à un dossier dont la phase 4
            venait de dépasser son budget : huit fois en trente jours, mesuré. */}
          {/* #3717.7 — l'ancre que « Prochaines actions » vise quand une action
            prioritaire est DÉJÀ une ligne de ce tableau (mesuré, texte exact,
            `planListOverlap.ts`) : un compte, jamais un lien de ligne précise
            — fusionner les deux exigerait un identifiant partagé entre les
            deux pipelines IA, qui n'existe pas encore. */}
          <div id="action-plan-board">
            <ActionPlanBoard
              accountId={account.id}
              weeks={data.planWeeks}
              persistedActions={data.userActions}
              planGeneratedAt={account.last_analyzed_at ?? null}
              absence={planAbsence(account)}
              highlightActionId={highlightActionId}
            />
          </div>
        </PlanDetailFold>
        {/* ─────────────────────────────────────────────────────────────────
            #1888 — « replier certaines parties … je veux PAR EXEMPLE que les
            phases soient repliées ». Les phases le sont, dans le tableau
            ci-dessus ; ces deux sections sont l'autre moitié du même retour.

            Ce qui reste OUVERT au-dessus est ce qui appelle une action : la
            fraîcheur du plan (elle DATE tout ce qui suit), le nudge de
            replanification, les prochains mouvements, et le tableau lui-même.
            Ce qui se replie ici se LIT — des angles, des questions, une
            chronologie — et c'est ce qui faisait défiler l'écran.

            Chaque section s'appuie sur un bloc qui rend TOUJOURS quelque chose
            (`AttackAnglesSection` a son état vide rédigé ; `MeetingNotesCard`
            est un formulaire) : jamais un en-tête qui ouvre sur du vide, alors
            que `ReinforcedAnglesCard` et `MeetingPrepCard` se retirent
            d'elles-mêmes quand elles n'ont rien à dire.

            ⚠️ Aucun chiffre ne reste orphelin : le badge de fraîcheur et sa
            date de génération restent hors repli, et les blocs repliés
            emportent leurs propres qualificatifs. */}
        <CollapsedSection title={t('planSections.anglesTitle')} description={t('planSections.anglesDescription')}>
          <div className="space-y-5">
            {/* Les angles portent un titre long, une description et trois méta —
                illisibles sur 320 px, et c'est là que « voir le détail » n'ajoutait
                rien à ce qu'on venait de tronquer (#1091). */}
            {/* #1611 — ce que l'environnement observé CORROBORE, juste avant les
                angles. Elle ne renforce que : la mémoire marché ne peut jamais
                produire un NO-GO par absence. Muette sans corroboration. */}
            <ReinforcedAnglesCard accountId={account.id} />
            <AttackAnglesSection angles={data.angles} accountId={account.id} discardedAxes={data.discardedAxes} />
            {/* FINIR-V2-27-09 — les domaines d'opportunité observés, après les
            angles retenus : un domaine n'est pas un angle qualifié, c'est le
            terrain plus large dont les angles ci-dessus sont tirés. */}
            <KeyNotesCard
              title={t('opportunityDomains.title')}
              icon={<Target className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
              notes={opportunityDomains}
            />
          </div>
        </CollapsedSection>

        {/* #4424.4 — exception écrite à « replié à l'arrivée » : le lien « Préparer le RDV »
            d'une création de mission ou de besoin (`?prep=rdv`) ouvre CE panneau. */}
        <CollapsedSection
          title={t('planSections.prepareTitle')}
          description={t('planSections.prepareDescription')}
          defaultOpen={prepareOpen}
        >
          <div className="space-y-5">
            {/* Les questions et la trame du rendez-vous. Produites à CHAQUE analyse
                depuis toujours, et affichées nulle part dans l'application : seul le
                back-office les voyait. */}
            <MeetingPrepCard prep={data.meetingPrep} />
            {/* #4424.1 — le R1 / R2 depuis la fiche compte, sans agenda synchronisé. */}
            <MeetingR1R2Panel
              accountId={account.id}
              companyName={account.company_name}
              stakesRaw={account.it_challenges}
            />
            {/* §5.3 / §7.2 : les notes du rendez-vous deviennent un compte rendu,
                puis des actions que l'utilisateur CHOISIT de poser dans le CRM.
                Une zone de SAISIE : elle a besoin de sa largeur. */}
            <MeetingNotesCard
              accountId={account.id}
              companyName={account.company_name}
              website={account.website}
              siren={account.siren}
            />
            {/* #3717 — la méthode et le réseau valent pour TOUT compte, pas pour
                celui-ci : ils ne sont plus une colonne permanente qui ressemble à
                une reco contextualisée. Un seul accès, replié, nommé « général ».
                Aucun identifiant de compte n'est transmis au réseau : le libellé
                le dit au lieu de le laisser croire. */}
            <CollapsedSection title={t('planSections.generalTitle')} description={t('planSections.generalDescription')}>
              <div className="space-y-5">
                <QuestionLibraryCard />
                <NetworkPlaybookCard />
              </div>
            </CollapsedSection>
          </div>
        </CollapsedSection>
      </div>
      {/* `flex` manquait devant `flex-col` : l'aside était un bloc, donc
          `gap-8` ne s'appliquait à rien et les cartes se collaient. */}
      <aside className="sticky top-4 flex w-full flex-col gap-5 xl:w-80 xl:shrink-0">
        <PlanAttackSummary data={data} account={account} />
        {/* Les livrables du dossier : Word, PDF natif, présentation, classeur.
            Trois rendus d'un seul modèle de contenu côté serveur. */}
        <AccountDeliverables account={account} />
        {/* Couche zéro (annexe méthodo p7/p9) : les ex-collaborateurs du compte
            sont une porte d'entrée chaude — invisible jusqu'ici. Rien à afficher
            quand le dossier n'en contient pas (la carte se retire d'elle-même). */}
        <ReverseProspectsSection prospects={data.reverseProspects} />
        {/* #1611.6 — le second bloc, agrégé et anonyme, des trajectoires : les
            destinations dès 3 occurrences, jamais qui y est allé. Opposé du
            bloc Apollo juste au-dessus. */}
        <AggregatedTrajectoriesSection destinations={aggregatedTrajectoryDestinations(data.reverseProspects)} />
        {/* DoD p31 n°6 : « chaque reco cite la règle, le PROFIL et les preuves ».
            Le profil pilotait tout (mouvement, score, tri des contacts, actions)
            sans jamais être montré — le commercial subissait une reco qu'il ne
            pouvait pas contester. Dossier sans SalesContext ⇒ rien n'apparaît. */}
        <PlanSalesContext salesContext={data.salesContext} />
      </aside>
      {/* #3278.r42 — le même re-plan que « Changer d'angle » des angles, déclenché depuis le bloc route. */}
      {replanOpen ? (
        <ReplanDialog open onOpenChange={setReplanOpen} accountId={account.id} angles={data.angles} />
      ) : null}
    </motion.div>
  )
}

/**
 * #4415.1 — le détail long du plan (sections, prochains mouvements, tableau d'actions) : replié sous les
 * étapes quand il y en a ; tel quel, à plat, quand le plan n'en porte aucune. Ouvert d'office quand le lien
 * d'arrivée désigne une ligne du tableau (`?item=action:<id>`), sinon la cible serait démontée.
 */
function PlanDetailFold({
  folded,
  open,
  title,
  children,
}: {
  folded: boolean
  open: boolean
  title: string
  children: ReactNode
}) {
  if (!folded) return <>{children}</>
  return (
    <CollapsedSection title={title} defaultOpen={open}>
      <div className="flex flex-col gap-5">{children}</div>
    </CollapsedSection>
  )
}
