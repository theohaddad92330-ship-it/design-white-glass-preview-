import type { ExpenseCategory, ExpenseReportDetailView } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { MeasuredValue } from '@/components/primitives/UnknownValue'
import { THEO_NUM_COLUMN, THEO_TABLE_FRAME } from '@/features/missions/view/TheoScreenBlocks'
import { formatCents } from '@/lib/money'
import {
  useExpenseReportDetail,
  useOpenAttachment,
  useRejectExpenseReport,
  useSubmitExpenseReport,
  useValidateExpenseReport,
  useWithdrawExpenseReport,
} from '../api'
// ⚠️ Import à EFFET — le tiroir s'ouvre AUSSI sans passer par la page (ses
// propres tests, et demain un autre écran). Sans lui, il partait sans catalogue
// et affichait ses clés brutes, sans erreur nulle part. Voir `../i18n.ts`.
import '../i18n'
import { CATEGORY_GLYPH, STATUS_VARIANT, formatBytes } from '../presentation'
import { AttachmentDeposit } from './AttachmentDeposit'

/** Le motif est borné comme `rejectExpenseReportSchema` — un champ qui laisse
 *  taper ce que le serveur rejette ment à celui qui l'écrit. */
const REASON_MAX = 500

/**
 * LE TIROIR d'une note de frais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX ENCARTS, ET ILS NE SE FONDENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette les sépare, et elle a raison : une ANOMALIE est un doute sur la
 * PIÈCE (« ce ticket est peut-être compté deux fois »), un DÉPASSEMENT est une
 * décision de gestion (« ce repas est 7 € au-dessus du plafond, on rembourse ou
 * pas »). Fondus, le premier disparaîtrait derrière le second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON VÉRIFIÉE » N'EST PAS « CONFORME »
 * ─────────────────────────────────────────────────────────────────────────────
 * L'encart de conformité a TROIS états, pas deux, et le troisième est celui qui
 * compte : quand le barème ne couvre pas une catégorie, l'écran écrit « non
 * vérifiée » et DIT combien de lignes n'ont pas pu être comparées. Écrire
 * « conforme » là serait une garantie tirée d'un silence — et « conforme » est
 * précisément ce qu'un valideur lit pour NE PAS ouvrir les justificatifs.
 */
