import {
  ADV_BLOCKER_ACTIONS,
  ADV_TILES,
  advAgeDays,
  type AdvBlocker,
  type AdvDossier,
  type AdvSummary,
  type AdvTile,
} from '@bellum/contracts'
import { Badge, Box, Button, chipClassName, Input, Progress, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { toast } from 'sonner'
import { downloadCSV } from '@/lib/export-csv'
import { type DataExitGrant, useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { advApi, useAccountEntities, useAdvDossiers, useUpdateAdvDossier } from '../api'

/**
 * ADMINISTRATION DES VENTES — ce qui empêche un dossier de démarrer ou d'être
 * reconduit, et où on le répare.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES QUE CET ÉCRAN TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Aucun chiffre ne s'invente.** Deux tuiles de la maquette n'ont pas de
 *    source dans le dépôt — « en négociation » (le modèle n'a pas cet état) et
 *    les deltas mensuels (aucune photo mensuelle n'existe). Elles s'affichent,
 *    et elles disent « non mesuré » avec leur raison. Les retirer laisserait
 *    croire qu'on ne s'est jamais posé la question ; y écrire un chiffre
 *    plausible serait pire — un tableau de bord ADV entièrement crédible et
 *    entièrement faux.
 * 2. **Chaque pastille MÈNE quelque part.** Elle filtre la file d'un clic, et
 *    chaque ligne porte le lien de l'écran où le motif se répare
 *    ({@link ADV_BLOCKER_ACTIONS}). Un indicateur de qualité qui ne mène nulle
 *    part se regarde une fois et ne se regarde plus.
 * 3. **Un stock à zéro reste NEUTRE.** Une pastille à zéro ne se colore pas en
 *    vert : sur un espace où personne n'a rien saisi, le vert dirait « rien à
 *    faire » et personne n'irait vérifier. Le faux vert est le plus dangereux
 *    des affichages.
 *
 * ⚠️ Le résumé vient du SERVEUR et porte sur la population ENTIÈRE ; seule la
 * liste est filtrée. Recalculer les pastilles sur les lignes affichées les
 * remettrait toutes à zéro dès qu'on en clique une.
 */
export function AdvPage() {
  const { t, i18n } = useTranslation('adv')
  // #2081.14 — l'export CSV est une SORTIE de données : masqué quand la règle
  // d'espace « qui peut exporter » le réserve aux administrateurs (décidé par
  // l'API, qui refuse aussi la route elle-même).
  const dataExit = useDataExit()
  const [month, setMonth] = useState('')
  const [tile, setTile] = useState<AdvTile>('all')
  const [blocker, setBlocker] = useState<AdvBlocker | null>(null)
  const [search, setSearch] = useState('')
  const [repairing, setRepairing] = useState<AdvDossier | null>(null)

  const query = {
    ...(month ? { month } : {}),
    ...(tile !== 'all' && tile !== 'in_negotiation' ? { tile } : {}),
    ...(blocker ? { blocker } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  }
  const { data, isLoading, isError } = useAdvDossiers(query)
  const now = new Date()

  return (
    <CustomerPage titleInScreen pageTitle={t('title')}>
      <Box className="space-y-4 py-4">
        {/* #1829 — « supprime ce titre ». Même défaut que #1826 sur les
            relevés : la phrase était un sous-titre ORPHELIN, posée tout en
            haut du corps sans aucun titre au-dessus d'elle — l'onglet actif
            (« ADV ») nomme déjà l'écran, donc `PageHeader` masque son propre
            titre ici. Réutiliser `t('title')` (« Administration des ventes »)
            aurait été acceptable (il diffère du libellé abrégé de l'onglet),
            mais la phrase elle-même porte déjà, dans sa première moitié, une
            description plus précise du bloc qu'elle explique — on la découpe
            donc en un titre (la première phrase) et sa légende (la seconde,
            qui donne la maille exacte de la liste) plutôt que d'empiler un
            troisième libellé. Rien n'est supprimé. */}
        <Box className="flex flex-col gap-1">
          {/* #2456 — `element="h1"` : le titre de l'écran était DÉJÀ là, visible,
              mais rendu en `<p>`. L'entête de page se tait quand la barre d'onglets
              nomme déjà l'endroit (loi 4 du tome 7), si bien que le document n'avait
              aucun titre de niveau 1. Seule la balise change : rien ne bouge à l'œil. */}
          <Text element="h1" size="lg" weight="semibold">
            {t('heading')}
          </Text>
          <Text size="sm" color="text-muted-foreground">
            {t('subtitle')}
          </Text>
        </Box>

        <Box display="flex" className="flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month || (data?.month ?? '')}
            onChange={event => setMonth(event.target.value)}
            className="w-40"
            aria-label={t('monthLabel')}
          />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full sm:w-64"
            aria-label={t('searchLabel')}
          />
          {dataExit.grant ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!data || data.items.length === 0}
              onClick={() => dataExit.grant && void downloadCsv(query, data?.month, dataExit.grant)}
            >
              {t('export')}
            </Button>
          ) : null}
        </Box>

        {isError ? (
          // Une erreur se REMARQUE ; une liste vide se croit. Sans ce message,
          // une panne de lecture s'afficherait « aucun dossier à traiter » —
          // exactement le silence que cet écran existe pour rompre.
          <Box className="rounded-md border border-[var(--danger-soft-border)] bg-[var(--danger-soft)] p-3">
            <Text size="sm" color="text-[var(--danger-soft-text)]">
              {t('loadFailed')}
            </Text>
          </Box>
        ) : isLoading || !data ? (
          // Aucun chiffre pendant le chargement : « 0 dossier bloqué » le temps
          // d'une requête fait refermer l'onglet avant que la vérité arrive.
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : (
          <>
            {data.renewalsTruncated ? (
              // ⚠️ `DeliveryService.list` plafonne sa source à 200 missions,
              // SANS pagination : sur un espace plus grand, la file mentirait
              // par omission — « aucun renouvellement à traiter » se lirait
              // « tout va bien » sur des dossiers qu'on ne voit simplement
              // plus. Jamais un silence.
              <Box className="rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft)] p-3">
                <Text size="sm" color="text-[var(--warning-soft-text)]">
                  {t('renewalsTruncated')}
                </Text>
              </Box>
            ) : null}

            <Box className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {ADV_TILES.map(name => (
                <Tile
                  key={name}
                  name={name}
                  summary={data.summary}
                  active={tile === name}
                  onSelect={() => {
                    setTile(name)
                    setBlocker(null)
                  }}
                />
              ))}
            </Box>

            <Box>
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('qualityTitle')}
              </Text>
              {/* Le GRAPHE montre, les PASTILLES filtrent — deux rendus de la
                  même donnée (`summary.byBlocker`), à dessein : l'histogramme
                  de la maquette (16-finance-v6.png) n'a pas de geste, c'est
                  pour ça qu'il ne remplace pas les pastilles cliquables. */}
              <BlockerHistogram entries={data.summary.byBlocker} />
              <Box display="flex" className="mt-2 flex-wrap gap-2">
                {data.summary.byBlocker.map(entry => (
                  <QualityChip
                    key={entry.blocker}
                    blocker={entry.blocker}
                    count={entry.count}
                    active={blocker === entry.blocker}
                    onSelect={() => setBlocker(current => (current === entry.blocker ? null : entry.blocker))}
                  />
                ))}
              </Box>
            </Box>

            {/* La RÉPARATION, sur le même écran que le constat. Les quatre
                motifs propres à l'ADV pointent ici : sans ce panneau, chaque
                pastille mènerait à l'écran qui l'affiche — un aller-retour qui
                ne répare rien. */}
            {repairing ? <RepairPanel dossier={repairing} onClose={() => setRepairing(null)} /> : null}

            <ResponsiveTable
              rows={data.items}
              onRowClick={row => setRepairing(row)}
              rowKey={row => `${row.missionId}-${row.kind}`}
              scrollLabel={t('tableLabel')}
              empty={
                <Box className="rounded-md border border-dashed border-border p-4">
                  <Text size="sm" color="text-muted-foreground">
                    {t('empty')}
                  </Text>
                  <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
                    {t('emptyWhy')}
                  </Text>
                </Box>
              }
              columns={[
                {
                  key: 'account',
                  header: t('columns.account'),
                  mobile: 'title',
                  render: row => row.accountName ?? <UnknownValue reason={t('unknownAccountReason')} />,
                },
                {
                  key: 'mission',
                  header: t('columns.mission'),
                  mobile: 'meta',
                  render: row => row.missionLabel ?? <UnknownValue reason={t('unknownMissionReason')} />,
                },
                {
                  key: 'kind',
                  header: t('columns.kind'),
                  mobile: 'meta',
                  render: row => <Badge variant="secondary">{t(`kinds.${row.kind}`)}</Badge>,
                },
                {
                  key: 'age',
                  header: t('columns.age'),
                  render: row => <Age row={row} now={now} />,
                },
                {
                  key: 'blockers',
                  header: t('columns.blockers'),
                  render: row => <Blockers row={row} />,
                },
                {
                  key: 'terms',
                  header: t('columns.terms'),
                  render: row =>
                    row.paymentTermsDays === null ? (
                      <UnknownValue reason={t('reasons.unknown_payment_terms')} />
                    ) : (
                      t('daysCount', { count: row.paymentTermsDays })
                    ),
                },
                {
                  key: 'transmitted',
                  header: t('columns.paymentDetails'),
                  render: row =>
                    row.paymentDetailsTransmittedAt === null ? (
                      <UnknownValue reason={t('reasons.payment_details_not_transmitted')} />
                    ) : (
                      new Date(row.paymentDetailsTransmittedAt).toLocaleDateString(i18n.language)
                    ),
                },
              ]}
            />
          </>
        )}
      </Box>
    </CustomerPage>
  )
}

/**
 * L'HISTOGRAMME PAR MOTIF (16-finance-v6.png, 31/08/2026) — le graphe montre,
 * les pastilles filtrent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LES DEUX, ET PAS L'UN À LA PLACE DE L'AUTRE
 * ─────────────────────────────────────────────────────────────────────────
 * Les pastilles (`QualityChip`) portent déjà les MÊMES comptes et FILTRENT —
 * un bon argument pour ne pas les recoder. Mais la maquette montre un
 * histogramme, et Louis le veut : les deux se lisent différemment (une barre
 * compare des GRANDEURS d'un coup d'œil, une pastille répond « combien
 * exactement, et je clique pour voir »), donc les deux restent — le graphe ne
 * clique pas, la pastille seule filtre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE SEULE TEINTE, ET LE CHIFFRE À CÔTÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Six barres du MÊME motif (un compte par motif ADV) ne sont pas six séries
 * distinctes à identifier — c'est une seule mesure comparée par catégorie, et
 * la coloration catégorielle (une teinte par barre) suggérerait à tort une
 * identité à retenir. Une seule teinte (`Progress` en variante par défaut,
 * déjà `--bellum-primary-500` en fond OPAQUE — la même que partout ailleurs
 * dans ce design system) suffit, et c'est la règle que l'annexe dataviz du
 * dépôt dit la plus importante : **le chiffre s'écrit toujours à côté du
 * graphe**, jamais seulement dans la barre.
 *
 * `count === null` (le motif KYC, RÉSERVÉ) ne rend AUCUNE barre à zéro — un
 * zéro dirait « aucun KYC à valider », le faux vert que ce dépôt refuse. Il
 * NOMME l'absence, comme la pastille juste en dessous.
 */
function BlockerHistogram({ entries }: { entries: AdvSummary['byBlocker'] }) {
  const { t } = useTranslation('adv')
  // Le motif RÉSERVÉ (`count: null`) est ÉCARTÉ, jamais replié sur 0 : un
  // zéro glissé dans le calcul du plafond resterait invisible à l'écran (il
  // ne dessine aucune barre), mais « `?? 0` » reste le motif que GA-19 guette
  // — l'écarter explicitement est aussi le code le plus honnête.
  const measured = entries.map(entry => entry.count).filter((count): count is number => count !== null)
  const maxCount = Math.max(1, ...measured)
  return (
    <Box className="mt-2 space-y-1.5">
      {entries.map(entry => (
        <Box key={entry.blocker} display="flex" className="items-center gap-2">
          <Text
            element="span"
            size="xs"
            color="text-muted-foreground"
            className="w-36 shrink-0 truncate sm:w-48"
            title={t(`blockers.${entry.blocker}`)}
          >
            {t(`blockers.${entry.blocker}`)}
          </Text>
          {entry.count === null ? (
            <UnknownValue reason={t('reasons.kyc_not_measured')} />
          ) : (
            <>
              <Box className="min-w-0 flex-1">
                <Progress value={(entry.count / maxCount) * 100} size="sm" />
              </Box>
              {/* Le chiffre, TOUJOURS à côté du graphe. */}
              <Text element="span" size="xs" weight="medium" className="w-6 shrink-0 text-right">
                {entry.count}
              </Text>
            </>
          )}
        </Box>
      ))}
    </Box>
  )
}

/**
 * Une tuile de tête.
 *
 * `value === null` veut dire « non mesuré » et JAMAIS zéro : la tuile
 * « en négociation » est dans ce cas pour toujours, tant que le modèle n'a pas
 * cet état. Elle n'est alors pas cliquable — cliquer une tuile non mesurée
 * rendrait une liste vide qui se lirait « il n'y en a aucun ».
 */
function Tile({
  name,
  summary,
  active,
  onSelect,
}: {
  name: AdvTile
  summary: AdvSummary
  active: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation('adv')
  const value = tileValue(name, summary)
  const label = t(`tiles.${name}`)

  const body = (
    <>
      <Text element="span" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Box className="mt-1">
        {value === null ? (
          <UnknownValue reason={t(`tileReasons.${name}`)} />
        ) : (
          <Text element="span" size="xl" className="font-semibold">
            {value}
          </Text>
        )}
      </Box>
      {/* Le delta de la maquette (« vs juil. 2026 +9 ») n'a pas de source :
          l'écran le NOMME plutôt que d'écrire « +0 », qui affirmerait une
          stabilité que personne n'a mesurée. */}
      {(name === 'starts' || name === 'renewals') && value !== null ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('deltaUnmeasured')}
        </Text>
      ) : null}
    </>
  )

  if (value === null) {
    return <Box className="min-h-11 rounded-md border border-border bg-card p-3">{body}</Box>
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`min-h-11 rounded-md border p-3 text-left ${
        active ? 'border-[var(--bellum-text-accent)] bg-[var(--bg-elevated)]' : 'border-border bg-card'
      }`}
    >
      {body}
    </button>
  )
}

