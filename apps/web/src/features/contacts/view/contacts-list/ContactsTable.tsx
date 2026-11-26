import { departmentByCode } from '@/features/accounts/lib/frenchDepartments'
import { Box, Checkbox, Table, TableBody, TableCell, TableRow, Text } from '@bellum/ui'
import { capitalize } from '@bellum/utils'
import { Fragment, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactTableRow } from './ContactTableRow'
import { ContactsTableHeaderRow } from './ContactsTableHeaderRow'
import { CONTACTS_TABLE_SHELL, CONTACTS_TABLE_COLUMN_COUNT } from './contactsTableColumns'

type ContactsTableProps = {
  rows: GlobalContact[]
  selectedContactIds: ReadonlySet<string>
  onContactSelectionChange: (contact: GlobalContact, selected: boolean) => void
  onContactRowMouseDown: (contact: GlobalContact, event: MouseEvent<HTMLTableRowElement>) => void
  onContactRowMouseEnter: (contact: GlobalContact) => void
  /** Coche/décoche toutes les lignes chargées d'un coup. */
  onToggleAll: (selected: boolean) => void
  /** #4597.4 — cliquer l'origine d'une ligne filtre la liste sur cette source. */
  onFilterBySource?: (source: string) => void
  /**
   * #3942.5 (brief F05, point 2) — insère un en-tête PUREMENT visuel entre
   * deux comptes quand la liste est groupée par compte (portée Recommandés,
   * déjà ordonnée ainsi côté serveur). Jamais une ligne SÉLECTIONNABLE : la
   * sélection en masse reste posée sur `rows`, cet en-tête n'y figure pas —
   * « si la liste le permet sans casser la sélection en masse » (brief).
   */
  groupByAccount?: boolean
  /**
   * #4982.2 — la liste est triée par zone : un en-tête par RÉGION (#4982, la ville en sous-libellé ; pas de carte). Le serveur range les lignes d'une
   * même ville côte à côte ; une ligne sans lieu tombe sous « Zone inconnue », jamais sous une ville devinée.
   */
  groupByZone?: boolean
  /** Théo B c1-repertoire.N1 — « Compacter la liste ». */
  compact?: boolean
}

/** #4982 — la région d'un département posé par le serveur (référentiel web existant) ; Corse = « 20 » côté serveur. */
function zoneRegionOf(department: string | null | undefined): string | null {
  const code = department?.trim()
  if (!code) return null
  return departmentByCode(code === '20' ? '2A' : code)?.region ?? null
}

// #4962 (recette 01/11) — LinkedIn livre « Greater Paris Metropolitan Region » / « Greater Lille Metropolitan » :
// on garde la ville et on traduit le reste (« Région de Paris »), sans rien deviner d'autre.
const LINKEDIN_METRO = /^Greater\s+(.+?)\s+(?:Metropolitan(?:\s+(?:Region|Area))?|Area|Region)$/i

