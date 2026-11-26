import { hasPermission } from '@bellum/contracts'
import { Card, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAdvDossiers } from '@/features/adv/api'
import { useConnectedCapabilities } from '@/features/chat/hooks/useConnectedCapabilities'
import { collectionMonths, summarizeCollections, unmatchedPaymentsBucket } from '@/features/missions/collections'
import {
  useCollectionsWindow,
  useInvoicePayments,
  useInvoiceReadiness,
  useTimesheetMonth,
} from '@/features/missions/api'
import { useTeam } from '@/features/team/hooks/useTeam'
import { connectedManagementTool } from '@/lib/management-tool'
import { useDashboardChannels, useDashboardMargin, useFinanceTarget, useLegalEntities, useMetricSeries } from '../api'
import { FinancePanel } from '../view/FinancePanel'
import { financeActivity } from './finance-activity'
import { financeAlerts } from './finance-alerts'
import { averageDailyRate, financeMissionRevenue, financeRevenueByClient } from './finance-mission-revenue'
import { financeBilling } from './finance-billing'
import { collectionsToTreatByClient } from './finance-collections-clients'
import { defaultFinancePeriod, financePeriods, formatFinancePeriod, previousMonthOf } from './finance-period'
import { FinanceAdvBlock } from './FinanceAdvBlock'
import { FinanceBilling } from './FinanceBilling'
import { FinanceCollectionsToTreat } from './FinanceCollectionsToTreat'
import { FinanceFrame, FinanceRow } from './FinanceFrame'
import { FinanceRevenueByClient } from './FinanceRevenueByClient'
import { FinanceCollectionsSummary } from './FinanceCollectionsSummary'
import { FinanceEntityFilter } from './FinanceEntityFilter'
import { FinanceForecastHorizons } from './FinanceForecastHorizons'
import { FinancePoOverview } from './FinancePoOverview'
import { FinanceIntroducers } from './FinanceIntroducers'
import { FinanceManagementTool } from './FinanceManagementTool'
import { FinanceMissionRevenue } from './FinanceMissionRevenue'
import { FinanceRecentActivity } from './FinanceRecentActivity'
import { FinanceSnapshotDeltas } from './FinanceSnapshotDeltas'
import { FinanceTabs, type FinanceTab } from './FinanceTabs'
import { FinanceTargetRing } from './FinanceTargetRing'
import { FinanceTimesheetBands } from './FinanceTimesheetBands'
import { formatCents } from '@/lib/money'

