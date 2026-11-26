import type { AutoMergedPairView, DuplicatePairView, DuplicateScanView } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import {
  useAutoMergedDuplicates,
  useDecideDuplicate,
  useDuplicates,
  useDuplicatesScan,
  useRestoreArchivedAccount,
  useUndoAutoMerge,
} from '../api'

/**
 * #4468 — la raison d'une paire est stockée telle que le balayage l'écrit : un CODE (`same_email`) pour les
 * contacts, une phrase pour les comptes et les fusions certaines. Un code se dit en français ; un code que
 * l'écran ne connaît pas devient « Rapprochement proposé » — jamais une clé brute.
 */
const REASON_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/
function duplicateReasonLabel(t: TFunction<'governance'>, reason: string): string {
  if (!REASON_CODE.test(reason)) return reason
  return t(`duplicates.reasonCodes.${reason}`, { defaultValue: t('duplicates.reasonCodes.unknown') })
}

/**
 * Les doublons PROPOSÉS, et le geste qui les tranche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une paire est présentée avec sa RAISON et sa confiance, et c'est un humain qui
 * tranche. Fusionner est irréversible côté CRM, et un faux positif détruit
 * l'historique d'un vrai client.
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ de c37 (Louis 11/10/2026, #4016 L6) : une paire
 * CERTAINE (≥ 0,99 — même adresse et même nom) est fusionnée par le balayeur,
 * dans BellumAI seulement — jamais dans le CRM du client — et RÉVERSIBLE. Elle
 * ne disparaît pas en silence : la liste « Fusionnés par Bellum » la nomme, avec
 * le geste qui l'annule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC A QUITTÉ `GovernancePanel` (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Il vivait à l'INTÉRIEUR de la branche « un CRM est connecté » de l'écran
 * Connaissances. Or `duplicate_pairs` est produit par la base de l'espace, pas
 * par le CRM : un espace sans CRM voyait donc son contrôle de qualité compter
 * « 4 doublons non tranchés » et n'avait AUCUNE porte vers le geste
 * « arbitrer ». Le lien du contrôle, lui, menait à `/team` — les comptes
 * couverts par plusieurs commerciaux, un objet sans rapport.
 *
 * Il vit désormais là où le compte est affiché : l'écran Qualité des données — puis, depuis le
 * 14/10/2026 (refonte Pilotage, L0a, onglet Qualité supprimé), sur `/contacts`, section « Doublons à
 * trancher », visible seulement s'il y a au moins une paire ouverte.
 * Il n'y est pas EN PLUS de l'écran Connaissances — il y est À LA PLACE, parce
 * que le même objet arbitré à deux endroits est deux files d'attente pour une
 * seule décision (loi 4 du tome 7).
 *
 * Les champs personnalisés, eux, restent sur Connaissances : ce sont des
 * réglages de la base, pas une liste de travail.
 */

export function DuplicatesPanel() {
  const { t } = useTranslation('governance')
  const { data: pairs, isError } = useDuplicates()
  const scan = useDuplicatesScan()
  const decide = useDecideDuplicate()

  return (
    <Box className="space-y-3">
      <Text element="p" size="sm" weight="medium">
        {t('duplicates.title')}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('duplicates.hint')}
      </Text>

      {isError ? (
        <Text size="xs" color="text-muted-foreground">
          {t('duplicates.loadError')}
        </Text>
      ) : (pairs?.length ?? 0) === 0 ? (
        // #3490 — « aucun doublon » n'est vrai que d'un passage COMPLET : un
        // passage incomplet le dit, un passage complet nomme ce qu'il a regardé.
        <Text size="xs" color="text-muted-foreground">
          {scan?.failed ? t('duplicates.scanFailed') : emptyLine(scan, t)}
        </Text>
      ) : (
        <Box className="space-y-2">
          {pairs?.map(pair => (
            <DuplicateRow
              key={pair.id}
              pair={pair}
              pending={decide.isPending}
              onDecide={decision => decide.mutate({ id: pair.id, decision })}
            />
          ))}
        </Box>
      )}
      {/* #4471 — la limite se DIT : ce que le dernier balayage a examiné, même quand des paires restent à relire. */}
      {pairs && pairs.length > 0 && scan && !scan.failed && !scan.skipped ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {examinedLine(scan, t)}
        </Text>
      ) : null}
      <SetAsideAccounts scan={scan} />
      <AutoMergedPairs />
    </Box>
  )
}

