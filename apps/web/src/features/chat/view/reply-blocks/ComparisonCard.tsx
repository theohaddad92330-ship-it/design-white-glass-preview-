import { useTranslation } from 'react-i18next'
import { Scale } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { renderInlineMarkdown } from '../markdown'
import { ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #1914.5 — une comparaison côte à côte.
 *
 * Le moteur markdown du chat ne rend AUCUN tableau : une comparaison demandée à
 * Laura sortait en puces, un sujet sous l'autre. Ici, un vrai tableau — en-têtes
 * de colonne ET de ligne (un lecteur d'écran annonce « SNCF, Taille au registre »),
 * pleine largeur, et qui défile dans SON conteneur quand quatre sujets ne tiennent
 * pas dans la bulle (`Table`, jamais le corps de la page).
 *
 * Une case inconnue passe par `UnknownValue` : « non mesuré », jamais « 0 », et
 * jamais un tiret qui se lirait « aucun ».
 */
export function ComparisonCard({ block }: { block: BlockOf<'comparison'> }) {
  const { t } = useTranslation('chat')
  const title = block.title ?? t('blocks.kind.comparison')
  return (
    <ReplyCard type={block.type} title={title} icon={Scale}>
      <Table scrollLabel={title}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              <span className="sr-only">{t('blocks.criterion')}</span>
            </TableHead>
            {block.columns.map((column, index) => (
              <TableHead key={`col-${index}`} scope="col" className="text-[var(--bellum-text-primary)]">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {block.rows.map((row, rowIndex) => (
            <TableRow key={`row-${rowIndex}`}>
              <TableHead scope="row" className="text-[var(--bellum-text-secondary)]">
                {row.label}
              </TableHead>
              {row.cells.map((cell, cellIndex) => (
                <TableCell key={`cell-${rowIndex}-${cellIndex}`} className="text-[var(--bellum-text-primary)]">
                  {cell === null ? <UnknownValue /> : cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {block.note ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {renderInlineMarkdown(block.note)}
        </Text>
      ) : null}
    </ReplyCard>
  )
}