export function ContactsTable({
  rows,
  selectedContactIds,
  onContactSelectionChange,
  onContactRowMouseDown,
  onContactRowMouseEnter,
  onToggleAll,
  onFilterBySource,
  groupByAccount = false,
  groupByZone = false,
  compact = false,
}: ContactsTableProps) {
  const { t } = useTranslation('contacts')
  const selectedOnPage = rows.filter(row => selectedContactIds.has(row.id)).length
  let previousAccountId: string | null | undefined
  let previousRegion: string | null | undefined
  let previousCity: string | null | undefined
  // #4093 — état de la case d'une entreprise : tous / certains / aucun de ses contacts chargés.
  const groupState = (accountId: string | null | undefined): 'all' | 'some' | 'none' => {
    const members = rows.filter(r => r.account_id === accountId)
    const picked = members.filter(r => selectedContactIds.has(r.id)).length
    return picked === 0 ? 'none' : picked === members.length ? 'all' : 'some'
  }
  return (
    <Box data-density={compact ? 'compact' : 'comfortable'}>
      {/* #2465 — « le tableau doit tenir dans l'écran peu import la résolution ».
          La coque et les parts de colonnes vivent dans `contactsTableColumns.ts`
          (un réglage vit à un seul endroit) : `table-fixed`, des parts qui font
          100 % à chaque palier, et aucun plancher en pixels. Mesuré le 16/09 en
          production : conteneur 1195 px, tableau 1587 px. */}
      <Table className={CONTACTS_TABLE_SHELL}>
        <ContactsTableHeaderRow
          allSelected={rows.length > 0 && selectedOnPage === rows.length}
          someSelected={selectedOnPage > 0 && selectedOnPage < rows.length}
          onToggleAll={onToggleAll}
        />
        <TableBody>
          {rows.map(row => {
            // #3942.5 — un en-tête par compte QUAND le compte change ET que le
            // serveur a bien posé un chemin (`recommended_path_size` absent en
            // portée « Tous » : rien à grouper, le tri n'est plus par compte).
            const showGroupHeader =
              groupByAccount && row.recommended_path_size != null && row.account_id !== previousAccountId
            previousAccountId = row.account_id
            // #4982 — région d'abord (Louis 31/10) : un en-tête quand la RÉGION change, la ville en sous-libellé.
            // Région lue au département posé par le serveur ; sans département = « Région inconnue », jamais devinée.
            const region = zoneRegionOf(row.zone_department)
            const rawCity = row.zone_city?.trim() || null
            const metroCity = rawCity ? LINKEDIN_METRO.exec(rawCity)?.[1] : undefined
            const city = metroCity ? t('zoneSort.metroRegion', { city: metroCity }) : rawCity
            const showZoneHeader = groupByZone && (previousRegion === undefined || region !== previousRegion)
            const showCityLine = groupByZone && city !== null && (showZoneHeader || city !== previousCity)
            previousRegion = region
            previousCity = city
            return (
              <Fragment key={row.id}>
                {showZoneHeader && (
                  <TableRow aria-label={t('zoneSort.groupTitle')} className="border-transparent hover:bg-transparent">
                    <TableCell
                      colSpan={CONTACTS_TABLE_COLUMN_COUNT}
                      className="bg-[var(--bellum-surface-1)] px-3 py-2 pt-5 first:pt-2"
                    >
                      <Text element="span" size="sm" weight="semibold" data-testid="contacts-group-zone">
                        {region ?? t('zoneSort.unknown')}
                      </Text>
                    </TableCell>
                  </TableRow>
                )}
                {showCityLine && (
                  <TableRow aria-label={t('zoneSort.cityTitle')} className="border-transparent hover:bg-transparent">
                    <TableCell colSpan={CONTACTS_TABLE_COLUMN_COUNT} className="bg-[var(--bellum-surface-1)] px-3 py-1">
                      <Text element="span" size="xs" data-testid="contacts-group-city">
                        {city}
                      </Text>
                    </TableCell>
                  </TableRow>
                )}
                {showGroupHeader && (
                  <TableRow
                    aria-label={t('recommended.groupTitle')}
                    className="border-transparent hover:bg-transparent"
                  >
                    <TableCell
                      colSpan={CONTACTS_TABLE_COLUMN_COUNT}
                      className="bg-[var(--bellum-surface-1)] px-3 py-2 pt-5 first:pt-2"
                    >
                      <Box display="flex" className="items-center gap-2">
                        {/* #4093 — case de l'entreprise : sélectionne/désélectionne tous ses
                            contacts chargés via la sélection existante (mêmes lignes, même
                            état) ; indéterminée si partiel. */}
                        <Checkbox
                          checked={
                            groupState(row.account_id) === 'all'
                              ? true
                              : groupState(row.account_id) === 'some'
                                ? 'indeterminate'
                                : false
                          }
                          aria-label={t('table.selectCompanyAria', {
                            company: row.company_name ? capitalize(row.company_name) : t('table.companyUnknown'),
                          })}
                          onCheckedChange={checked => {
                            for (const member of rows.filter(r => r.account_id === row.account_id)) {
                              onContactSelectionChange(member, checked === true)
                            }
                          }}
                        />
                        {/* #4503.6 (contrat Louis 24/10) — « Compte — N contacts prioritaires », au dessin de la maquette :
                            le compte en gras, le compte de contacts en retrait, sur la même ligne. */}
                        <Text element="span" size="sm" weight="semibold" data-testid="contacts-group-account">
                          {row.company_name ? capitalize(row.company_name) : t('table.companyUnknown')}
                        </Text>
                        <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
                          {t('recommended.groupCount', { count: row.recommended_path_size })}
                        </Text>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                <ContactTableRow
                  contact={row}
                  isSelected={selectedContactIds.has(row.id)}
                  onRowMouseDown={event => onContactRowMouseDown(row, event)}
                  onRowMouseEnter={() => onContactRowMouseEnter(row)}
                  onSelectionChange={selected => onContactSelectionChange(row, selected)}
                  onFilterBySource={onFilterBySource}
                />
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}