/**
 * #4016 L6 — CE QUE LE BALAYEUR A FUSIONNÉ SEUL, nommé et annulable. Aucune
 * fusion en vigueur : aucune ligne (on n'affiche pas ce qu'on n'a pas).
 */
function AutoMergedPairs() {
  const { t } = useTranslation('governance')
  const { data: items, isError } = useAutoMergedDuplicates()
  const undo = useUndoAutoMerge()
  // #4805 — une lecture en échec n'est pas « aucune fusion » : on le dit.
  if (isError) return <QueryLoadError />
  if (!items?.length) return null
  return (
    <Box className="space-y-2">
      <Text element="p" size="xs" weight="medium">
        {t('duplicates.autoMerged.title')}
      </Text>
      <ul className="space-y-2">
        {items.map(item => (
          <AutoMergedRow key={item.id} item={item} pending={undo.isPending} onUndo={() => undo.mutate(item.id)} />
        ))}
      </ul>
    </Box>
  )
}

function AutoMergedRow({ item, pending, onUndo }: { item: AutoMergedPairView; pending: boolean; onUndo: () => void }) {
  const { t } = useTranslation('governance')
  const absorbed = item.absorbedLabel ?? item.absorbedId
  const kept = item.keptLabel ?? item.keptId
  // Un doublon porte, par définition, le MÊME nom : « X a rejoint X » ne dit rien, la phrase dit ce qui s'est passé.
  const sameLabel = absorbed.trim().toLowerCase() === kept.trim().toLowerCase()
  return (
    <li className="rounded-md border border-border bg-card p-3">
      <Text element="p" size="sm">
        {sameLabel
          ? t('duplicates.autoMerged.lineSameName', { name: absorbed })
          : t('duplicates.autoMerged.line', { absorbed, kept })}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {t('duplicates.autoMerged.why', {
          reason: duplicateReasonLabel(t, item.reason),
          value: Math.round(item.confidence * 100),
        })}
      </Text>
      <Box display="flex" className="mt-2 flex-wrap gap-1">
        <Button variant="ghost" size="sm" disabled={pending} onClick={onUndo}>
          {t('duplicates.autoMerged.undo')}
        </Button>
      </Box>
    </li>
  )
}

/**
 * #3490 (recette Y22) — « 2 comptes archivés ou rattachés n'entrent pas dans la comparaison »
 * sans les NOMMER ne se vérifie pas. Chaque compte écarté s'écrit avec son statut et son lien
 * vers sa fiche ; une paire de même nom dont un compte est écarté se DIT (jamais proposée).
 * Aucun compte écarté, ou un rapport antérieur au champ : aucune ligne.
 */