function tileValue(name: AdvTile, summary: AdvSummary): number | null {
  switch (name) {
    case 'all':
      return summary.total
    case 'starts':
      return summary.starts
    case 'renewals':
      return summary.renewals
    case 'active':
      return summary.active
    case 'ready_to_invoice':
      return summary.readyToInvoice
    case 'in_negotiation':
      // Le modèle n'a pas cet état — voir `advSummarySchema`, qui l'impose
      // `null` plutôt que de laisser un chiffre s'y écrire.
      return summary.inNegotiation
  }
}

/**
 * Une pastille de qualité — et elle CLIQUE.
 *
 * ⚠️ Aucune couleur d'état sur le chiffre. Un zéro peint en vert dirait « rien
 * à faire » sur un espace où personne n'a jamais saisi de référence cliente, et
 * personne ne va vérifier un indicateur qui se dit sain. Le zéro reste NEUTRE ;
 * seul un stock non nul porte l'accent qui appelle l'œil.
 *
 * `count === null` = motif RÉSERVÉ, non calculé (le KYC). La pastille le dit et
 * ne filtre pas : filtrer sur un motif jamais produit rendrait une liste vide
 * qui se lirait « aucun dossier concerné ».
 */
function QualityChip({
  blocker,
  count,
  active,
  onSelect,
}: {
  blocker: AdvBlocker
  count: number | null
  active: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation('adv')
  const label = t(`blockers.${blocker}`)

  if (count === null) {
    return (
      <Box className="flex min-h-11 items-center gap-2 rounded-full border border-dashed border-border px-3 py-1">
        <Text element="span" size="xs" color="text-muted-foreground">
          {label}
        </Text>
        <UnknownValue reason={t('reasons.kyc_not_measured')} />
      </Box>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      /* La grammaire partagée : même hauteur, même rayon, même façon de dire
         « c'est celui-ci » que partout ailleurs. */
      className={chipClassName({ active, size: 'sm' })}
    >
      <Text element="span" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Text
        element="span"
        size="xs"
        // Zéro reste neutre : c'est le seul rendu qui ne promet rien.
        color={count > 0 ? 'text-[var(--bellum-text-accent)]' : 'text-muted-foreground'}
        className="font-semibold"
      >
        {count}
      </Text>
    </button>
  )
}

/** L'ancienneté du dossier — « non mesuré » quand son ouverture est inconnue. */
function Age({ row, now }: { row: AdvDossier; now: Date }) {
  const { t } = useTranslation('adv')
  const days = advAgeDays(row.openedOn, now)
  if (days === null) return <UnknownValue reason={t('reasons.unknownOpening')} />
  return <>{t('daysCount', { count: days })}</>
}

/**
 * Les motifs de la ligne, chacun avec son lien de réparation.
 *
 * Un `<Link>` et pas un `<div onClick>` : ce qui se clique se tabule, s'ouvre
 * à l'Entrée et s'annonce.
 */
function Blockers({ row }: { row: AdvDossier }) {
  const { t } = useTranslation('adv')
  if (row.blockers.length === 0) {
    return (
      <Text element="span" size="xs" color="text-muted-foreground">
        {t('states.complete')}
      </Text>
    )
  }
  return (
    <Box display="flex" className="flex-wrap gap-1">
      {row.blockers.map(blocker => (
        <Link
          key={blocker}
          to={ADV_BLOCKER_ACTIONS[blocker].route}
          className="rounded-full border border-border px-2 py-0.5 text-xs text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
          title={t(`repairs.${ADV_BLOCKER_ACTIONS[blocker].action}`)}
        >
          {t(`blockers.${blocker}`)}
        </Link>
      ))}
    </Box>
  )
}

/**
 * Télécharge la file dans l'état exact où l'écran la montre.
 *
 * Le fichier passe par le client HTTP authentifié : un `<a href>` nu partirait
 * sans cookie de session et rendrait un 401 que l'utilisateur ouvrirait comme
 * un fichier vide.
 */
async function downloadCsv(
  query: Parameters<typeof advApi.exportCsv>[0],
  month: string | undefined,
  grant: DataExitGrant,
): Promise<void> {
  try {
    const csv = await advApi.exportCsv(query)
    downloadCSV(csv, `adv-${month ?? 'mois'}.csv`, grant)
  } catch (error) {
    // #2081.14 — un refus de la règle d'espace se DIT (« Réservé par la règle
    // d'espace : … »), jamais sous une erreur générique.
    toast.error(workspaceRuleRefusalText(error) ?? (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * LE PANNEAU DE RÉPARATION — le seul chemin d'écriture du domaine.
 *
 * Les quatre champs qu'il porte sont exactement les quatre motifs que cet écran
 * peut lever ; les deux autres (`missing_billing_contact`, `missing_po`) se
 * réparent sur la fiche de mission, et leur lien y mène.
 *
 * ⚠️ Il n'y a AUCUN champ où saisir un numéro de compte bancaire, et il n'y en
 * aura pas : ce qui se déclare de la transmission est un ÉTAT, et c'est le
 * serveur qui pose la date. Bellum ne stocke aucun moyen de paiement.
 *
 * ⚠️ Un champ vidé RETIRE le terme — il ne le met pas à zéro. « Pas de
 * conditions de règlement » et « règlement comptant » ne sont pas la même
 * chose, et le contrat refuse `0`.
 */
export function RepairPanel({ dossier, onClose }: { dossier: AdvDossier; onClose: () => void }) {
  const { t } = useTranslation('adv')
  const update = useUpdateAdvDossier()
  const entities = useAccountEntities(dossier.accountId)
  const [reference, setReference] = useState(dossier.clientBillingReference ?? '')
  const [terms, setTerms] = useState(dossier.paymentTermsDays === null ? '' : String(dossier.paymentTermsDays))
  const [entityId, setEntityId] = useState(dossier.clientEntityId ?? '')

  const save = () => {
    const days = Number.parseInt(terms, 10)
    update.mutate(
      {
        missionId: dossier.missionId,
        input: {
          clientBillingReference: reference.trim() ? reference.trim() : null,
          // `NaN` et `0` valent tous deux « pas de condition saisie » : le
          // contrat refuse `0`, donc on RETIRE plutôt que d'écrire un zéro.
          paymentTermsDays: Number.isFinite(days) && days > 0 ? days : null,
          clientEntityId: entityId ? entityId : null,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Text element="p" size="sm" className="font-medium">
        {t('repair.title', { mission: dossier.missionLabel ?? t('repair.untitledMission') })}
      </Text>
      <Box className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('fields.clientReference')}
          </Text>
          <Input
            value={reference}
            onChange={event => setReference(event.target.value)}
            placeholder={t('fields.clientReferencePlaceholder')}
            className="mt-1"
          />
        </label>
        <label className="block">
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('fields.paymentTerms')}
          </Text>
          <Input
            type="number"
            min={1}
            max={365}
            value={terms}
            onChange={event => setTerms(event.target.value)}
            placeholder={t('fields.paymentTermsPlaceholder')}
            className="mt-1"
          />
        </label>
        <label className="block">
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('fields.billingEntity')}
          </Text>
          <SelectField
            value={entityId}
            onChange={next => setEntityId(next)}
            emptyOption={{ label: t('fields.billingEntityNone') }}
            options={(entities.data?.items ?? []).map(entity => ({ value: entity.id, label: entity.name }))}
            className="mt-1 w-full"
          />
          {/* Une liste vide ne se confond pas avec une lecture qui n'a pas eu
              lieu : sans ce mot, « aucune entité » se lirait « ce compte n'en
              a pas » alors que la requête peut simplement avoir échoué. */}
          {entities.isError ? (
            <Text element="p" size="xs" color="text-[var(--danger-soft-text)]" className="mt-1">
              {t('fields.billingEntityFailed')}
            </Text>
          ) : null}
        </label>
        <Box>
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('fields.paymentDetails')}
          </Text>
          <Box display="flex" className="mt-1 flex-wrap gap-2">
            <Button
              variant={dossier.paymentDetailsTransmittedAt ? 'outline' : 'default'}
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  missionId: dossier.missionId,
                  input: { paymentDetailsTransmitted: !dossier.paymentDetailsTransmittedAt },
                })
              }
            >
              {dossier.paymentDetailsTransmittedAt ? t('fields.markNotTransmitted') : t('fields.markTransmitted')}
            </Button>
          </Box>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
            {t('fields.paymentDetailsNote')}
          </Text>
        </Box>
      </Box>
      <Box display="flex" className="mt-3 gap-2">
        <Button size="sm" disabled={update.isPending} onClick={save}>
          {t('repair.save')}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('repair.cancel')}
        </Button>
      </Box>
      {update.isError ? (
        <Text element="p" size="xs" color="text-[var(--danger-soft-text)]" className="mt-2">
          {t('repair.failed')}
        </Text>
      ) : null}
    </Box>
  )
}
