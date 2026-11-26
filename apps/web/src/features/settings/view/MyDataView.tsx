import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SettingsRow,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useFirstName } from '@/hooks/useFirstName'
import { useMemoryLedger } from '@/features/memory/hooks/useMemoryLedger'
import {
  classificationOfPayloadKey,
  deletionKeyOfPayloadKey,
  groupByCategory,
  provenanceKeyOfPayloadKey,
  purposeKeyOfPayloadKey,
  retentionKeyOfPayloadKey,
} from '../model/export-perimeter'
import type {
  ExportHistoryEntry,
  MemoryLedger,
  PortableFormat,
  PortabilityManifest,
  WithheldGroup,
} from '@bellum/contracts'
import { PORTABLE_OBJECTS, resolveScreenState } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ScreenState } from '@/components/primitives/ScreenState'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { portabilityApi, saveAs } from '@/features/settings/lib/portability-api'
import { privacyApi } from '@/features/settings/lib/privacy-api'
import { PrivacyView } from './PrivacyView'
import { TalentQualityBlock } from './TalentQualityBlock'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'

/**
 * « MES DONNÉES » — la réversibilité AFFICHÉE (PDF 7 §9.2, `BEL-INT-608` PR1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « La réversibilité existe mais reste une clause. Personne ne la voit, donc
 * personne ne la valorise. » — « Un dirigeant qui hésite à confier son CRM est
 * rassuré par un écran qu'il peut regarder, pas par un article de CGU. »
 *
 * Le bouton d'export EXISTAIT, rangé dans Réglages › Sécurité entre la double
 * authentification et la suppression de compte : trois lignes qui parlent de
 * risque, et au milieu la seule qui parle de liberté. Personne ne le voyait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE LA PAGE (#1524)
 * ─────────────────────────────────────────────────────────────────────────────
 * Entête → résumé des périmètres → table des exports → export global → ce qui
 * n'est pas inclus → zone sensible. Le critère du retour est le seul qui
 * compte : *« l'utilisateur doit ressortir de cette page avec davantage
 * confiance dans Bellum qu'en y entrant »*. La largeur est BORNÉE : mesuré à
 * 1 500 px, une ligne de réglage devient un tableur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'APPARAÎT PAS DEUX FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Loi 4 : la rangée « Exporter mes données » de l'écran Sécurité ne refait plus
 * l'export — elle RENVOIE ici. Et la SUPPRESSION reste où elle est, chez la
 * sécurité : cet écran l'EXPLIQUE et y mène, il ne la refait pas. C'est aussi
 * ce que demande #1523 — « ne jamais mélanger export quotidien et destruction
 * irréversible dans le même niveau visuel ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE VOUS N'EMPORTEZ PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Section OBLIGATOIRE, et DÉRIVÉE : elle se calcule côté API à partir de
 * l'inventaire des tables moins ce que l'export produit (`withheldFromExport`).
 * Trois puces rédigées une fois auraient menti dès le premier objet ajouté — et
 * c'est la page qu'on montre à qui hésite.
 *
 * ⚠️ #1522 — elle n'en montre plus le NOMBRE DE TABLES. « 154 tables » n'apprend
 * rien à un dirigeant et lui fait lire notre architecture ; la dérivation, elle,
 * reste entière côté serveur, où sa garde la tient.
 */
