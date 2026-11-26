import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { FileText, Handshake, PenLine, RefreshCw, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useDebounce } from '@/hooks/useDebounce'
import { useOdooSales } from '../odoo-sales-api'
import { CreateMissionFromDocumentDialog } from './CreateMissionFromDocumentDialog'
import { MissionCreateForm } from './MissionCreateForm'
import { OdooSalesSection } from './OdooSalesSection'

type Door = 'choose' | 'manual' | 'document' | 'odoo'

/**
 * Théo missions-planning.R8 — « CRÉER UNE MISSION » : une fenêtre, trois portes
 * (quatre quand l'outil de gestion de l'espace est branché).
 *
 *  - **Saisir la mission** — le formulaire de `/missions/nouvelle`, dans la
 *    fenêtre. Il accepte une affaire gagnée en champ : la mission naît liée.
 *  - **À partir d'un document** — le contrat ou le bon de commande est lu, les
 *    champs sont PROPOSÉS ; rien n'est créé avant la revue.
 *  - **Depuis une affaire gagnée** — mène au parcours Affaires, où l'affaire
 *    signée ouvre sa mission.
 *  - **Reprendre depuis ton outil de gestion** — la reprise des ventes
 *    confirmées, une par une ou toutes après relecture (missions-planning.A3).
 *
 * La route `/missions/nouvelle` reste, pour les liens entrants : aucune route
 * n'est ajoutée ni retirée.
 */
export function PlanningCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('missions')
  const navigate = useNavigate()
  const [door, setDoor] = useState<Door>('choose')
  const odoo = useOdooSales()
  const odooConnected = odoo.data !== undefined && odoo.data.status !== 'not_connected'

  const close = (next: boolean) => {
    if (!next) setDoor('choose')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(`planning.screen.create.title.${door}`)}</DialogTitle>
          <DialogDescription>{t(`planning.screen.create.intro.${door}`)}</DialogDescription>
        </DialogHeader>

        {door === 'choose' ? (
          <Box className="space-y-2">
            <SourceChoice
              icon={PenLine}
              title={t('planning.screen.create.manual.title')}
              hint={t('planning.screen.create.manual.hint')}
              onClick={() => setDoor('manual')}
            />
            <SourceChoice
              icon={FileText}
              title={t('planning.screen.create.document.title')}
              hint={t('planning.screen.create.document.hint')}
              onClick={() => setDoor('document')}
            />
            <SourceChoice
              icon={Handshake}
              title={t('planning.screen.create.won.title')}
              hint={t('planning.screen.create.won.hint')}
              to="/projects"
            />
            {odooConnected ? (
              <SourceChoice
                icon={RefreshCw}
                title={t('planning.screen.create.odoo.title')}
                hint={t('planning.screen.create.odoo.hint')}
                onClick={() => setDoor('odoo')}
              />
            ) : null}
          </Box>
        ) : null}

        {door === 'manual' ? (
          <MissionCreateForm
            onCancel={() => setDoor('choose')}
            onCreated={mission => {
              close(false)
              void navigate({ to: '/missions/$id', params: { id: mission.id } })
            }}
          />
        ) : null}

        {door === 'document' ? <DocumentDoor onBack={() => setDoor('choose')} /> : null}

        {door === 'odoo' ? <OdooSalesSection /> : null}

        <DialogFooter>
          {door === 'choose' ? null : (
            <Button type="button" variant="ghost" className="pointer-coarse:min-h-11" onClick={() => setDoor('choose')}>
              {t('planning.screen.create.back')}
            </Button>
          )}
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => close(false)}>
            {t('planning.screen.create.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SourceChoice({
  icon: Icon,
  title,
  hint,
  onClick,
  to,
}: {
  icon: LucideIcon
  title: string
  hint: string
  onClick?: () => void
  to?: '/projects'
}) {
  const body = (
    <>
      <Icon className="mt-0.5 size-5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
      <span className="min-w-0">
        <Text element="span" size="sm" weight="semibold" className="block">
          {title}
        </Text>
        <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      </span>
    </>
  )
  const className =
    'pointer-coarse:min-h-11 flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-[var(--bg-surface-hover)]'
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  )
}

/** Le document se lit POUR un compte : on le choisit d'abord, comme sur la fiche du compte. */
function DocumentDoor({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('missions')
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 250)
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const accounts = useAccounts({ q: debounced || undefined, limit: 8 })
  const choices = useMemo(() => accounts.data?.pages.flatMap(page => page.data).slice(0, 8) ?? [], [accounts.data])

  return (
    <Box className="space-y-2">
      <label htmlFor="planning-document-account" className="text-sm font-medium">
        {t('createForm.account')}
      </label>
      <Input
        id="planning-document-account"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={t('createForm.accountPlaceholder')}
        autoComplete="off"
      />
      {search.trim() ? (
        <Box className="flex flex-col gap-1" role="list">
          {choices.map(choice => (
            <Button
              key={choice.id}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start pointer-coarse:min-h-11"
              onClick={() => setPicked({ id: choice.id, name: choice.company_name })}
            >
              {choice.company_name}
            </Button>
          ))}
        </Box>
      ) : null}
      {picked ? (
        <CreateMissionFromDocumentDialog
          accountId={picked.id}
          accountName={picked.name}
          open
          onOpenChange={next => {
            if (!next) {
              setPicked(null)
              onBack()
            }
          }}
        />
      ) : null}
    </Box>
  )
}
