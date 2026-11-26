import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { downloadCSV } from '@/lib/export-csv'
import { toCsv } from '@/lib/csv'
import { useDataExit } from '@/lib/data-exit'
import { renderInlineMarkdown } from '../markdown'
import { humanizeExportCell } from './humanizeExportCell'
import { ReplyCard, type BlockOf } from './ReplyCard'

// #2271.20 — un fichier exportable, préparé DANS la conversation.
//
// Le copilote n'envoie jamais rien : ce bouton ne fait qu'un geste LOCAL,
// `downloadCSV` (`apps/web/src/lib/export-csv.ts`), la MÊME fonction que
// l'export de contacts déjà livré ailleurs dans le produit. Aucune requête
// réseau ici — les lignes voyagent déjà dans la carte, écrites par un autre
// outil (comptes, contacts…) ; cette carte ne fait que les reformer en fichier.
/**
 * #3864.6 / #3903.7 — le TABLEAU lui-même, séparé de la carte qui l'entoure.
 *
 * Partagé avec le repli d'un bloc `file_export` refusé par le contrat strict
 * (`StructuredReply.tsx`, `invalidBlockTableShape`) : les données restent un
 * TABLEAU même quand une colonne ou une cellule dépasse une limite du
 * contrat — un seul rendu de tableau, jamais un second qui diverge (GA-26).
 */
export function ExportTable({
  scrollLabel,
  columns,
  rows,
}: {
  scrollLabel: string
  columns: readonly string[]
  rows: readonly { cells: readonly (string | null)[] }[]
}) {
  const { t } = useTranslation(['chat', 'projects'])
  return (
    <Table scrollLabel={scrollLabel}>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <TableHead key={`col-${index}`} scope="col" className="max-w-[10rem] text-[var(--bellum-text-primary)]">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={`row-${rowIndex}`}>
            {row.cells.map((cell, cellIndex) => (
              // #4065.1 (18/10) — le tableau tient DANS sa bulle (730 px dans 645) : une cellule se comprime
              // (`max-w` + `truncate`), le texte complet reste au survol (`title`), jamais une colonne qui s'étire.
              <TableCell
                key={`cell-${rowIndex}-${cellIndex}`}
                className="max-w-[14rem] truncate text-[var(--bellum-text-primary)]"
                title={typeof cell === 'string' && cell.length > 0 ? cell : undefined}
              >
                {/* #3864.7 — jamais d'objet, de clé ni d'ISO brut dans une cellule.
                    #4075 — une valeur absente laisse la cellule VIDE (doctrine Louis 20/09 : dans une
                    liste, une absence ne fait rien) : ni « 0 », ni « non mesuré » sur deux lignes. */}
                {humanizeExportCell(cell, t)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function FileExportCard({ block }: { block: BlockOf<'file_export'> }) {
  const { t } = useTranslation('chat')
  const { t: tRules } = useTranslation('workspaceRules')
  // #2081.14 — le fichier est une SORTIE de données : sous la règle d'espace
  // « administrateurs seulement », le bouton est masqué et la carte dit
  // pourquoi, au lieu de promettre un fichier qu'elle ne donnera pas.
  const { allowed, grant } = useDataExit()
  const title = block.title ?? t('blocks.kind.file_export')
  return (
    <ReplyCard type={block.type} title={title} icon={Download}>
      <ExportTable scrollLabel={title} columns={block.columns} rows={block.rows} />
      {block.note ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {renderInlineMarkdown(block.note)}
        </Text>
      ) : null}
      {allowed && grant ? (
        <button
          type="button"
          onClick={() =>
            downloadCSV(
              toCsv([block.columns, ...block.rows.map(row => row.cells.map(cell => cell ?? ''))]),
              block.filename,
              grant,
            )
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11"
        >
          <Download className="size-3.5" aria-hidden />
          {t('blocks.download', { count: block.rows.length })}
        </button>
      ) : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {tRules('refusal.exportPolicy')}
        </Text>
      )}
    </ReplyCard>
  )
}