export function MyDataView() {
  const firstName = useFirstName()
  const { t, i18n } = useTranslation('myData')
  const [busy, setBusy] = useState<string | null>(null)
  /** #1522 — le récapitulatif s'ouvre AVANT le téléchargement, jamais après. */
  const [recapOpen, setRecapOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['privacy-portability'],
    queryFn: () => portabilityApi.manifest(),
    staleTime: 60_000,
  })

  /**
   * #2439.7/.8/.17 — « Mes exports », la catégorie « exports » du NO-GO.
   * Chargée à part : un compte qui n'a jamais exporté n'a pas besoin de ce
   * second aller-retour pour voir le reste de la page.
   */
  const { data: exportHistory } = useQuery({
    queryKey: ['privacy-export-history'],
    queryFn: () => privacyApi.exportHistory(),
    staleTime: 60_000,
  })

  /**
   * #2439.7/.8/.17 — « Mémoire », la cinquième catégorie du NO-GO. LIT le
   * registre existant (`/settings/memory`), n'en recalcule rien (GA-26).
   */
  const { data: memoryLedger } = useMemoryLedger()

  /**
   * L'état de l'écran, DÉRIVÉ (PDF 1 §2).
   *
   * `partial` quand au moins un compte est revenu `null` : la liste est là,
   * elle reste exportable, mais elle ne sait pas tout dire — et le dire vaut
   * mieux que d'afficher un « 0 » qui se lirait « tu n'as rien ».
   */
  const unmeasured = data?.objects.filter(object => object.rows === null) ?? []
  const screenState = resolveScreenState({
    isLoading,
    failed: isError,
    canRead: true,
    needsIntegration: false,
    integrationConnected: true,
    awaitingApproval: false,
    // Cet écran n'est jamais vide : le catalogue d'objets est constant. Un
    // espace neuf a dix objets à zéro ligne, ce qui est une RÉPONSE.
    everHadRows: true,
    visibleRows: (data?.objects ?? []).length,
    isNarrowed: false,
    missingParts: unmeasured.map(object => t(object.labelKey)),
    computedAt: null,
    freshForDays: null,
    now: new Date(),
  })

  async function downloadOne(payloadKey: string, format: PortableFormat) {
    setBusy(`${payloadKey}:${format}`)
    try {
      await portabilityApi.downloadObject(payloadKey, format)
      toast.success(t('exportAll.success'))
    } catch {
      toast.error(t('exportAll.error'))
    } finally {
      setBusy(null)
    }
  }

  async function downloadAll() {
    setBusy('all')
    try {
      const payload = await privacyApi.exportData()
      saveAs(
        JSON.stringify(payload, null, 2),
        `bellum-export-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      )
      toast.success(t('exportAll.success'))
      setRecapOpen(false)
      void refetch()
    } catch {
      toast.error(t('exportAll.error'))
    } finally {
      setBusy(null)
    }
  }

  const groups = data ? groupByCategory(data.objects) : []

  const personalGroups = groups.filter(group => group.category === 'personal')
  const sharedGroups = groups.filter(group => group.category !== 'personal')

  // Théo D settings-compte (Mes données) — l'en-tête, puis quatre blocs dans l'ordre de la maquette : Export
  // personnel, Export de l'espace, Retirer mes informations personnelles, Confidentialité & conservation. La largeur
  // de LECTURE reste bornée (#1524) : c'est une page qu'on lit pour décider si l'on fait confiance.
  return (
    <Box className="w-full max-w-5xl space-y-6">
      <SettingsScreenHeader
        scope="personal"
        title={t('header.screenTitle')}
        description={t('header.description')}
        actions={
          // #4295.15 — la politique et le registre, une porte depuis Réglages (la page /privacy les porte).
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link to="/privacy">{t('privacyPage.link.open')}</Link>
          </Button>
        }
      />
      {/* #1520 — la promesse s'adresse à quelqu'un : le prénom vient du PROFIL. Gardée sous l'en-tête Théo. */}
      <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
        {firstName ? t('header.claimNamed', { name: firstName }) : t('header.claim')}
        {' · '}
        {t('header.subtitle')}
      </Text>

      {screenState === 'loading' && <ScreenState state="loading" message={t('states.loadingMessage')} />}

      {screenState === 'error' && (
        <ScreenState
          state="error"
          message={t('states.errorMessage')}
          action={{ label: t('states.retry'), onClick: () => void refetch() }}
        />
      )}

      {data ? (
        <>
          {screenState === 'partial' && (
            <ScreenState state="partial" message={t('states.partialMessage')} detail={t('states.partialDetail')} />
          )}

          {/* #1524 — LE RÉSUMÉ DES PÉRIMÈTRES, avant le détail : « qu'est-ce qui est à moi » en une ligne par
              propriétaire. Hors maquette Théo, gardé (à trancher par Louis). */}
          <PerimeterSummary groups={groups} />

          {/* Bloc 1 — Export personnel. Le geste « tout ce qui est à moi » ouvre le RÉCAPITULATIF avant tout
              téléchargement (#1522) ; dessous, chaque objet personnel se télécharge seul. */}
          <SettingsBlock label={t('cards.personal.title')} description={t('blocks.personalHint')}>
            <SettingsRow
              title={t('blocks.personalAllTitle')}
              description={t('blocks.personalAllHint')}
              trailing={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={() => setRecapOpen(true)}
                >
                  <Download size={14} className="mr-1.5" aria-hidden="true" />
                  {t('cards.personal.action')}
                </Button>
              }
            />
            {personalGroups.map(group => (
              <ObjectRows key={group.category} group={group} busy={busy} onDownload={downloadOne} />
            ))}
            {/* « dernier export : jamais » est un FAIT lu du journal, pas une phrase de remplissage. */}
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="px-5 py-3 sm:px-6">
              {data.lastExportedAt
                ? t('exportAll.lastOn', { date: new Date(data.lastExportedAt).toLocaleDateString(i18n.language) })
                : t('exportAll.lastNever')}
            </Text>
            <ExportHistorySection entries={exportHistory ?? []} />
          </SettingsBlock>

          {/* Bloc 2 — Export de l'espace : les objets partagés, rangés par périmètre (#1520 / #2439.7), puis, repliée,
              la liste de ce qui ne part pas — calculée à partir de ce que l'export sait produire. */}
          <div id="mydata-objects">
            <SettingsBlock label={t('cards.workspace.title')} description={t('blocks.workspaceHint')}>
              <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="px-5 pt-4 sm:px-6">
                {t('cards.workspace.body')}
              </Text>
              {sharedGroups.map(group => (
                <section key={group.category} aria-label={t(`perimeter.${group.category}`)} className="pt-3">
                  <Text
                    element="h3"
                    size="xs"
                    weight="semibold"
                    color="text-[var(--bellum-text-muted)]"
                    className="px-5 uppercase tracking-wide sm:px-6"
                  >
                    {t(`perimeter.${group.category}`)}
                  </Text>
                  <ObjectRows group={group} busy={busy} onDownload={downloadOne} />
                </section>
              ))}
              <details className="border-t border-[var(--bellum-border)]">
                <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-medium sm:px-6">
                  {t('withheld.title')}
                </summary>
                <Box className="space-y-3 px-5 pb-4 sm:px-6">
                  <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                    {t('withheld.intro')}
                  </Text>
                  {/* #2439.7/.8/.17 — « marché » et « mémoire », les deux dernières catégories du NO-GO. */}
                  <Box display="flex" className="flex-col gap-3 sm:flex-row">
                    <MarketDataCard withheld={data.withheld} />
                    <MemoryDataCard ledger={memoryLedger} />
                  </Box>
                  {data.withheld.map(group => (
                    <Card key={group.kind} className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
                      {/* #1522 — chaque famille porte un TITRE, jamais un nombre de tables. */}
                      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                        {t(`withheldTitle.${group.kind}`)}
                      </Text>
                      <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
                        {t(group.reasonKey)}
                      </Text>
                    </Card>
                  ))}
                  {/* #1524 — les aides contextuelles, et rien de plus. */}
                  <Box display="flex" className="flex-wrap items-center gap-x-4 gap-y-1">
                    <AskLaura question={t('laura.whatIsInMyExport')} label={t('laura.whatIsInMyExportLabel')} />
                    <AskLaura question={t('laura.whyNotIncluded')} label={t('laura.whyNotIncludedLabel')} />
                    <AskLaura question={t('laura.mineVsWorkspace')} label={t('laura.mineVsWorkspaceLabel')} />
                  </Box>
                </Box>
              </details>
            </SettingsBlock>
          </div>

          {/* #4349 V.1 (décision Louis 19/10) — la qualité des fiches consultants, sortie du Vivier. Hors maquette
              Théo, gardée sous les exports (à trancher par Louis). */}
          <TalentQualityBlock />

          <ExportRecapDialog
            open={recapOpen}
            onOpenChange={setRecapOpen}
            manifest={data}
            busy={busy === 'all'}
            onConfirm={() => void downloadAll()}
          />

          {/* Bloc 3 — Retirer mes informations personnelles (#1523) : un premier geste qui EXPLIQUE ; le rouge vit
              chez la sécurité, à la confirmation. */}
          <SensitiveZone deletionDelayDays={data.deletionDelayDays} />
        </>
      ) : null}

      {/* Bloc 4 — Théo D settings-compte.A4 : exigence RGPD, pas un réglage — le registre des durées et les droits. */}
      <SettingsBlock label={t('privacyPage.sectionTitle')} description={t('privacyPage.subtitle')}>
        <div className="p-5 sm:p-6">
          <PrivacyView embedded />
        </div>
      </SettingsBlock>
    </Box>
  )
}

/** Les objets d'un périmètre : une ligne par objet, son niveau, sa provenance, un bouton par format. */
function ObjectRows({
  group,
  busy,
  onDownload,
}: {
  group: { category: string; objects: PortabilityManifest['objects'] }
  busy: string | null
  onDownload: (payloadKey: string, format: PortableFormat) => Promise<void>
}) {
  const { t } = useTranslation('myData')
  return (
    <>
      {group.objects.map(object => (
        <Box
          key={object.payloadKey}
          display="flex"
          className="flex-col gap-2 border-b border-[var(--bellum-border)] px-5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        >
          <Box className="min-w-0">
            <Box display="flex" className="flex-wrap items-center gap-2">
              <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                {t(object.labelKey)}
              </Text>
              {/* #2439.2 — le niveau de classification, lu sur le catalogue déclaré, jamais deviné. */}
              <Badge variant="outline">{t(`classification.${classificationOfPayloadKey(object.payloadKey)}`)}</Badge>
            </Box>
            {/* Un compte illisible s'écrit « non mesuré » et JAMAIS « 0 ». */}
            {object.rows === null ? (
              <UnknownValue />
            ) : (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('table.rowsCount', { count: object.rows })}
              </Text>
            )}
            <ObjectProvenance payloadKey={object.payloadKey} />
          </Box>
          <Box display="flex" className="shrink-0 items-center gap-2">
            {object.formats.map(format => (
              <Button
                key={format}
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                isLoading={busy === `${object.payloadKey}:${format}`}
                onClick={() => void onDownload(object.payloadKey, format)}
                aria-label={t('table.downloadNamed', { object: t(object.labelKey), format: format.toUpperCase() })}
              >
                {format.toUpperCase()}
              </Button>
            ))}
          </Box>
        </Box>
      ))}
    </>
  )
}

/**
 * #2439.1 / #2439.3 — POURQUOI, COMBIEN DE TEMPS et D'OÙ, une ligne discrète
 * sous chaque objet. Le centre données répondait déjà à « quoi » (le libellé)
 * et « jusqu'à quand se conserve la classification » (le badge) ; il restait
 * muet sur la finalité, la rétention PROPRE à cet objet et sa provenance.
 *
 * ⚠️ Une clé absente du catalogue n'affiche RIEN : les trois fonctions rendent
 * `null` plutôt qu'une valeur devinée, et cette ligne suit — mieux vaut une
 * absence visible qu'une provenance inventée.
 */
function ObjectProvenance({ payloadKey }: { payloadKey: string }) {
  const { t } = useTranslation('myData')
  const purposeKey = purposeKeyOfPayloadKey(payloadKey)
  const retentionKey = retentionKeyOfPayloadKey(payloadKey)
  const provenanceKey = provenanceKeyOfPayloadKey(payloadKey)
  // #2439.3 (8e attribut) — CE QUI ARRIVE À CET OBJET si tu supprimes ton
  // compte, distinct de `retentionKey` (la durée en fonctionnement normal).
  const deletionKey = deletionKeyOfPayloadKey(payloadKey)
  if (!purposeKey && !retentionKey && !provenanceKey && !deletionKey) return null

  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
      {[
        purposeKey ? t('table.purposeLine', { reason: t(purposeKey) }) : null,
        retentionKey ? t('table.retentionLine', { duration: t(retentionKey) }) : null,
        provenanceKey ? t('table.provenanceLine', { source: t(provenanceKey) }) : null,
        deletionKey ? t('table.deletionLine', { fate: t(deletionKey) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </Text>
  )
}

/**
 * LE RÉSUMÉ DES PÉRIMÈTRES (#1524).
 *
 * Une carte par propriétaire, avec ce qu'elle contient. ⚠️ Le total de lignes
 * n'est affiché que s'il est ENTIER : un objet dont le compte est revenu `null`
 * rend la somme inconnue, et « 259 » calculé sur neuf objets sur dix serait un
 * chiffre faux présenté comme un fait. Dans ce cas la carte compte les OBJETS,
 * ce qu'elle sait vraiment.
 */
function PerimeterSummary({
  groups,
}: {
  groups: { category: 'personal' | 'workspace' | 'technical' | 'files'; objects: { rows: number | null }[] }[]
}) {
  const { t } = useTranslation('myData')
  if (groups.length === 0) return null
  return (
    <Box
      display="grid"
      role="group"
      aria-label={t('perimeterSummary.regionLabel')}
      className="mb-5 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {groups.map(group => {
        // ⚠️ Le `null` se PROPAGE, il ne se remplace pas par zéro. Un seul objet
        // non compté rend la somme inconnue — et « 259 » calculé sur neuf objets
        // sur dix serait un chiffre faux présenté comme un fait. GA-19 refuse
        // d'ailleurs le `?? 0` qu'une première version avait écrit ici, même
        // inatteignable : un cliquet ne discute pas l'atteignabilité.
        const rows = group.objects.reduce<number | null>(
          (total, object) => (total === null || object.rows === null ? null : total + object.rows),
          0,
        )
        return (
          <Card key={group.category} className="border-[var(--bellum-border)] p-4">
            <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t(`perimeter.${group.category}`)}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
              {t(`perimeterSummary.${group.category}`)}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
              {rows === null
                ? t('perimeterSummary.objectsOnly', { count: group.objects.length })
                : t('perimeterSummary.objectsAndRows', { objects: group.objects.length, count: rows })}
            </Text>
          </Card>
        )
      })}
    </Box>
  )
}

/**
 * #2439.7/.8/.17 — « MARCHÉ », la sixième catégorie du NO-GO.
 *
 * Le référentiel partagé (`shared_market`) vivait noyé parmi les quatre
 * familles de « Ce que tu n'emportes pas » — juste à côté de la technologie
 * Bellum et des données de l'espace, qui n'ont pourtant pas la même origine.
 * Cette carte le sort en tête de page, séparément, pour que les TROIS origines
 * (personnel / entreprise / marché) se distinguent visuellement — sans rien
 * dupliquer : même `reasonKey`, même donnée que la liste plus bas (GA-26).
 *
 * ⚠️ #1522 — toujours aucun NOMBRE DE TABLES ici non plus : ce n'est pas parce
 * que la carte est nouvelle que la règle change.
 */
function MarketDataCard({ withheld }: { withheld: WithheldGroup[] }) {
  const { t } = useTranslation('myData')
  const market = withheld.find(group => group.kind === 'shared_market')
  if (!market) return null

  return (
    <Card className="flex-1 border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {t('perimeter.market')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {t(market.reasonKey)}
      </Text>
    </Card>
  )
}

/**
 * #2439.7/.8/.17 — « MÉMOIRE », la septième et dernière catégorie du NO-GO.
 *
 * Elle LIT le registre existant (`useMemoryLedger`, servi par `/settings/
 * memory`) — elle n'en recalcule rien (GA-26) et renvoie vers son écran,
 * plutôt que de refaire une deuxième vue du même détail (loi 4).
 *
 * `unreadableLayers` PROPAGE le « non mesuré » du registre : une couche
 * illisible et un registre vide se ressemblent, la doctrine du dépôt les
 * distingue partout ailleurs — cette carte ne fait pas exception.
 */
function MemoryDataCard({ ledger }: { ledger: MemoryLedger | null | undefined }) {
  const { t } = useTranslation('myData')
  const unmeasured = (ledger?.unreadableLayers.length ?? 0) > 0

  return (
    <Link to="/settings/memory" className="flex-1">
      <Card className="h-full border-[var(--bellum-border)] p-4 transition-colors hover:border-[var(--bellum-text-accent)]">
        <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('perimeter.memory')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {t('memoryCard.subtitle')}
        </Text>
        {unmeasured || !ledger ? (
          <UnknownValue className="mt-2" />
        ) : (
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
            {t('memoryCard.rowsCount', { count: ledger.entries.length })}
          </Text>
        )}
      </Card>
    </Link>
  )
}

/**
 * #2439.7/.8/.17 — « MES EXPORTS », la catégorie « exports » du NO-GO
 * (mémoire, fichiers, EXPORTS, marché — celle-ci sort de sa case).
 *
 * ⚠️ Un tableau VIDE ne rend RIEN : la doctrine du centre données est « on
 * n'affiche pas ce qu'on n'a pas » — un compte qui n'a jamais exporté ne voit
 * ni titre ni intertitre vide, exactement comme un groupe de périmètre vide
 * ({@link PerimeterSummary}) ou une famille « ce que vous n'emportez pas ».
 */
function ExportHistorySection({ entries }: { entries: ExportHistoryEntry[] }) {
  const { t, i18n } = useTranslation('myData')
  if (entries.length === 0) return null
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })

  // Théo D settings-compte — « Historique des exports », un repli fermé sous l'export personnel : un tableau, une
  // ligne par export journalisé. Ni « Demandé par » ni « État » : le journal ne porte que les exports de la personne
  // et ne date aucune expiration — on n'affiche pas ce qu'on n'a pas.
  return (
    <details className="border-t border-[var(--bellum-border)]">
      <summary className="flex min-h-11 cursor-pointer items-center gap-1 px-5 text-sm font-medium sm:px-6">
        {t('exportHistory.title')}
        <span className="text-xs font-normal text-[var(--bellum-text-muted)]">
          {t('exportHistory.count', { count: entries.length })}
        </span>
      </summary>
      <Box className="px-5 pb-4 sm:px-6">
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mb-2">
          {t('exportHistory.intro')}
        </Text>
        <Box className="min-w-0 overflow-x-auto rounded-lg border border-[var(--bellum-border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('exportHistory.colExport')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('exportHistory.colDate')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => {
                // La ligne DÉCLARÉE sur le catalogue, jamais un libellé deviné pour une `objectKey` inconnue (#2439).
                const objectLabelKey = entry.objectKey
                  ? (PORTABLE_OBJECTS.find(object => object.payloadKey === entry.objectKey)?.labelKey ?? null)
                  : null
                const kind = objectLabelKey
                  ? t('exportHistory.object', { object: t(objectLabelKey) })
                  : t('exportHistory.full')
                return (
                  <TableRow key={`${entry.createdAt}-${index}`}>
                    <TableCell>{entry.format ? `${kind} (${entry.format.toUpperCase()})` : kind}</TableCell>
                    <TableCell className="whitespace-nowrap">{dateFormat.format(new Date(entry.createdAt))}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </details>
  )
}

/**
 * LE RÉCAPITULATIF AVANT LE TÉLÉCHARGEMENT (#1522).
 *
 * *« Le CTA doit expliquer ce qu'il va réellement produire avant le clic. »*
 *
 * ⚠️ Il ne DEVINE rien : la liste est celle du manifeste, celle-là même que
 * l'écran affiche au-dessus, et l'export global du serveur produit exactement
 * ces objets-là. Une liste rédigée à la main aurait menti au premier objet
 * ajouté — c'est le défaut que cette page est faite pour ne pas avoir.
 *
 * ⚠️ Le FORMAT ne se choisit pas ici. Le retour propose « CSV / JSON », en
 * ajoutant lui-même la condition : *« uniquement si le backend le supporte
 * réellement »*. `GET /privacy/export` rend un JSON unique ; le choix par objet,
 * lui, existe déjà dans la table au-dessus. Offrir un CSV global fabriquerait un
 * bouton qui échoue.
 */
function ExportRecapDialog({
  open,
  onOpenChange,
  manifest,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  manifest: PortabilityManifest
  busy: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation('myData')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('recap.title')}</DialogTitle>
          <DialogDescription>{t('recap.subtitle')}</DialogDescription>
        </DialogHeader>

        <Box className="max-h-64 overflow-y-auto">
          <ul className="space-y-1">
            {manifest.objects.map(object => (
              <li key={object.payloadKey}>
                <Text size="sm">
                  <span aria-hidden="true">✓ </span>
                  {t(object.labelKey)}
                  {' — '}
                  <span className="text-[var(--bellum-text-muted)]">
                    {/* Un compte illisible reste « non mesuré » JUSQUE DANS le
                        récapitulatif : c'est là qu'un « 0 » ferait renoncer
                        quelqu'un à un export qui, lui, emporte bien la donnée. */}
                    {object.rows === null ? t('table.rowsUnknown') : t('table.rowsCount', { count: object.rows })}
                  </span>
                </Text>
              </li>
            ))}
          </ul>
        </Box>

        <Box className="rounded-lg border border-[var(--bellum-border)] p-3">
          <Text size="sm" weight="medium">
            {t('recap.notIncludedTitle')}
          </Text>
          <ul className="mt-1 space-y-0.5">
            {manifest.withheld.map(group => (
              <li key={group.kind}>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t(`withheldTitle.${group.kind}`)}
                </Text>
              </li>
            ))}
          </ul>
        </Box>

        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('recap.format')}
        </Text>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('recap.cancel')}
          </Button>
          <Button type="button" isLoading={busy} loadingText={t('exportAll.loading')} onClick={onConfirm}>
            {t('recap.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * LA ZONE SENSIBLE (#1523).
 *
 * *« Ne jamais mélanger export quotidien et destruction irréversible dans le
 * même niveau visuel. »* — *« Ne pas rendre le bouton rouge agressif au premier
 * niveau. »* D'où : une section à part, en bas, un premier geste qui EXPLIQUE,
 * et le rouge réservé à l'étape de confirmation, qui vit chez la sécurité.
 *
 * ⚠️⚠️ **LE DÉFAUT DE FOND, ET IL ÉTAIT DANS LA PHRASE.** L'écran écrivait
 * « Suppression complète sous {{count}} jours ». C'était FAUX :
 * `deletionDelayDays` est la durée de conservation des enregistrements
 * ANONYMISÉS (règle `anonymized_records`), pas un délai avant destruction. La
 * suppression, elle, est IMMÉDIATE — le service anonymise profil, contacts,
 * consultants et documents, révoque les sessions et annule l'abonnement dans la
 * même requête. Quelqu'un qui lisait « sous 30 jours » pouvait croire qu'il lui
 * restait un mois pour revenir : il n'en a aucun.
 *
 * Ce que la section dit, et rien d'autre que ce que le code fait :
 * — ce qui est effacé (anonymisé) : identité, contacts, consultants, documents ;
 * — quand : tout de suite, à la confirmation ;
 * — ce qui reste, pseudonymisé : facturation, journal des crédits, journal des
 *   actions, données d'entreprises (non nominatives) — obligations comptables ;
 * — ce qui ne revient pas : rien de tout cela ne se restaure ;
 * — pourquoi exporter d'abord : après, il n'y a plus rien à exporter.
 */
function SensitiveZone({ deletionDelayDays }: { deletionDelayDays: number }) {
  const { t } = useTranslation('myData')
  const [explained, setExplained] = useState(false)

  return (
    <div id="mydata-sensitive">
      <SettingsBlock label={t('cards.remove.title')} description={t('cards.remove.body')}>
        <Box className="p-5 sm:p-6">
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wide">
            {t('sensitive.zone')}
          </Text>
          <Text element="h3" size="base" weight="semibold" color="text-[var(--bellum-text-primary)]" className="mt-1">
            {t('sensitive.title')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
            {t('sensitive.lead')}
          </Text>

          {/* Le premier geste EXPLIQUE. Il n'est ni rouge ni destructif : personne ne
          détruit ce qu'il n'a pas compris, et le retour le demande mot pour mot. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 pointer-coarse:min-h-11"
            aria-expanded={explained}
            onClick={() => setExplained(value => !value)}
          >
            {explained ? t('sensitive.hide') : t('sensitive.understand')}
          </Button>

          {explained ? (
            <Box className="mt-3 space-y-2">
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <Text size="sm">{t('sensitive.erased')}</Text>
                </li>
                <li>
                  <Text size="sm">{t('sensitive.when')}</Text>
                </li>
                <li>
                  <Text size="sm">{t('sensitive.kept', { count: deletionDelayDays })}</Text>
                </li>
                <li>
                  <Text size="sm">{t('sensitive.members')}</Text>
                </li>
                <li>
                  <Text size="sm">{t('sensitive.irreversible')}</Text>
                </li>
                <li>
                  <Text size="sm">{t('sensitive.exportFirst')}</Text>
                </li>
              </ul>
              {/* La suppression VIT chez la sécurité : on y mène, on ne la refait pas
              ici (loi 4 — rien n'apparaît deux fois sous la même forme). C'est
              là, et seulement là, que le geste devient rouge. */}
              <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
                <Link to="/settings/security">{t('deletion.action')}</Link>
              </Button>
            </Box>
          ) : null}
        </Box>
      </SettingsBlock>
    </div>
  )
}