/**
 * ÉCRAN FINANCE — `/pilotage/finance`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT VRAIMENT : UNE ADRESSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Neuf des dix-sept maquettes du dossier du 26/08 sont cet écran — « neuf
 * générations, la même structure ; c'est ce qui la valide ». Le calcul existait
 * (six lectures financières testées) et l'affichage aussi (`FinancePanel`,
 * monté sur `/pilotage` depuis le 22/08). Ce qui n'existait pas, c'est une
 * ROUTE : un écran sans adresse ne se partage pas par lien, aucune notification
 * ne peut y pointer, et il faut savoir qu'il est en bas du cockpit pour le
 * trouver.
 *
 * Ce fichier NE RECODE DONC RIEN. Il monte le panneau existant, avec ses
 * invariants intacts — quatre chiffres d'affaires jamais fondus, marge `null`
 * et jamais 0, prévisionnel en trois lignes non pondérées, « réservé aux
 * responsables » plutôt qu'« indisponible » — et il ajoute autour ce que le
 * panneau ne pouvait pas porter tout seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. LA PÉRIODE, VISIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le seul défaut que le dossier qualifie de GRAVE : « aucun sélecteur de
 * période visible. Un écran financier dont on ne voit pas la période se lit de
 * travers dès qu'il est partagé ou exporté. » Le panneau interrogeait le
 * serveur sans mois et affichait donc, sans le dire, le mois précédent.
 *
 * Il rejette aussi sa forme lourde — « le sélecteur de période en grande carte
 * coûte une rangée entière » — d'où une liste déroulante dans la barre
 * d'outils.
 *
 * ⚠️ Et il DIT ce que la période ne gouverne pas. Trois des six lectures n'ont
 * pas de mois : le prévisionnel regarde devant, la capacité décrit le mois en
 * cours, le délai de paiement est une médiane sur tout l'historique. Une
 * période affichée en haut d'un écran promet qu'elle vaut pour tout ce qui est
 * dessous ; là où c'est faux, il faut l'écrire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. LES DEUX BANDES DU BAS — ET C'EST UN REVIREMENT DATÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La structure validée par les neuf générations est « quatre blocs en carré,
 * plus une bande en bas ». Quatre bandes ont été proposées ; le dossier du
 * 26/08 en retenait UNE et rejetait les trois autres :
 *
 *  - RETENUE — des alertes avec leur montant et un lien : « 67 factures
 *    manquantes · 98 420 € · voir. C'est la seule variante qui transforme un
 *    chiffre en file de travail » ;
 *  - rejetée — le journal d'activité récente : « un journal ne fait prendre
 *    aucune décision » ;
 *  - rejetée — les actions IA suggérées : « elles mélangent des sujets
 *    commerciaux sur un écran finance » ;
 *  - rejetée — la bannière marketing (« de la copie sans destinataire ni
 *    geste ») et l'invitation permanente à Laura (« Laura se tait quand elle
 *    n'a rien à dire »).
 *
 * ⚠️ **Louis a levé le refus du journal le 31/08/2026 — et la bande d'activité
 * arrive EN PLUS, jamais à la place.** Le raisonnement d'origine était juste
 * *contre* la bande d'alertes, qui reste au-dessus et reste l'élément le mieux
 * tenu du dossier ; ce que le journal ajoute est une autre question, « est-ce
 * que ça bouge ? », et un tableau de bord immobile ressemble à un tableau de
 * bord en panne. Les deux autres bandes rejetées le restent.
 *
 * La bande d'alertes garde la correction que le dossier apporte à sa propre
 * variante : « ces alertes reprennent exactement les compteurs du bloc
 * au-dessus. → Le bloc dit l'état, la bande dit ce que je fais aujourd'hui —
 * triée par gravité, cinq maximum, et elle annonce ce qu'elle replie. » C'est
 * pourquoi elle est nourrie par les BLOQUEURS de facturation (qui portent
 * chacun leur geste et son écran) et non par les chiffres du panneau.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 3. L'ANNEAU « TAUX DE RÉALISATION » — REVIREMENT DATÉ, AVEC SES GARDES
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Ce paragraphe disait l'inverse jusqu'au 31/08/2026**, et il avait
 * raison de le dire : les maquettes montrent un anneau contre un objectif
 * mensuel de 350 000 € « qui n'existe dans aucune table », et « l'inventer pour
 * dessiner un cercle serait de la donnée fabriquée ».
 *
 * **Louis a levé ce refus le 31/08/2026, dans une forme précise : l'objectif
 * devient un RÉGLAGE saisissable par espace** (`finance_margin_targets`, un
 * objectif par mois). La cible cesse d'être notre invention et devient la
 * décision de l'ESN — la seule personne qui puisse la prendre.
 *
 * Trois moitiés du refus TIENNENT, et elles sont le cœur du lot :
 *  - sans objectif saisi, l'anneau dit « objectif non défini » et n'affiche
 *    AUCUN pourcentage. Jamais 0 %, jamais un objectif par défaut ;
 *  - **aucun orange.** « L'orange dit “c'est mauvais”. Mauvais par rapport à
 *    quoi ? » La couleur se dérive de l'objectif SAISI (atteint / pas encore),
 *    jamais d'un seuil deviné ;
 *  - un objectif ne rend pas une marge mesurable : sous le seuil, l'anneau se
 *    tait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 4. « APPORTS D'AFFAIRES » — REVIREMENT DATÉ, DEMI-REFUS CONSERVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ **Ce paragraphe disait l'inverse jusqu'au 31/08/2026.** La variante 3
 * écrit « – Marge Crème » là où il fallait « = » ; le dossier en tire « le
 * signe change tout le sens de la ligne. Une ligne de résultat se calcule, elle
 * ne se compose jamais. »
 *
 * **Louis a levé le refus le 31/08/2026.** La moitié qui tient est la plus
 * importante : la ligne de résultat est **LUE du serveur**, jamais soustraite à
 * l'écran — `= marge nette` affiche la marge du canal intermédié telle que
 * `marginByChannel` l'a calculée, pondérée par les jours. Voir
 * `FinanceIntroducers`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 5. LE FILTRE PAR SOCIÉTÉ — LIVRÉ DÉSACTIVÉ LE 31/08, ACTIF LE 01/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le refus d'origine était juste, et il est cité en entier dans
 * `FinanceEntityFilter` : « aucune des six lectures financières ne prend de
 * société en paramètre ; livrer le sélecteur actif aurait donné un contrôle qui
 * change le libellé et pas les chiffres ». Ce qui manquait n'était pas une
 * décision, c'était une clause SQL — `legalEntityClause` (contrats), jumelle de
 * `financeScopeClause`, écrite une fois et lue par neuf requêtes.
 *
 * QUATRE lectures la reçoivent : les quatre chiffres d'affaires, la marge
 * d'espace **et ses alertes**, la marge par canal, et les deux lignes
 * contractualisées du prévisionnel. TROIS ne peuvent pas, et l'écran le DIT
 * dès qu'une société est choisie (`FINANCE_ENTITY_BLIND_READS`) — un bloc qui
 * ne bouge pas se lit comme une panne.
 *
 * ⚠️ Le nom vient du produit, pas de la maquette : « Toutes les BU » n'existe
 * pas ici. `'bu'` d'`ACCOUNT_ENTITY_KINDS` est une division du compte CLIENT ;
 * la portée transverse de l'ESN s'appelle une SOCIÉTÉ (`legal_entities`, D9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 6. « VOIR TOUTE L'ACTIVITÉ » MÈNE QUELQUE PART (01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bouton portait `seeAllHref={null}` avec une raison exacte : aucun écran ne
 * montre l'union des trois familles d'événements. La conclusion était juste et
 * incomplète — le seul endroit qui montre cette union est CET écran, où elles
 * sont déjà réunies, triées et datées. Elles étaient simplement JETÉES après le
 * plafond de cinq. La bande les déplie sur place, sans requête de plus, donc
 * sans élargir la population en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 7. LA MARGE PRÉVISIONNELLE — LA MOITIÉ QUI SE MESURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle était « non mesurée », et la raison écrite au registre disait vrai pour
 * la ligne ESPÉRÉE : le pipe n'a aucun coût, et lui prêter la marge des autres
 * serait une hypothèse déguisée en mesure. Elle disait faux pour les deux
 * autres : `acquis` et `probable` sont des missions SIGNÉES, dont le TJM et le
 * coût chargé sont saisis. Le prévisionnel porte donc désormais la marge de sa
 * part CONTRACTUALISÉE, nommée pour ce qu'elle est, et rien n'y est pondéré par
 * une chance de signature — voir `MissionScoresService.contractedMargin`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE REFUSÉ, ET NE SE RE-LITIGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **aucune émission de facture**, aucun brouillon, aucune numérotation
 *    (reconfirmé par Louis le 31/08/2026) — d'où « facture envoyée » absent de
 *    la bande d'activité, et NOMMÉ absent ;
 *  - **aucun IBAN, aucun ordre de virement** ;
 *  - **aucune probabilité** présentée comme une chance ;
 *  - **« paiements effectués 0,4 % »**, encadré sur cinq maquettes et faux par
 *    construction : rien de tel n'est affiché ici, et le seuil sous lequel un
 *    taux n'est pas mesurable est déjà tenu, indicateur par indicateur, par
 *    `measurability` (le délai de paiement, le taux d'intercontrat et la marge
 *    d'espace se taisent chacun sous SON seuil, nommé à l'écran).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 8. LE SUIVI FINANCIER — #2564 (18/09/2026), REVIREMENT PARTIEL DE #2197
 * ─────────────────────────────────────────────────────────────────────────────
 * Arbitrage Louis, après le call bêta de François Thomas : « BellumAI SUIT le
 * financier, il ne COMPTABILISE pas. » Trois lectures de plus, aucune écriture
 * comptable :
 *
 *  - **CA par mission** (`FinanceMissionRevenue`) — la MÊME lecture que la
 *    bande de bloqueurs (`GET /delivery/invoice-readiness`), juste montrée
 *    ligne par ligne plutôt que groupée par bloqueur. Ne duplique pas
 *    `/missions/suivi` (la grande table CRA + marge + routines, D-22-2 /
 *    31/08/2026) : une seule colonne de fond, le CA ;
 *  - **encaissements** (`FinanceCollectionsSummary`) — la MÊME dérivation
 *    que `/missions/encaissements` (`summarizeCollections`,
 *    `@/features/missions/collections`), totalisée en quatre seaux avec un
 *    lien vers le détail, plus un CINQUIÈME (« non rapproché », #2419.9) —
 *    une source à part, les paiements CONSTATÉS (#2419.1) non rattachés ;
 *  - **l'outil de gestion connecté** (`FinanceManagementTool`) — nommé par
 *    injection s'il est branché (doctrine `tool-naming.ts`), jamais en dur.
 *    Aucune lecture financière n'en découle : recherché avant d'écrire une
 *    ligne, aucun chemin du dépôt ne fait remonter un chiffre financier
 *    depuis l'ERP de l'ESN — le bloc le DIT plutôt que d'inventer une lecture.
 *
 * La MARGE, elle, existe déjà et n'est pas recalculée : `FinancePanel`
 * l'affiche (agrégat + alertes par mission). ⚠️ Ce que ce chiffre mesure au
 * fond est la marge COMMERCIALE (`aggregateMargin` → `missionMargin`, sans les
 * « autres coûts validés » qui nourrissent la marge BRUTE du moteur à trois
 * niveaux de `MissionMarginEngine` — commercial / brute / contribution) : le
 * diagnostic et l'alerte de seuil de CET écran portent donc bien sur la
 * marge commerciale, même si son libellé existant (`grossMarginExplanation`)
 * dit « brute ». Ni recalculée ni relabellée ici — hors périmètre de ce
 * lot — mais nommée pour ce qu'elle EST dans ce commentaire, comme demandé.
 */
