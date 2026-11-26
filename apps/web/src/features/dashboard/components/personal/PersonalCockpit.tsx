import { Box, SPACE_SCALE, Text, cn } from '@bellum/ui'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Users2 } from 'lucide-react'
import { hasPermission } from '@bellum/contracts'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useDailyBriefing } from '@/features/briefing/api'
import { AgendaCompact } from '@/features/briefing/view/AgendaCompact'
import { PreparedForYouBlock } from '@/features/briefing/view/ActionsBlock'
import { SinceLastVisitBlock } from '@/features/briefing/view/SinceLastVisitBlock'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useFirstName } from '@/hooks/useFirstName'
import { useNow } from '@/lib/hooks/use-now'
import { usePersonalCockpit } from '../../hooks/usePersonalCockpit'
import { CockpitSeriesCard } from '../perspective/CockpitSeriesCard'
import { CommercialObjectivesCard } from '../perspective/CommercialObjectivesCard'
import { DormantOpportunitiesCard } from '../perspective/DormantOpportunitiesCard'
import { PortfolioCoverageCard } from '../perspective/PortfolioCoverageCard'
import { RelationshipPulseCard } from '../perspective/RelationshipPulseCard'
import { TrajectoryCard } from '../perspective/TrajectoryCard'
import { DashboardSkeleton } from '../DashboardSkeleton'
import { CockpitGuidedSteps } from './CockpitGuidedSteps'
import { MyPrioritiesCard } from './MyPrioritiesCard'
import { PersonalCockpitHeader } from './PersonalCockpitHeader'
import { COCKPIT_ANCHORS, PersonalKpiRow } from './PersonalKpiRow'
import { TrajectoryVerdict } from './TrajectoryVerdict'

/**
 * MON COCKPIT — le recul, pas la file du jour (#1404 → #1411).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUESTION QUE CET ÉCRAN RÉPOND, ET CELLES QU'IL NE RÉPOND PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * #1404 pose la frontière et elle commande tout le reste : « Aujourd'hui »
 * (`/briefing`) porte les décisions immédiates, « Messagerie » les échanges à
 * traiter, « Comptes » les dossiers — et ce cockpit porte le recul personnel :
 * « est-ce que je travaille correctement mon portefeuille, et où est-ce que je
 * laisse des opportunités dormir ? ».
 *
 * DEUX CARTES SONT DONC PARTIES, remplacées par ce qui répond vraiment :
 *  · « Mes comptes » → `PortfolioCoverageCard`. Le retour (#1408) a raison :
 *    une liste de comptes triée par score EST la page Comptes avec moins de
 *    colonnes. Ce qui manquait n'était pas une liste, c'était une lecture de
 *    COUVERTURE — et une liste bornée aux anomalies.
 *  · « Mes messages récents » → `RelationshipPulseCard` (#1409). Le détail des
 *    échanges reste dans Messagerie ; ici on mesure la dynamique.
 *
 * ⚠️ « MES RELANCES » EST PARTIE LE 16/09/2026, ET LE REFUS DE #1409 EST LEVÉ.
 *
 * Le refus disait : *« elle reste, parce qu'elle est le SEUL endroit du produit
 * où une relance se marque faite — retirer la carte aurait retiré la CAPACITÉ,
 * pas seulement l'affichage »*. Il était juste, et il n'a pas été contredit :
 * il a été RENDU SANS OBJET. `useCompleteRelance` a d'abord DÉMÉNAGÉ vers le
 * Centre d'actions (`features/actions/hooks/`), où la liste « Mes relances »
 * porte le même geste sur la même route (`PATCH /plan-items/:id`) ; la carte
 * part dans le MÊME commit. Migrer PUIS retirer, jamais l'inverse — c'est le
 * patron que #1508 a écrit pour les écritures CRM.
 *
 * ⚠️ UNE CARTE EST RESTÉE, ET C'EST DÉLIBÉRÉ.
 *  · « Mes priorités » : elle nomme la PROCHAINE ÉTAPE datée sur mes comptes,
 *    ce qu'aucun bloc de couverture ne dit — la couverture nomme un problème,
 *    la priorité nomme un geste.
 *
 * ⚠️ #2106.21/.22/.23 (24/09/2026, RÉFUTÉS ÉCRAN sur ce cockpit) — le bloc
 * compact « BellumAI a préparé pour toi » (`PreparedForYouBlock`) et les
 * quatre lignes cliquables « depuis ta dernière visite » (`SinceLastVisitBlock`)
 * existaient déjà, TESTÉS, mais seul `BriefingPage` (« Aujourd'hui ») les
 * montait : aucun appelant ne les posait ICI, sur `/dashboard`, l'écran que
 * l'épopée #2106 nomme. Montés ci-dessous, avec leurs PROPRES lectures
 * (`useDailyBriefing`, et les hooks internes de `SinceLastVisitBlock`) —
 * jamais un second calcul, même capacité, un appelant de plus (GA-26).
 */