function SetAsideAccounts({ scan }: { scan: DuplicateScanView | null | undefined }) {
  const { t } = useTranslation('governance')
  const restore = useRestoreArchivedAccount()
  const accounts = scan?.setAsideAccounts ?? []
  const pairs = scan?.setAsidePairs ?? []
  if (accounts.length === 0 && pairs.length === 0) return null
  return (
    <Box className="space-y-2">
      {pairs.map(pair => (
        <Text key={`${pair.left.id}-${pair.right.id}`} element="p" size="xs" color="text-muted-foreground">
          {t('duplicates.setAsidePair', {
            left: pair.left.name,
            leftStatus: t(`duplicates.status.${pair.left.status}`),
            right: pair.right.name,
            rightStatus: t(`duplicates.status.${pair.right.status}`),
          })}
        </Text>
      ))}
      {accounts.length > 0 ? (
        <Box className="space-y-1">
          <Text element="p" size="xs" weight="medium">
            {t('duplicates.setAsideTitle')}
          </Text>
          <ul className="space-y-1">
            {accounts.map(account => (
              <li key={account.id} className="flex flex-wrap items-center gap-2">
                <Link
                  to="/accounts/$id"
                  params={{ id: account.id }}
                  className="min-w-0 truncate text-sm underline-offset-2 hover:underline"
                >
                  {account.name}
                </Link>
                <Badge variant="secondary">{t(`duplicates.status.${account.status}`)}</Badge>
                {/* Un dossier ARCHIVÉ se rend d'ici ; un dossier rattaché se détache depuis sa
                    fiche (aperçu des contacts qui reviennent) — jamais en un clic aveugle. */}
                {account.status === 'archived' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(account.id)}
                  >
                    {t('duplicates.restore')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </Box>
  )
}

function emptyLine(scan: DuplicateScanView | null | undefined, t: TFunction<'governance'>): string {
  const parts = [t('duplicates.empty')]
  // #3490 (recette Y18) — sans rapport, ou rapport « non balayé » : la phrase
  // « aucun doublon » seule serait une absence de mesure présentée en mesure.
  if (!scan) return `${parts[0]} ${t('duplicates.noReport')}`
  if (scan.skipped) return `${parts[0]} ${t(`duplicates.skipped_${scan.skipped}`)}`
  // Un périmètre non mesuré (`null`) ne s'écrit pas « 0 » : il sort de la phrase.
  if (scan.accountsExamined !== null && scan.contactsExamined !== null) {
    parts.push(t('duplicates.examined', { accounts: scan.accountsExamined, contacts: scan.contactsExamined }))
  }
  if (scan.accountsSetAside) parts.push(t('duplicates.setAside', { count: scan.accountsSetAside }))
  if (scan.alreadyKnown > 0) parts.push(t('duplicates.alreadyDecided', { count: scan.alreadyKnown }))
  return parts.join(' ')
}

function examinedLine(scan: DuplicateScanView, t: TFunction<'governance'>): string | null {
  // Un périmètre non mesuré (`null`) ne s'écrit pas « 0 » : il sort de la phrase.
  if (scan.accountsExamined === null || scan.contactsExamined === null) return null
  return t('duplicates.examined', { accounts: scan.accountsExamined, contacts: scan.contactsExamined })
}

function DuplicateRow({
  pair,
  onDecide,
  pending,
}: {
  pair: DuplicatePairView
  onDecide: (decision: 'merged' | 'dismissed') => void
  pending: boolean
}) {
  const { t } = useTranslation('governance')
  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Text element="span" size="sm" weight="medium">
          {pair.leftLabel ?? pair.leftId} · {pair.rightLabel ?? pair.rightId}
        </Text>
        {/* #4600 — comptes et contacts se suivent dans la même liste : chaque ligne nomme ce qu'elle rapproche. */}
        <Badge variant="outline">{t(`duplicates.entity.${pair.entityType}`)}</Badge>
        {/* La confiance se voit : une paire à 0,35 ne se traite pas comme une
            paire à 0,95, et l'écran ne doit pas les présenter pareil. */}
        <Badge variant={pair.confidence >= 0.8 ? 'warning' : 'secondary'}>
          {t('duplicates.confidence', { value: Math.round(pair.confidence * 100) })}
        </Badge>
      </Box>
      {/* La RAISON, telle quelle : une proposition sans raison ne se vérifie
          pas, donc ne se décide pas. */}
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {duplicateReasonLabel(t, pair.reason)}
      </Text>
      <Box display="flex" className="mt-2 flex-wrap gap-1">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onDecide('merged')}>
          {t('duplicates.merged')}
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onDecide('dismissed')}>
          {t('duplicates.dismissed')}
        </Button>
      </Box>
    </Box>
  )
}
