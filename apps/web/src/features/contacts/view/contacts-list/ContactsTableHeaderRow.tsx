import { Box, Checkbox, TableHead, TableHeader, TableRow, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { contactsColumnClass } from './contactsTableColumns'

const COL_HEAD = 'h-11 text-sm font-medium text-[var(--bellum-text-muted)]'

export function ContactsTableHeaderRow({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  /** Toutes les lignes CHARGÉES sont cochées. */
  allSelected: boolean
  /** Au moins une, mais pas toutes — état indéterminé de la case. */
  someSelected: boolean
  onToggleAll: (selected: boolean) => void
}) {
  const { t } = useTranslation('contacts')
  return (
    <TableHeader>
      {/* #2465 — c'est CETTE ligne qui dimensionne le tableau : en `table-fixed`,
          les largeurs de colonnes se lisent sur la première ligne. Visibilité ET
          part viennent du registre, jamais d'une classe écrite ici — l'entête et
          la cellule lisent la même entrée, elles ne peuvent plus diverger. */}
      <TableRow className="border-transparent hover:bg-transparent">
        {/* #3713.3 — identité + fonction : nom, intitulé de poste, rôle de
            décision. Ancien « Nom » + « Rôle », fusionnés en une cellule. */}
        <TableHead data-column="identity" className={cn(COL_HEAD, contactsColumnClass('identity'), 'pl-3')}>
          <Box display="flex" className="items-center gap-3">
            {/* Sélection globale (restitution V2 §5, « action de masse »). Elle porte
                sur les lignes CHARGÉES — jamais sur un total serveur qu'on n'a pas
                sous la main : cocher ne doit pas promettre d'agir sur des contacts
                que l'écran n'a pas encore vus. */}
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              aria-label={t('table.selectAllAria')}
              onCheckedChange={checked => onToggleAll(checked === true)}
            />
            <span className="truncate">{t('table.headerIdentity')}</span>
          </Box>
        </TableHead>
        {/* #3713.3 — entreprise + périmètre : l'entreprise et l'ENTITÉ (PDF 2 §2,
            la division du client, distincte de l'entreprise). « Verrouillé chez
            la DSI Groupe, ouvert chez Renouvelables » ne s'écrit nulle part si
            la colonne n'existe pas. */}
        <TableHead data-column="company" className={cn(COL_HEAD, contactsColumnClass('company'))}>
          {t('table.headerCompany')}
        </TableHead>
        {/* #3713.3 — moyen de contact/geste : e-mail / LinkedIn + téléphone.
            Ancien « Email / LinkedIn » + « Mobile / Direct ». */}
        <TableHead data-column="contact" className={cn(COL_HEAD, contactsColumnClass('contact'))}>
          {t('table.headerContact')}
        </TableHead>
        {/* #3713.3 — situation relationnelle : le PALIER d'organisation (calculé
            — `computeHierarchyLevel`, miroir de `hierarchy_level.py`, jamais un
            second barème) + l'état du cycle (déjà contacté, enrichi récemment,
            e-mail rejeté). Ancien « Niveau » + « État ». */}
        <TableHead data-column="relation" className={cn(COL_HEAD, contactsColumnClass('relation'))}>
          {t('table.headerRelation')}
        </TableHead>
        {/* #3713.3 — suivi commercial : date de vérification, score et action.
            Ancien « Donnée vérifiée le » + « Score » + « Action » — toujours
            visible pour garder le geste atteignable à tout palier. */}
        <TableHead data-column="commercial" className={cn(COL_HEAD, contactsColumnClass('commercial'))}>
          {t('table.headerCommercial')}
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}