export function PersonalCockpit() {
  const { t } = useTranslation('dashboard')
  const { t: tBriefing } = useTranslation('briefing')
  const { loading, error, data } = usePersonalCockpit()
  const dailyBriefing = useDailyBriefing()
  const dailyBriefingActions = dailyBriefing.data?.actions
  // #2106.32 — même lecture que `BriefingPage` : le compte de tâches ENCORE
  // ouvertes voyage jusqu'au résumé condensé de longue absence, jamais un
  // second calcul. Optional chaining obligatoire : `data` est absent tant que
  // la requête n'a pas répondu.
  const now = useNow()
  const openTasksCount = dailyBriefing.data?.tasks.state === 'ready' ? dailyBriefing.data.tasks.tasks.length : null
  // #2108.36 — « Agenda devient compact » : `AgendaCompact` (#2101.1/.2) existe
  // déjà et vit sur `/briefing` ; même garde que là-bas (`agendaServed`),
  // jamais un second calcul de ce que l'agenda sait dire (GA-26).
  const agendaServed = dailyBriefing.data?.agenda?.state === 'ready' || dailyBriefing.data?.agenda?.state === 'partial'
  const firstName = useFirstName() || t('fallback.userName')
  const perspective = data.perspective
  // #1406 — la porte vers le cockpit d'ÉQUIPE, et seulement pour qui l'ouvre.
  const { team } = useTeam()
  const canManageTeam = team ? hasPermission(team.workspace.role, 'team:manage') : false

  if (loading) {
    return (
      <div className="space-y-4">
        {/* #4298.1 — le squelette suit la rangée DENSE de `PersonalKpiRow`. */}
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map(item => (
            <DashboardSkeleton key={item} className="h-16 w-40" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <DashboardSkeleton className="h-[260px]" />
          <DashboardSkeleton className="h-[260px]" />
        </div>
      </div>
    )
  }

  // Défaut mesuré : un échec de calcul rendait « 0 compte, 0 relance, 0 en
  // retard » — un zéro qui MENT, pire qu'une erreur parce qu'il rassure à
  // tort un commercial qui lirait « rien à faire ». L'écran dit l'échec au
  // lieu de l'habiller en zéros (même principe que `perspective` plus bas :
  // ce qui n'a pas pu être lu se MASQUE ou se DIT, il ne se chiffre jamais).
  if (error) {
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('personal.loadError')}
        </Text>
      </Box>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col pb-8', SPACE_SCALE.section)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PersonalCockpitHeader
          firstName={firstName}
          withoutNextAction={perspective?.coverage.without_next_action ?? null}
        />
        {/* #1411 — la porte du copilote sur CET écran, avec une question rédigée
            pour lui. `inline` : `prominent` est réservé aux écrans de LISTE. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ⚠️ #1406 demandait de rendre la bascule « Moi / Équipe » plus
              explicite. Cette bascule N'EXISTE PLUS : la décision du 04/09 a
              retiré l'onglet Équipe de cet écran, parce qu'il rendait un second
              cockpit d'équipe — non gardé — à côté du vrai, qui vit sur `/team`
              derrière `team:manage` (GA-254).

              Le geste empêché survit à l'onglet, lui : « comment j'atteins le
              cockpit d'équipe ? ». La réponse est un LIEN, pas un onglet — un
              onglet promettrait deux vues du même écran, et c'est justement ce
              qu'on a retiré. Il ne s'affiche qu'à qui porte la permission :
              proposer une porte qui rend 403 est pire que ne rien proposer. */}
          {canManageTeam ? (
            // Sélecteur « Moi / Équipe » (décision Louis 23/10) : « Moi » est cet écran, « Équipe »
            // mène au cockpit d'équipe (`/team`, `team:manage`) — une porte, jamais un second cockpit.
            <div
              role="group"
              aria-label={t('perspective.scopeLabel')}
              className="inline-flex overflow-hidden rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-0.5 text-sm"
            >
              <span
                aria-current="page"
                className="inline-flex min-h-9 items-center rounded-md bg-[var(--accent-soft-bg)] px-3 font-medium text-[var(--accent-soft-text)] pointer-coarse:min-h-11"
              >
                {t('perspective.scopeMe')}
              </span>
              <Link
                to="/team"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
              >
                <Users2 className="size-4" aria-hidden />
                {t('perspective.teamLink')}
              </Link>
            </div>
          ) : null}
          <AskLaura label={t('perspective.askLabel')} question={t('perspective.askQuestion')} />
          {/* #2114.64 — même patron que le cockpit manager (`manager.json`
              `askLaura`, `ManagerDashboardPage.tsx:188` « Préparer ma revue
              d'équipe ») : un second point d'entrée Laura, tourné vers LA
              revue personnelle plutôt que celle de l'équipe. Même primitive
              (D44), un poids `inline` de plus — jamais un second moteur.

              ⚠️ RECETTE ÉCRAN DU 25/09/2026 : ce CTA disparaissait du DOM,
              ne laissant que la suggestion dans la bulle flottante. Cause :
              la course de #1812 (« le dernier monté gagne la bulle, son
              propre lien s'efface ») — montée APRÈS le CTA « Analyser mon
              activité » ci-dessus, cette instance gagnait systématiquement
              et s'effaçait. `alwaysVisible` (voir le docblock d'`AskLaura`)
              garde son lien même gagnant : un CTA d'en-tête fixe, à choix
              limité, ne dépend pas d'un ordre de montage pour rester
              visible. */}
          <AskLaura label={t('perspective.reviewLabel')} question={t('perspective.reviewQuestion')} alwaysVisible />
        </div>
      </div>

      {/* #4297.2 — « où j'en suis » AVANT le recul, visible sans défilement à
          1440×900 : tâches et actions (compteurs), planning (agenda), brouillons
          (ce que Laura a préparé), collègues (le lien d'équipe de l'en-tête).
          Rien n'est retiré, l'ORDRE change : le verdict et les sections du
          recul suivent.

          #1813 — `PersonalKpiRow` reste HORS repli : quelques nombres sur une
          seule ligne, c'est déjà la vue d'ensemble — la replier cacherait la
          seule chose qu'on peut lire sans cliquer. */}
      <PersonalKpiRow kpis={data.kpis} openTasks={openTasksCount} />

      {/* Refonte Théo (`.v18-grid` de today-jour) : le RECUL dans la colonne de travail,
          la JOURNÉE (planning, brouillons) dans la colonne d'appoint de 310 px. L'ordre
          du DOM reste compteurs → planning → brouillons → recul (#4297.2) ; seule la
          place à l'écran change au bureau (`lg:col-start-*`). */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19.5rem]">
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {/* #2108.36 — la journée d'agenda, en une ligne, au même format que
              `/briefing` (`AgendaCompact`, #2101.1/.2). Montée seulement quand la
              source a répondu (`agendaServed`) : un résumé sur une source muette
              compterait un silence comme une journée vide. */}
          {agendaServed && dailyBriefing.data ? (
            <div className="flex flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-5">
              <AgendaCompact
                events={dailyBriefing.data.agenda.events}
                now={now}
                protectedTime={dailyBriefing.data.protectedTime}
                agendaPreferences={dailyBriefing.data.agendaPreferences}
                labelled
              />
              {/* `.v18-card-head` « Agenda » : la journée complète vit sur Aujourd'hui. */}
              <Link
                to="/briefing"
                className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
              >
                {t('personal.agendaLink')}
              </Link>
            </div>
          ) : null}

          {/* #2106.21 / #4297.2 — les BROUILLONS prêts : sortis du repli « depuis
              ta dernière visite », où il fallait un clic pour les voir. Se masque
              seul tant que `useDailyBriefing` n'a rien à compter (jamais un bloc
              vide). Optional chaining OBLIGATOIRE (CLAUDE.md) : une API plus
              ancienne — ou, en test, un double générique qui rend `{}` — ne porte
              pas `actions` en tableau. `Array.isArray` plutôt que la seule
              troncature `data?.actions` : un `data` VRAI mais mal formé ne doit
              jamais faire lever `for...of` dans `PreparedForYouBlock`. */}
          {Array.isArray(dailyBriefingActions) ? <PreparedForYouBlock actions={dailyBriefingActions} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          {/* #2114.13/.14/.66/.70 — le verdict ouvre le RECUL ("je travaille bien
              mon portefeuille ?"). Se masque seul si la feature n'est pas portée
              par cet espace (même patron que `CommercialObjectivesCard`). */}
          <TrajectoryVerdict />

          {/* #4356.1 — LE RECUL EN PARCOURS GUIDÉ (`CockpitGuidedSteps`) : les
              blocs « voir plus » deviennent une suite d'étapes numérotées, chacune
              terminée par « Étape suivante ». Même contenu, mêmes ancres.

              #2106.22/.23 — étape 1 : les quatre lignes typées de ce qui a bougé
              depuis la dernière visite (cliquables vers l'écran filtré,
              `sinceLastVisitLineHref`).

              LE RECUL, en DEUX étapes (au lieu d'une seule) : chacune des tuiles
              de `PersonalKpiRow` mène à UNE carte précise via `COCKPIT_ANCHORS`
              (`revealTarget`), et une étape ne porte qu'UNE ancre — posée sur
              l'en-tête, toujours monté : la tuile amène la bonne étape à l'écran
              et lui donne le focus, qu'elle soit ouverte ou non. L'ancre
              « comptes » mène à la trajectoire, le bloc qui a remplacé « Mes
              comptes » (#1095/#1096 : un chiffre sans chemin est un défaut).

              Absent quand l'API est plus ancienne que le web : les DEUX étapes du
              recul se MASQUENT, elles ne s'affichent pas à zéro — « zéro compte
              silencieux » serait une bonne nouvelle qu'aucune mesure ne justifie.

              #1409 rouvert (16/09/2026) — dernière étape : « Mes relances » a
              rejoint le Centre d'actions ; le cockpit garde ses COMPTEURS de
              relances et n'en porte plus le GESTE (la décision datée). */}
          <CockpitGuidedSteps
            steps={[
              {
                key: 'sinceLastVisit',
                title: tBriefing('sinceLastVisit.title'),
                content: <SinceLastVisitBlock now={now} openTasksCount={openTasksCount} />,
              },
              ...(perspective
                ? [
                    {
                      key: 'trajectory',
                      title: t('sections.trajectory'),
                      anchor: COCKPIT_ANCHORS.accounts,
                      content: (
                        <div className="space-y-4">
                          <TrajectoryCard trajectory={perspective.trajectory} />
                          {/* #2114.16-.27 (lot FA) — la cible en regard des chiffres bruts
                              de `TrajectoryCard`. Requête indépendante (`/objectives/me/commercial`),
                              se masque seule si l'espace n'a pas la feature `manager_cockpit`. */}
                          <CommercialObjectivesCard />
                          <PortfolioCoverageCard coverage={perspective.coverage} />
                        </div>
                      ),
                    },
                    {
                      key: 'opportunities',
                      title: t('sections.opportunities'),
                      anchor: COCKPIT_ANCHORS.messages,
                      content: (
                        <div className="space-y-4">
                          <DormantOpportunitiesCard
                            opportunities={perspective.dormant}
                            provenance={perspective.coverage.provenance}
                          />
                          <RelationshipPulseCard pulse={perspective.relationship} />
                          <CockpitSeriesCard series={perspective.series} />
                        </div>
                      ),
                    },
                  ]
                : []),
              {
                key: 'priorities',
                title: t('sections.priorities'),
                anchor: COCKPIT_ANCHORS.relances,
                content: <MyPrioritiesCard priorities={data.priorities} />,
              },
            ]}
          />
        </div>
      </div>
    </motion.div>
  )
}