export function ExpenseReportDrawer({
  reportId,
  onClose,
  onEdit,
}: {
  reportId: string | null
  onClose: () => void
  /**
   * Ouvre le formulaire sur cette note. Le tiroir ne l'édite PAS lui-même :
   * il montre un dossier, le formulaire en saisit un. Les fondre ferait un
   * écran qui change de nature selon l'état de ce qu'on y a ouvert.
   */
  onEdit: (id: string) => void
}) {
  const { t } = useTranslation('expenses')
  const { data, isLoading, isError } = useExpenseReportDetail(reportId)

  return (
    // Théo C missions-notes-de-frais (refonte PR12, 23/10/2026) — la note s'ouvre en MODALE LARGE
    // (`dialog.wide.v18-dialog`), plus en tiroir latéral : le dossier se lit au centre, ses lignes en
    // tableau. Le nom du composant reste (ses appelants et ses tests), sa forme change.
    <Dialog open={reportId !== null} onOpenChange={open => (open ? undefined : onClose())}>
      {/* `dvh` et jamais `vh` : sur mobile, `vh` compte la barre d'URL et le
          pied de la modale passe sous le bord de l'écran. Un seul conteneur défile (le corps). */}
      <DialogContent
        closeLabel={t('common:actions.close')}
        className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-0 overflow-y-hidden p-0"
      >
        {isLoading ? (
          // Même pendant le chargement, le dialogue porte un titre ET une
          // description : Radix les exige, et sans eux un lecteur d'écran
          // annonce un dialogue anonyme au moment précis où l'on ne voit rien.
          <Box className="p-6">
            <DialogTitle className="text-lg">{t('drawer.eyebrow')}</DialogTitle>
            <DialogDescription className="mt-1 text-sm">{t('drawer.loading')}</DialogDescription>
          </Box>
        ) : isError || !data ? (
          // Un échec de lecture ne se rend jamais comme « dossier vide » : on
          // irait chercher une note qui existe.
          <Box className="p-6">
            <DialogTitle className="text-lg">{t('drawer.errorTitle')}</DialogTitle>
            {/* `SheetDescription` et non un `Text` : un dialogue sans description
                laisse un lecteur d'écran annoncer un titre nu, et Radix le dit
                à l'exécution. Le texte est le même — c'est le rôle qui manquait. */}
            <DialogDescription className="mt-1 text-sm">{t('drawer.errorDescription')}</DialogDescription>
          </Box>
        ) : (
          <DrawerBody report={data} onClose={onClose} onEdit={onEdit} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DrawerBody({
  report,
  onClose,
  onEdit,
}: {
  report: ExpenseReportDetailView
  onClose: () => void
  onEdit: (id: string) => void
}) {
  const { t } = useTranslation('expenses')
  const [showAnomalies, setShowAnomalies] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const validate = useValidateExpenseReport()
  const reject = useRejectExpenseReport()
  // L'URL signée se demande AU CLIC et ne se garde nulle part : elle vit cinq
  // minutes, et une URL rangée dans un état produirait un lien qui marche la
  // première fois et plus jamais.
  const openAttachment = useOpenAttachment()
  const submit = useSubmitExpenseReport()
  const withdraw = useWithdrawExpenseReport()

  const isDraft = report.status === 'draft'
  // ⚠️ « Décidée » veut dire validée ou refusée. Le test d'origine était
  // `status !== 'pending'` : à l'arrivée du brouillon, il aurait rangé les
  // brouillons parmi les notes décidées et fait disparaître tout geste — un
  // brouillon serait devenu un cul-de-sac.
  const decided = report.status === 'validated' || report.status === 'rejected'

  return (
    <>
      <DialogHeader className="border-b border-[var(--bellum-border)] px-5 py-4 pr-14 text-left">
        <Box display="flex" className="flex-wrap items-start justify-between gap-3">
          <Box className="min-w-0">
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('drawer.eyebrow')}
            </Text>
            {/* `.dialog-head h2` de la maquette : « NDF-2026-10-014 · Yanis Berthier ». */}
            <DialogTitle className="text-xl font-semibold tracking-tight">
              <span>{report.reference}</span>
              <span className="font-normal text-[var(--bellum-text-secondary)]" aria-hidden="true">
                {' · '}
              </span>
              <span className="font-normal text-[var(--bellum-text-secondary)]">{report.bearerName}</span>
            </DialogTitle>
          </Box>
          <Badge variant={STATUS_VARIANT[report.status]}>{t(`status.${report.status}`)}</Badge>
        </Box>
        {/* La DESCRIPTION du dialogue, et pas seulement une ligne de sous-titre :
            un dialogue sans elle annonce un titre nu (« F-2026-006 ») à un
            lecteur d'écran, qui n'apprend ni de qui ni pour quel client.
            Maquette : mission · client · justificatifs. */}
        <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-[var(--bellum-text-secondary)]">
          {[
            report.missionLabel,
            report.accountName ?? t('drawer.noClient'),
            t('verification.attachments', { count: report.attachments.length }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </DialogDescription>
      </DialogHeader>

      {/* Un seul conteneur défilant — jamais deux imbriqués (GA-29). */}
      <Box className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {/* Théo C missions-notes-de-frais.N6 — l'action recommandée vient EN PREMIER (`.ht-block.lead`) : c'est elle qui dit quoi regarder. */}
        <Box
          data-theo-block="lead"
          className="rounded-card border p-3.5"
          style={{ background: 'var(--accent-soft-bg)', borderColor: 'var(--accent-soft-border)' }}
        >
          <Text
            element="p"
            size="xs"
            weight="semibold"
            color="var(--accent-soft-text)"
            className="uppercase tracking-wide"
          >
            {t('drawer.recommendedTitle')}
          </Text>
          <Text element="p" size="sm" color="var(--accent-soft-text)" className="mt-1">
            {/* Le brouillon a sa propre phrase : « valide ou refuse » n'a aucun
                sens sur une note que personne n'a encore déposée. */}
            {isDraft
              ? t('drawer.recommendedDraft')
              : decided
                ? t('drawer.recommendedDecided')
                : report.anomalies.length > 0
                  ? t('drawer.recommendedAnomalies')
                  : t('drawer.recommendedDefault')}
          </Text>
          <Text element="p" size="xs" color="var(--accent-soft-text)" className="mt-1">
            {/* Le lien avec la marge, DIT à l'écran : sans cette phrase, valider
                aurait un effet invisible sur le coût de la mission. */}
            {report.missionId === null
              ? t('drawer.noMission')
              : report.missionExpenseId !== null
                ? t('drawer.missionLinked')
                : t('drawer.missionPending')}
          </Text>
        </Box>

        {/* Maquette : le tableau des lignes — Ligne · Montant TTC · Plafond · Barème — puis le total. */}
        <Box>
          <Text element="h3" size="sm" weight="semibold" className="mb-2">
            {t('drawer.details')}
          </Text>
          {report.lines.length === 0 ? (
            <Text element="p" size="sm" color="text-muted-foreground">
              {t('drawer.noLines')}
            </Text>
          ) : (
            <ResponsiveTable
              className={THEO_TABLE_FRAME}
              rows={report.lines}
              rowKey={line => line.id}
              scrollLabel={t('drawer.details')}
              columns={[
                {
                  key: 'line',
                  header: t('drawer.lineColumn'),
                  mobile: 'title',
                  render: line => (
                    <Box display="flex" className="items-start gap-2">
                      {/* Le glyphe est DÉCORATIF : le libellé porte déjà la
                          catégorie, donc il est masqué aux lecteurs d'écran. */}
                      <Text element="span" size="base" aria-hidden="true">
                        {CATEGORY_GLYPH[line.category as ExpenseCategory] ?? CATEGORY_GLYPH.other}
                      </Text>
                      <Box className="min-w-0">
                        <Text element="p" size="sm" weight="medium">
                          {line.label}
                        </Text>
                        <Text element="p" size="xs" color="text-muted-foreground">
                          {[line.spentOn, line.city, line.detail].filter(Boolean).join(' • ')}
                        </Text>
                        <LineFooter line={line} />
                      </Box>
                    </Box>
                  ),
                },
                {
                  key: 'amount',
                  header: t('table.totalTtc'),
                  className: THEO_NUM_COLUMN,
                  // `div` et non `span` : `UnknownValue` rend un `<p>`.
                  render: line => (
                    <Text element="div" size="sm" weight="medium" noWrap>
                      <MeasuredValue value={line.amountCents} format={value => formatCents(Number(value))} />
                    </Text>
                  ),
                },
                {
                  key: 'cap',
                  header: t('drawer.capColumn'),
                  className: THEO_NUM_COLUMN,
                  // Sans plafond, la ligne n'est pas « 0 € » : elle est hors barème, et le dit.
                  render: line => (
                    <Text element="span" size="sm" color={line.capCents === null ? 'text-muted-foreground' : undefined}>
                      {line.capCents === null ? t('drawer.noCap') : formatCents(line.capCents)}
                    </Text>
                  ),
                },
                {
                  key: 'verdict',
                  header: t('table.policy'),
                  render: line => <LineVerdict line={line} />,
                },
              ]}
            />
          )}
          {/* `.ht-row.no-lead` — le total, sa base de remboursement. */}
          <Box
            data-theo-block="total"
            className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--bellum-border)] pt-2.5"
          >
            {/* La base de remboursement se lit dans l'encart du barème, plus bas : pas deux fois. */}
            <Text element="p" size="sm" weight="semibold">
              {t('drawer.totalTtc')}
            </Text>
            <Text element="div" size="base" weight="semibold" className="tabular-nums">
              {/* ⚠️ Jamais `?? 0`. `null` veut dire soit « pas le droit », soit
                  « pas mesuré » — et « 0,00 € » dirait que la note est vide. */}
              <MeasuredValue value={report.totalAmountCents} format={value => formatCents(Number(value))} />
            </Text>
          </Box>
        </Box>

        {/* Hors maquette, gardés : la fiche de la note, la vérification automatique, le verdict du
            barème, la TVA — sous le tableau, dans l'ordre où l'on vérifie. */}
        <Box className="grid grid-cols-2 gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-3 sm:grid-cols-4">
          <Figure label={t('drawer.period')} value={report.periodMonth} />
          <Figure label={t('drawer.reference')} value={report.reference} />
          <Figure label={t('drawer.lines')} value={String(report.lineCount)} />
          <Box>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('drawer.total')}
            </Text>
            <Text element="div" size="sm" weight="semibold">
              <MeasuredValue value={report.totalAmountCents} format={value => formatCents(Number(value))} />
            </Text>
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('drawer.totalHint')}
            </Text>
          </Box>
        </Box>

        <AutomaticCheck
          anomalies={report.anomalies}
          expanded={showAnomalies}
          onToggle={() => setShowAnomalies(value => !value)}
        />
        <PolicyCard report={report} />
        <VatCard report={report} />
        <Box>
          <Text element="h3" size="sm" weight="semibold" className="mb-2">
            {t('drawer.attachments', { count: report.attachments.length })}
          </Text>
          {report.attachments.length === 0 ? (
            <Text element="p" size="sm" color="text-muted-foreground">
              {t('drawer.noAttachments')}
            </Text>
          ) : (
            <Box display="flex" className="flex-wrap gap-2">
              {report.attachments.map(attachment => (
                <Box key={attachment.id} className="min-w-0 rounded-card border border-border bg-card px-3 py-2">
                  <Text element="p" size="sm" className="truncate">
                    {attachment.fileName}
                  </Text>
                  <Text element="div" size="xs" color="text-muted-foreground">
                    {/* Un poids inconnu s'écrit « non mesuré » — « 0 KB » se
                        lirait « fichier vide », c'est-à-dire un fait, et faux. */}
                    <MeasuredValue value={attachment.byteSize} format={value => formatBytes(Number(value))} />
                  </Text>
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {t('drawer.retention', { date: attachment.retentionUntil })}
                  </Text>
                  {attachment.downloadUrl ? (
                    // ⚠️ Un `<button>` et non un `<a href>` : la cible n'est pas
                    // le fichier mais la PORTE de l'API, qui rend une URL signée
                    // de cinq minutes. Mettre cette URL dans un `href` de liste
                    // l'aurait fabriquée d'avance pour tout le monde, et elle
                    // aurait péri dans un tiroir resté ouvert.
                    // `min-h-11` = 44 px, la cible tactile minimale.
                    <button
                      type="button"
                      className="mt-1 inline-block min-h-11 text-left text-xs text-[var(--bellum-text-accent)] underline"
                      disabled={openAttachment.isPending}
                      onClick={() => openAttachment.mutate(attachment.downloadUrl as string)}
                    >
                      {t('drawer.download', { name: attachment.fileName })}
                    </button>
                  ) : (
                    // ⚠️ Aucun bouton quand rien n'est stocké. Un bouton qui ne
                    // télécharge rien est une donnée fictive sous forme
                    // d'affordance — on le découvre en réunion, pas en CI.
                    <Text element="p" size="xs" color="text-muted-foreground">
                      {t('drawer.notStored')}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
          {/* Le dépôt n'est offert que tant que la note est EN ATTENTE : les
              justificatifs sont ce sur quoi la décision se prend, et une pièce
              ajoutée après coup rendrait illisible « sur quoi cette note a-t-elle
              été validée ? ». Le serveur le refuse aussi — ceci évite d'offrir
              un geste qui sera rejeté. */}
          {decided ? null : <AttachmentDeposit reportId={report.id} />}
        </Box>

        {report.status === 'rejected' && report.rejectionReason ? (
          <Box
            className="rounded-card border p-3"
            style={{ background: 'var(--danger-soft-bg)', borderColor: 'var(--danger-soft-border)' }}
          >
            <Text element="p" size="xs" color="var(--danger-soft-text)">
              {report.decidedAt
                ? t('actions.rejectedOn', { date: report.decidedAt.slice(0, 10) })
                : t('drawer.eyebrow')}
            </Text>
            <Text element="p" size="sm" color="var(--danger-soft-text)">
              {report.rejectionReason}
            </Text>
          </Box>
        ) : null}
      </Box>

      {isDraft ? (
        // ⚠️ Un BROUILLON ne se valide pas : personne ne l'a déposé, et le
        // valider prendrait une décision sur une demande qui n'a pas été faite.
        // Les deux seuls gestes qui existent ici sont ceux du DÉPOSANT.
        <Box className="border-t border-border px-5 py-3">
          <Box display="flex" className="flex-wrap justify-end gap-2">
            <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => onEdit(report.id)}>
              {t('actions.edit')}
            </Button>
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              disabled={submit.isPending}
              onClick={() => submit.mutate(report.id, { onSuccess: onClose })}
            >
              {t('actions.submit')}
            </Button>
          </Box>
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
            {t('actions.draftHint')}
          </Text>
        </Box>
      ) : !decided ? (
        <Box className="border-t border-border px-5 py-3">
          {rejecting ? (
            <Box>
              <Text element="p" size="sm" weight="medium">
                {t('actions.rejectTitle')}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
                {t('actions.rejectHint')}
              </Text>
              <Input
                className="mt-2"
                value={reason}
                maxLength={REASON_MAX}
                aria-label={t('actions.rejectLabel')}
                onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
                placeholder={t('actions.rejectPlaceholder')}
              />
              <Box display="flex" className="mt-2 gap-2">
                {/* Désactivé tant que le motif est vide : le serveur rendrait
                    400, et un bouton qui part pour revenir en erreur fait
                    recliquer. La règle est tenue par le serveur ET par la base —
                    ceci évite seulement l'aller-retour. */}
                <Button
                  size="sm"
                  disabled={reason.trim().length === 0 || reject.isPending}
                  onClick={() => {
                    reject.mutate(
                      { id: report.id, reason: reason.trim() },
                      {
                        onSuccess: () => {
                          setRejecting(false)
                          setReason('')
                          onClose()
                        },
                      },
                    )
                  }}
                >
                  {t('actions.rejectConfirm')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRejecting(false)
                    setReason('')
                  }}
                >
                  {t('actions.rejectAbort')}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              {/* `.dialog-footer` de la maquette : « Refuser avec un motif », puis « Valider la note » en primaire, à droite. */}
              <Box display="flex" className="flex-wrap justify-end gap-2">
                <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => setRejecting(true)}>
                  {t('actions.reject')}
                </Button>
                <Button
                  className="min-h-11 flex-1 sm:flex-none"
                  disabled={validate.isPending}
                  onClick={() => validate.mutate(report.id, { onSuccess: onClose })}
                >
                  {t('actions.validate')}
                </Button>
              </Box>
              {/* Les deux gestes du DÉPOSANT, sur une note qu'il vient
                  d'envoyer : la corriger, ou la retirer avant qu'on la regarde.
                  Ils sont en second rang parce que l'écran est d'abord celui du
                  valideur — mais les retirer laisserait une note soumise par
                  erreur sans autre issue qu'un refus, avec son motif. */}
              <Box display="flex" className="mt-2 flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => onEdit(report.id)}>
                  {t('actions.edit')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={withdraw.isPending}
                  onClick={() => withdraw.mutate(report.id, { onSuccess: onClose })}
                >
                  {t('actions.withdraw')}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      ) : null}
    </>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="p" size="sm" weight="medium" className="truncate">
        {value}
      </Text>
    </Box>
  )
}

/**
 * La ligne de pied d'une ligne de frais — trajet, dépassement, taux de TVA (le plafond a sa colonne).
 *
 * Trois absences distinctes s'y disent, et aucune ne se rend « 0 » :
 *  · pas de plafond pour la catégorie → « hors barème » ;
 *  · pas de dépassement → rien du tout (un « dépasse de 0 € » permanent apprend
 *    à ne plus lire la ligne) ;
 *  · pas de taux lu → rien non plus, la ventilation le COMPTE plus haut.
 */
/**
 * Théo C missions-notes-de-frais.N6 — le verdict de la LIGNE : Conforme · Dépasse de X · Non vérifiée.
 *
 * Même règle que la liste : sans plafond opposable, la ligne est « non vérifiée », jamais conforme.
 * Et quand le montant est masqué (pas de `finance:read`), on n'affirme RIEN : un plafond masqué
 * n'est ni « conforme » ni « non vérifié ».
 */
function LineVerdict({ line }: { line: ExpenseReportDetailView['lines'][number] }) {
  const { t } = useTranslation('expenses')
  if (line.amountCents === null) return null
  const overage = line.overageCents
  const [variant, text] =
    overage === null
      ? (['outline', t('drawer.lineUnknown')] as const)
      : overage > 0
        ? (['warning', t('drawer.lineBreach', { amount: formatCents(overage) })] as const)
        : (['success', t('drawer.lineCompliant')] as const)
  return (
    <Badge variant={variant} data-testid={`line-verdict-${line.id}`}>
      {text}
    </Badge>
  )
}

function LineFooter({ line }: { line: ExpenseReportDetailView['lines'][number] }) {
  const { t } = useTranslation('expenses')
  const overage = line.overageCents
  const hasDistance = line.distanceKm !== null

  if ((overage === null || overage <= 0) && line.vatRateBps === null && !hasDistance) return null

  return (
    <Box display="flex" className="mt-1 flex-wrap items-center gap-x-3 gap-y-1">
      {hasDistance ? (
        // Le trajet, DIT : sans lui, un plafond kilométrique de 120 € sur une
        // ligne à 150 € ressemblerait à un forfait arbitraire.
        <Text element="span" size="xs" color="text-muted-foreground">
          {line.fiscalHorsepower === null
            ? t('drawer.distance', { km: line.distanceKm })
            : t('drawer.distanceWithPower', { km: line.distanceKm, power: line.fiscalHorsepower })}
        </Text>
      ) : null}
      {/* Le plafond a sa COLONNE (« Plafond », maquette) : il ne se redit pas ici. */}
      {overage !== null && overage > 0 ? (
        <Text element="span" size="xs" color="var(--warning-soft-text)">
          {t('drawer.overage', { amount: formatCents(overage) })}
        </Text>
      ) : null}
      {line.vatRateBps !== null ? (
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('drawer.vatRate', { rate: line.vatRateBps / 100 })}
        </Text>
      ) : null}
    </Box>
  )
}

function AutomaticCheck({
  anomalies,
  expanded,
  onToggle,
}: {
  anomalies: string[]
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('expenses')
  const clean = anomalies.length === 0
  const palette = clean ? 'success' : 'warning'

  return (
    <Box
      className="rounded-card border p-3"
      style={{ background: `var(--${palette}-soft-bg)`, borderColor: `var(--${palette}-soft-border)` }}
    >
      <Box display="flex" className="items-start justify-between gap-2">
        <Box className="min-w-0">
          <Text element="p" size="sm" weight="medium" color={`var(--${palette}-soft-text)`}>
            {t('check.title')}
          </Text>
          <Text element="p" size="sm" color={`var(--${palette}-soft-text)`}>
            {clean ? t('check.clean') : t('check.found', { count: anomalies.length })}
          </Text>
        </Box>
        {!clean ? (
          // Un `<button>`, jamais un `<div onClick>` : ce qui se clique se
          // tabule, s'active à Entrée, et s'annonce (GA-35).
          <Button type="button" variant="outline" size="sm" onClick={onToggle}>
            {expanded ? t('check.hide') : t('check.toggle')}
          </Button>
        ) : null}
      </Box>
      {expanded && !clean ? (
        <Box className="mt-2 space-y-1">
          {anomalies.map(anomaly => (
            <Text key={anomaly} element="p" size="xs" color="var(--warning-soft-text)">
              {anomaly}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

function PolicyCard({ report }: { report: ExpenseReportDetailView }) {
  const { t } = useTranslation('expenses')
  const verdict = report.compliance.verdict
  // Trois verdicts, trois teintes. « Non vérifiée » n'emprunte PAS le vert de
  // « conforme » : c'est exactement la confusion que le verdict existe pour
  // éviter.
  const palette = verdict === 'compliant' ? 'success' : verdict === 'breach' ? 'danger' : 'info'

  return (
    <Box
      className="rounded-card border p-3"
      style={{ background: `var(--${palette}-soft-bg)`, borderColor: `var(--${palette}-soft-border)` }}
    >
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="p" size="sm" weight="medium" color={`var(--${palette}-soft-text)`}>
          {t('policy.title')}
        </Text>
        <Badge variant={verdict === 'compliant' ? 'success' : verdict === 'breach' ? 'danger' : 'secondary'}>
          {t(`policy.${verdict}`)}
        </Badge>
      </Box>
      <Text element="p" size="xs" color={`var(--${palette}-soft-text)`} className="mt-1">
        {report.policyLabel === null
          ? t('policy.noPolicy')
          : report.reimbursementBasis === 'scale'
            ? t('policy.basisScale', { policy: report.policyLabel })
            : t('policy.basisActual', { policy: report.policyLabel })}
      </Text>
      {report.compliance.unmeasuredLineCount > 0 ? (
        // Ce qui n'a pas pu être évalué est NOMMÉ. Sans cette phrase, « non
        // vérifiée » serait un verdict sans raison, donc ignoré.
        <Text element="p" size="xs" color={`var(--${palette}-soft-text)`}>
          {t('policy.unmeasured', { count: report.compliance.unmeasuredLineCount })}
        </Text>
      ) : null}
    </Box>
  )
}

function VatCard({ report }: { report: ExpenseReportDetailView }) {
  const { t } = useTranslation('expenses')
  return (
    <Box className="rounded-card border border-border bg-card p-3">
      <Text element="p" size="sm" weight="medium">
        {t('vat.title')}
      </Text>
      <Box display="flex" className="mt-1 flex-wrap gap-x-6 gap-y-1">
        <Box>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('vat.recoverable')}
          </Text>
          <Text element="div" size="sm">
            <MeasuredValue value={report.recoverableVatCents} format={value => formatCents(Number(value))} />
          </Text>
        </Box>
        <Box>
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('vat.borne')}
          </Text>
          <Text element="div" size="sm">
            <MeasuredValue value={report.borneVatCents} format={value => formatCents(Number(value))} />
          </Text>
        </Box>
      </Box>
      {report.vatUnmeasuredLineCount > 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('vat.unmeasured', { count: report.vatUnmeasuredLineCount })}
        </Text>
      ) : null}
    </Box>
  )
}
