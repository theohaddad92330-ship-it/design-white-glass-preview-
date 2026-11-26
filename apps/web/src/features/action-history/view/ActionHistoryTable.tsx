import type { ActionHistoryItem } from '@bellum/contracts'
import { Box, BrailleLoader, Table, TableBody, TableHead, TableHeader, TableRow, Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { PAGE_GUTTER_MX } from '@/components/page/page-gutter'
import { ActionHistoryRow } from './ActionHistoryRow'

type ActionHistoryTableProps = {
  items: ActionHistoryItem[]
  loading: boolean
  // Le mode « Depuis votre dernière connexion » remplace l'état vide générique
  // par un message daté sans ambiguïté (« rien de nouveau depuis {date} »), pour
  // qu'un « 0 » ne se confonde jamais avec « aucune donnée ».
  emptyTitle?: string
  emptySubtitle?: string
}

export function ActionHistoryTable({ items, loading, emptyTitle, emptySubtitle }: ActionHistoryTableProps) {
  const { t } = useTranslation('actions')
  if (loading) {
    return (
      <Box
        className={cn(
          PAGE_GUTTER_MX,
          'min-w-0 flex-1 flex flex-row items-center gap-4 rounded-xl bg-[var(--bellum-surface-1)] p-6',
        )}
      >
        <BrailleLoader variant="grid-importing" />{' '}
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('table.loading')}
        </Text>
      </Box>
    )
  }

  if (items.length === 0) {
    return (
      <Box className={cn(PAGE_GUTTER_MX, 'min-w-0 flex-1 rounded-xl bg-[var(--bellum-surface-1)] p-6')}>
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {emptyTitle ?? t('table.emptyTitle')}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {emptySubtitle ?? t('table.emptySubtitle')}
        </Text>
      </Box>
    )
  }

  return (
    /* `overflow-y-auto` et non plus `overflow-x-auto` : le défilement HORIZONTAL
       appartient au conteneur que `Table` pose autour du tableau, et le déclarer
       ici en plus n'ajoutait qu'un second conteneur sur le même axe — celui du
       dessous, plus étroit, gagnait toujours. Cette boîte-ci garde ce qu'elle
       seule sait faire : borner la hauteur. `dvh` et non `vh`, parce que la
       barre d'adresse d'un téléphone rend `vh` faux de sa propre hauteur. */
    <Box className={cn(PAGE_GUTTER_MX, 'min-w-0 max-h-[80dvh] flex-1 overflow-y-auto')}>
      {/* Le plancher est la SOMME EXACTE des colonnes ci-dessous — 14 + 16 + 12
          + 11 + 7 + 3 = 63rem — et il s'écrit dans LEUR unité.

          Il valait `min-w-[900px]` pour des colonnes qui en réclamaient 1 008 :
          `table-fixed` répartissait alors le manque au prorata et rétrécissait
          les six colonnes ensemble, à toute largeur de fenêtre. C'est ce qui
          rendait « 30 août 20:… » sur un écran de 1 512 px — une ellipse, pas un
          hors-cadre : aucun défilement ne rattrape une colonne déjà rétrécie.

          En rem, le plancher suit le réglage « Taille du texte » exactement
          comme les colonnes qu'il doit couvrir. En pixels, il ment dès que le
          lecteur agrandit — la police RACINE grandit, lui non. Garde GA-118.

          `md:` parce que sous 768 px les quatre colonnes secondaires sont
          masquées : y forcer un plancher imposait un défilement horizontal sur
          chaque téléphone, pour deux colonnes qui tenaient dans l'écran. */}
      <Table
        className="table-fixed border-separate border-spacing-x-0 border-spacing-y-1 md:min-w-[63rem]"
        scrollLabel={t('table.scrollLabel')}
      >
        <ActionHistoryTableHeader />
        <TableBody>
          {items.map(item => (
            <ActionHistoryRow key={item.id} item={item} />
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

function ActionHistoryTableHeader() {
  const { t } = useTranslation('actions')
  const headClass = 'h-10 text-xs font-medium text-[var(--bellum-text-muted)]'
  return (
    <TableHeader>
      <TableRow className="border-transparent hover:bg-transparent">
        {/* Les six largeurs sont sur l'échelle Tailwind, donc en rem : une
            colonne qui porte du texte doit grandir avec lui. Les valeurs en
            pixels qu'elles remplacent (230 · 260 · 190 · 170 · 110 · 48) ne
            bougeaient pas d'un cheveu en « Grand », si bien que le texte
            débordait de sa propre cellule. Somme = 63rem, cf. le plancher. */}
        <TableHead className={cn(headClass, 'w-auto pl-4 md:w-56')}>{t('table.headerAccount')}</TableHead>
        <TableHead className={cn(headClass, 'w-auto pr-4 md:w-64 md:pr-0')}>{t('table.headerAction')}</TableHead>
        <TableHead className={cn(headClass, 'hidden w-48 md:table-cell')}>{t('table.headerUser')}</TableHead>
        <TableHead className={cn(headClass, 'hidden w-44 md:table-cell')}>{t('table.headerDate')}</TableHead>
        <TableHead className={cn(headClass, 'hidden w-28 md:table-cell')}>{t('table.headerStatus')}</TableHead>
        <TableHead className={cn(headClass, 'hidden w-12 pr-4 md:table-cell')} />
      </TableRow>
    </TableHeader>
  )
}