export function FinanceScreen() {
  const { t, i18n } = useTranslation(['pilotage', 'missions', 'adv'])
  const [month, setMonth] = useState(() => defaultFinancePeriod(new Date()))
  /**
   * LA SOCIÉTÉ CHOISIE — `null` = toutes, et c'est le défaut.
   *
   * L'état vit ICI et nulle part ailleurs (GA-26) : le sélecteur le lit, le
   * panneau le reçoit, les quatre lectures filtrables le portent dans leur clé
   * de cache. Le poser dans le panneau aurait donné deux sources à la même
   * question dès qu'un second bloc a voulu la connaître — l'export l'a voulue
   * dans la même heure.
   */
  const [legalEntityId, setLegalEntityId] = useState<string | null>(null)
  // Les quatre lectures sont de VRAIS onglets : un seul est visible à la fois (Théo D, 23/10/2026).
  const [tab, setTab] = useState<FinanceTab>('carnet')
  const months = useMemo(() => financePeriods(new Date()), [])
  const previousMonth = previousMonthOf(month)

  const readiness = useInvoiceReadiness(month)
  const margin = useDashboardMargin(month, legalEntityId)
  const channels = useDashboardChannels(month, legalEntityId)
  const timesheets = useTimesheetMonth(month)
  const adv = useAdvDossiers({ month })
  const target = useFinanceTarget(month)
  const series = useMetricSeries(12)
  const entities = useLegalEntities()
  const { team } = useTeam()

  // #2564.3 — LA FENÊTRE D'ENCAISSEMENT, la même que `/missions/encaissements`
  // (`collectionMonths`/`useCollectionsWindow`, `@/features/missions/**`) : ce
  // bloc ne recalcule rien, il lit le MÊME agrégat que l'écran opérationnel.
  const now = useMemo(() => new Date(), [])
  const collectionsMonths = useMemo(() => collectionMonths(now), [now])
  const collectionsWindow = useCollectionsWindow(collectionsMonths)
  // ⚠️ Un espace SANS AUCUNE facture sur la fenêtre est un état VRAI (quatre
  // seaux à zéro), pas un échec : `summarizeCollections` se calcule donc
  // même sur un tableau vide — seul le CHARGEMENT retient l'agrégat.
  const collectionsSummary = useMemo(
    () => (collectionsWindow.isLoading ? null : summarizeCollections(collectionsWindow.items, now)),
    [collectionsWindow.items, collectionsWindow.isLoading, now],
  )

  // #2419.9 — LE SEAU « NON RAPPROCHÉ » : une requête À PART (`GET
  // /delivery/payments`), jamais recalculée depuis `collectionsSummary`. Son
  // échec ne doit pas effacer les quatre seaux au-dessus — deux lectures
  // indépendantes, deux états de chargement indépendants.
  const payments = useInvoicePayments()
  const unmatchedBucket = useMemo(
    () => (payments.isLoading ? null : unmatchedPaymentsBucket(payments.data?.unmatched ?? [])),
    [payments.data, payments.isLoading],
  )

  // #2564.4 — L'OUTIL DE GESTION branché par le client (`family: 'ats'`,
  // BoondManager) : nommé par INJECTION s'il est connecté, jamais écrit en
  // dur (`tool-naming.ts`). Aucune lecture financière n'en découle encore —
  // voir `FinanceManagementTool.tsx`.
  const capabilities = useConnectedCapabilities()
  const managementTool = connectedManagementTool(capabilities.tools)?.name ?? null

  // Le nom de la société, pour l'export et pour ce que l'écran ÉCRIT. Résolu
  // ici, où la liste est déjà chargée : le redemander plus bas ferait descendre
  // la liste entière dans des composants qui n'en ont aucun autre usage.
  const selectedEntity = entities.data?.items.find(entity => entity.id === legalEntityId) ?? null

  // Le droit d'ÉCRIRE l'objectif — `finance:write`, exactement la permission qui
  // règle déjà le seuil d'alerte de marge. Sans lui, l'anneau se lit et le
  // formulaire disparaît : montrer un champ qui rendra 403 est pire que rien.
  const canEditTarget = team ? hasPermission(team.workspace.role, 'finance:write') : false

  const alerts = useMemo(() => financeAlerts(readiness.data?.items ?? []), [readiness.data])
  // #2564.1 — LE CA PAR MISSION : la MÊME lecture que la bande de bloqueurs
  // au-dessus (`readiness.data.items`), juste ordonnée pour être lue ligne à
  // ligne. Aucune requête de plus.
  const missionRevenue = useMemo(() => financeMissionRevenue(readiness.data?.items ?? []), [readiness.data])
  const activity = useMemo(
    () => financeActivity({ adv: adv.data?.items ?? null, timesheets: timesheets.data?.items ?? null }),
    [adv.data, timesheets.data],
  )
  const monthLabel = formatFinancePeriod(month, i18n.language)
  // L4 — les rangées FACTURATION et MARGE ET CA lisent la même lecture que le CA
  // par mission : on la dérive, on ne la redemande pas.
  const billing = useMemo(() => financeBilling(readiness.data?.items ?? []), [readiness.data])
  const revenueByClient = useMemo(() => financeRevenueByClient(missionRevenue.rows), [missionRevenue])
  const dailyRate = useMemo(() => averageDailyRate(readiness.data?.items ?? []), [readiness.data])
  const toTreat = useMemo(
    () => collectionsToTreatByClient(collectionsWindow.items, now),
    [collectionsWindow.items, now],
  )
  const monthPeriod = t('finance.period.month', { month: monthLabel })
  const previousLabel = formatFinancePeriod(previousMonth, i18n.language)

  // Les deux canaux de la ligne « Apports d'affaires », résolus UNE fois : trois
  // `find` répétés dans le JSX auraient été trois occasions de se tromper de
  // canal, et le sens de la ligne dépend entièrement de ce choix.
  const direct = channels.data?.byChannel.find(entry => entry.channel === 'direct')
  const partner = channels.data?.byChannel.find(entry => entry.channel === 'partner')

  return (
    <>
      <div className="py-4">
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex items-center gap-2">
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('finance.screen.period')}
            </Text>
            {/* `pointer-coarse:min-h-11` : 44 px au DOIGT (GA-30). Un
                sélecteur de période est le contrôle qu'on touche le plus
                souvent sur un téléphone. */}
            <SelectField
              value={month}
              onChange={next => setMonth(next)}
              options={months.map(value => ({ value: value, label: formatFinancePeriod(value, i18n.language) }))}
              size="sm"
            />
          </label>

          {/* La portée par SOCIÉTÉ — ACTIVE depuis le 01/09/2026. Voir `FinanceEntityFilter`. */}
          <FinanceEntityFilter
            entities={entities.data?.items ?? []}
            loading={entities.isLoading}
            value={legalEntityId}
            onChange={setLegalEntityId}
          />

          {/* Ce que la période ne gouverne PAS — et chaque bloc le redit sous
              son titre (L4, 14/10/2026). */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('finance.screen.outOfPeriod')}
          </Text>
        </div>

        <div className="mt-6">
          <FinanceTabs tab={tab} onChange={setTab} />
        </div>

        <div
          role="tabpanel"
          id="finance-panel-encaissements"
          aria-label={t('finance.tabs.encaissements')}
          hidden={tab !== 'encaissements'}
        >
          {/* ───────────── RANGÉE 1 — ENCAISSEMENTS ─────────────
            L4 (14/10/2026) : la page comptait ~20 blocs ; Louis veut QUATRE
            rangées lisibles. Encaissé / reste dû / en retard (avec ancienneté) /
            DSO, puis les lignes à traiter groupées par client. */}
          <FinanceRow
            rowKey="collections"
            title={t('finance.rows.collections.title')}
            hint={t('finance.rows.collections.hint')}
          >
            <div className="flex flex-col gap-6">
              <FinanceFrame
                title={t('finance.collections.title')}
                hint={t('finance.collections.hint')}
                period={t('finance.collections.period')}
              >
                <FinanceCollectionsSummary
                  summary={collectionsSummary}
                  canReadFinance={collectionsWindow.canReadFinance}
                  loading={collectionsWindow.isLoading}
                  failed={collectionsWindow.failedMonths === collectionsMonths.length && collectionsMonths.length > 0}
                  unmatched={unmatchedBucket}
                  unmatchedLoading={payments.isLoading}
                  unmatchedFailed={payments.isError}
                />
                {collectionsWindow.canReadFinance && !collectionsWindow.isLoading ? (
                  <FinanceCollectionsToTreat data={toTreat} />
                ) : null}
              </FinanceFrame>
              <FinancePanel month={month} legalEntity={selectedEntity} only={['dso']} />
            </div>
          </FinanceRow>
        </div>
        <div role="tabpanel" id="finance-panel-carnet" aria-label={t('finance.tabs.carnet')} hidden={tab !== 'carnet'}>
          {/* ───────────── RANGÉE 2 — FACTURATION ───────────── */}
          <FinanceRow rowKey="billing" title={t('finance.rows.billing.title')} hint={t('finance.rows.billing.hint')}>
            <FinanceFrame title={t('finance.billing.title')} hint={t('finance.billing.hint')} period={monthPeriod}>
              <FinanceBilling
                billing={billing}
                managementTool={managementTool}
                loading={readiness.isLoading}
                failed={readiness.isError}
              />
            </FinanceFrame>
          </FinanceRow>
        </div>
        <div role="tabpanel" id="finance-panel-marge" aria-label={t('finance.tabs.marge')} hidden={tab !== 'marge'}>
          {/* ───────────── RANGÉE 3 — MARGE ET CA ───────────── */}
          <FinanceRow rowKey="margin" title={t('finance.rows.margin.title')} hint={t('finance.rows.margin.hint')}>
            <div className="flex flex-col gap-6">
              <FinanceFrame period={monthPeriod}>
                <FinanceTargetRing
                  month={month}
                  target={target.data}
                  marginPercent={margin.data?.marginPercent}
                  measurable={margin.data?.measurability?.measurable}
                  canEdit={canEditTarget}
                  loading={target.isLoading || margin.isLoading}
                />
              </FinanceFrame>
              <FinancePanel month={month} legalEntity={selectedEntity} only={['revenue', 'margin']} header="toolbar" />
              <FinanceFrame
                title={t('finance.missionRevenue.title')}
                hint={t('finance.missionRevenue.hint', { month: monthLabel })}
                period={monthPeriod}
              >
                <FinanceMissionRevenue
                  items={readiness.isError ? null : missionRevenue.rows}
                  loading={readiness.isLoading}
                  failed={readiness.isError}
                />
              </FinanceFrame>
              <FinanceFrame
                title={t('finance.revenueByClient.title')}
                hint={t('finance.revenueByClient.hint')}
                period={monthPeriod}
              >
                {readiness.isLoading ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('loading')}
                  </Text>
                ) : readiness.isError ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('finance.unavailable')}
                  </Text>
                ) : (
                  <FinanceRevenueByClient byClient={revenueByClient} rate={dailyRate} />
                )}
              </FinanceFrame>
            </div>
          </FinanceRow>
        </div>
        <div role="tabpanel" id="finance-panel-adv" aria-label={t('finance.tabs.adv')} hidden={tab !== 'adv'}>
          {/* ───────────── RANGÉE 4 — DÉTAIL (replié) ─────────────
            Tout le reste, INCHANGÉ : on regroupe, on replie, on ne supprime
            rien. Un `<details>` natif garde le contenu dans le DOM et sait se
            tabuler au clavier. */}
          <section data-finance-row="detail" className="mt-8">
            <details className="group rounded-lg border border-[var(--bellum-border)] p-4">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-base font-semibold text-[var(--bellum-text-primary)]">
                {t('finance.rows.detail.title')}
                <Text size="xs" className="font-normal text-[var(--bellum-text-muted)]">
                  {t('finance.rows.detail.hint')}
                </Text>
              </summary>

              <div className="mt-4 grid gap-6 md:grid-cols-2">
                <FinanceFrame period={monthPeriod}>
                  <FinanceIntroducers
                    directPercent={direct?.marginPercent}
                    commissionPoints={channels.data?.intermediationCost}
                    netPercent={partner?.marginPercent}
                  />
                </FinanceFrame>
                <FinanceFrame
                  title={t('finance.snapshot.title')}
                  hint={t('finance.snapshot.hint')}
                  period={t('finance.period.versus', { month: monthLabel, previous: previousLabel })}
                >
                  <FinanceSnapshotDeltas
                    series={series.data}
                    month={month}
                    previousMonth={previousMonth}
                    previousLabel={previousLabel}
                    loading={series.isLoading}
                    failed={series.isError}
                  />
                </FinanceFrame>
              </div>

              <FinancePanel month={month} legalEntity={selectedEntity} only={['forecast', 'capacity', 'channels']} />

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Card className="p-4">
                  <FinanceFrame
                    title={t('finance.timesheets.title')}
                    hint={t('finance.timesheets.hint')}
                    period={monthPeriod}
                    action={
                      <Link
                        to="/missions/cra"
                        aria-label={t('finance.detailAria', { title: t('finance.timesheets.title') })}
                        className="shrink-0 rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
                      >
                        {t('finance.detail')}
                      </Link>
                    }
                  >
                    <FinanceTimesheetBands
                      summary={timesheets.data?.summary}
                      loading={timesheets.isLoading}
                      failed={timesheets.isError}
                    />
                  </FinanceFrame>
                </Card>

                <Card className="p-4">
                  <FinanceFrame
                    title={t('finance.adv.title')}
                    hint={t('finance.adv.hint')}
                    period={monthPeriod}
                    action={
                      <Link
                        to="/missions/adv"
                        aria-label={t('finance.detailAria', { title: t('finance.adv.title') })}
                        className="shrink-0 rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
                      >
                        {t('finance.detail')}
                      </Link>
                    }
                  >
                    <FinanceAdvBlock
                      summary={adv.data?.summary}
                      previousLabel={previousLabel}
                      loading={adv.isLoading}
                      failed={adv.isError}
                    />
                  </FinanceFrame>
                </Card>
              </div>

              {/* L'outil de gestion ne porte aucun chiffre : pas de période à dire. */}
              <Card className="mt-6 p-4">
                <Text size="sm" weight="semibold">
                  {t('finance.managementTool.title')}
                </Text>
                <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
                  {t('finance.managementTool.hint')}
                </Text>
                <div className="mt-3">
                  <FinanceManagementTool connectedName={managementTool} loading={capabilities.isLoading} />
                </div>
              </Card>

              {/* #2425 — le prévisionnel par horizon : il porte son propre sélecteur d'horizon. */}
              <Text
                size="xs"
                weight="medium"
                data-period-label
                className="mt-6 block text-[var(--bellum-text-secondary)]"
              >
                {t('finance.period.ahead')}
              </Text>
              <FinanceForecastHorizons />

              {/* #2783 — le volume de bons de commande à l'échelle de l'espace. */}
              <Text
                size="xs"
                weight="medium"
                data-period-label
                className="mt-6 block text-[var(--bellum-text-secondary)]"
              >
                {t('finance.period.today')}
              </Text>
              <FinancePoOverview />

              <Card className="mt-6 p-4">
                <FinanceFrame title={t('finance.alerts.title')} hint={t('finance.alerts.hint')} period={monthPeriod}>
                  {readiness.isLoading ? (
                    <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                      {t('loading')}
                    </Text>
                  ) : readiness.isError ? (
                    // Distinguer l'échec du vide : « aucune alerte » et « je n'ai pas
                    // pu regarder » appellent deux gestes différents.
                    <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                      {t('finance.unavailable')}
                    </Text>
                  ) : alerts.shown.length === 0 ? (
                    <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                      {t('finance.alerts.empty', { month: monthLabel })}
                    </Text>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {alerts.shown.map(alert => (
                        <li
                          key={alert.blocker}
                          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2 last:border-b-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <Text size="sm" weight="medium">
                              {t(`missions:readiness.blockers.${alert.blocker}`, { defaultValue: alert.blocker })}
                            </Text>
                            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                              {t('finance.alerts.missions', { count: alert.missions })}
                              {' · '}
                              {/* Jamais « 0 € » : un montant inconnu est INCONNU. */}
                              {alert.amountCents === null
                                ? t('finance.alerts.amountUnknown')
                                : formatCents(alert.amountCents)}
                              {alert.withoutAmount > 0
                                ? ` · ${t('finance.alerts.floor', { count: alert.withoutAmount })}`
                                : ''}
                            </Text>
                          </div>
                          {alert.route ? (
                            <Link to={alert.route} className="text-sm text-[var(--bellum-text-accent)] underline">
                              {t('finance.alerts.see')}
                            </Link>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {alerts.hidden > 0 ? (
                    <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
                      {t('finance.alerts.folded', { count: alerts.hidden })}
                    </Text>
                  ) : null}
                </FinanceFrame>
              </Card>

              {/* La SECONDE bande, sous la première et jamais à sa place — voir §2. */}
              <Text
                size="xs"
                weight="medium"
                data-period-label
                className="mt-6 block text-[var(--bellum-text-secondary)]"
              >
                {monthPeriod}
              </Text>
              <FinanceRecentActivity
                items={activity.shown}
                all={activity.all}
                hidden={activity.hidden}
                loading={adv.isLoading || timesheets.isLoading}
                failed={adv.isError && timesheets.isError}
              />
            </details>
          </section>
        </div>
      </div>
    </>
  )
}
