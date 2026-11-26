import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { WorkContextStatus, WorkContextVisibility } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useActiveWorkContextStore } from '../activeWorkContextStore'
import { useCreateWorkContext } from '../hooks'

/**
 * #2455.1/.4 — La modale de création réutilisée par les trois parcours
 * d'entrée demandés (Mission ponctuelle / Mon activité / un résultat) : un
 * seul formulaire, trois déclencheurs distincts (règle GA-26 — un réglage vit
 * à un seul endroit).
 */
export type CreateWorkContextDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nom pré-rempli selon le parcours d'entrée (ex. secteur du profil courant). */
  prefillName?: string
  prefillSectors?: string[]
  prefillTerritories?: string[]
  /** #2455.3 — le parcours chat par défaut à `temporaire`, les autres à `enregistre`. */
  defaultStatus?: WorkContextStatus
  /** Après création, active immédiatement le contexte (affichage banner #2455.5). */
  activateAfterCreate?: boolean
}

export function CreateWorkContextDialog({
  open,
  onOpenChange,
  prefillName = '',
  prefillSectors = [],
  prefillTerritories = [],
  defaultStatus = 'enregistre',
  activateAfterCreate = false,
}: CreateWorkContextDialogProps) {
  const { t } = useTranslation('workContexts')
  const create = useCreateWorkContext()
  const activateStore = useActiveWorkContextStore()
  const [name, setName] = useState(prefillName)
  const [sectors, setSectors] = useState(prefillSectors.join(', '))
  const [territories, setTerritories] = useState(prefillTerritories.join(', '))
  const [visibility, setVisibility] = useState<WorkContextVisibility>('personal')

  function reset() {
    setName(prefillName)
    setSectors(prefillSectors.join(', '))
    setTerritories(prefillTerritories.join(', '))
    setVisibility('personal')
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const created = await create.mutateAsync({
        name: trimmed,
        status: defaultStatus,
        visibility,
        sectors: splitList(sectors),
        territories: splitList(territories),
      })
      toast.success(t('create.success', { name: created.name }))
      if (activateAfterCreate) {
        activateStore.activate({ id: created.context_id, name: created.name })
      }
      reset()
      onOpenChange(false)
    } catch {
      toast.error(t('create.failed'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-w-md" closeLabel={t('create.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="work-context-name">{t('create.nameLabel')}</Label>
            <Input
              id="work-context-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('create.namePlaceholder')}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="work-context-sectors">{t('create.sectorsLabel')}</Label>
            <Input
              id="work-context-sectors"
              value={sectors}
              onChange={e => setSectors(e.target.value)}
              placeholder={t('create.sectorsPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="work-context-territories">{t('create.territoriesLabel')}</Label>
            <Input
              id="work-context-territories"
              value={territories}
              onChange={e => setTerritories(e.target.value)}
              placeholder={t('create.territoriesPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="work-context-visibility">{t('create.visibilityLabel')}</Label>
            <Select value={visibility} onValueChange={value => setVisibility(value as WorkContextVisibility)}>
              <SelectTrigger id="work-context-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">{t('visibility.personal')}</SelectItem>
                <SelectItem value="bu">{t('visibility.bu')}</SelectItem>
                <SelectItem value="group">{t('visibility.group')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('create.profileUnchangedNotice')}
          </Text>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('create.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || create.isPending}>
            {create.isPending ? t('create.saving') : t('create.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}
