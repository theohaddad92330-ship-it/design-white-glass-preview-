import type { ProjectReadRow } from '@bellum/contracts'
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Check, Circle, CircleDot } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectContacts } from '../hooks/useProjectContacts'
import { useProjectNeeds } from '../hooks/useProjectNeeds'
import { decisionChecklist, type DecisionState } from '../model/project-decisions'
import { BtmmpPanel } from './BtmmpPanel'

const ICON: Record<DecisionState, typeof Check> = { done: Check, partial: CircleDot, open: Circle }

/**
 * Théo C projects-fiche.N1/N2 — « CE QUI RESTE À DÉCIDER » : Périmètre · Budget et conditions · Accès au
 * décideur, chacun avec son état en une phrase, plus « Calculer la marge ». Front seul : l'état est DÉRIVÉ
 * du brief, de la cible tarifaire du besoin et du rôle des contacts reliés — rien n'est écrit ici. Une cible
 * existe ; elle ne vaut pas accord client (le budget reste « partiel »). La marge s'ouvre dans la fenêtre
 * « Économie de la mission » (le coût doit être fourni : aucun salaire net n'est converti).
 */
export function ProjectDecisionChecklist({ project }: { project: ProjectReadRow }) {
  const { t } = useTranslation('projects')
  const needs = useProjectNeeds(project.id)
  const contacts = useProjectContacts(project.id)
  const [marginOpen, setMarginOpen] = useState(false)

  const items = decisionChecklist({
    hasBrief: Boolean(project.detail?.trim()) || (needs.data ?? []).length > 0,
    hasTargetBudget: (needs.data ?? []).some(need => need.target_tjm_cents !== null),
    contacts: (contacts.data ?? []).map(contact => ({ role: contact.role, name: contact.full_name })),
  })

  return (
    <Card className="space-y-3 p-4">
      <Text element="h2" size="base" weight="semibold">
        {t('decide.title')}
      </Text>
      <ul className="space-y-2">
        {items.map(item => {
          const Icon = ICON[item.state]
          return (
            <li key={item.key} className="flex items-start gap-2">
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <Box className="min-w-0">
                <Text size="sm" weight="medium" className="block">
                  {t(`decide.items.${item.key}`)}
                </Text>
                <Text size="xs" color="text-muted-foreground" className="block">
                  {t(`decide.state.${item.key}.${item.state}`, { who: item.who ?? '' })}
                </Text>
              </Box>
            </li>
          )
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="pointer-coarse:min-h-11"
        onClick={() => setMarginOpen(true)}
      >
        {t('decide.computeMargin')}
      </Button>
      <Dialog open={marginOpen} onOpenChange={setMarginOpen}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('decide.marginTitle')}</DialogTitle>
            <DialogDescription>{t('decide.marginDescription')}</DialogDescription>
          </DialogHeader>
          <BtmmpPanel opportunityId={project.id} btmmp={project.btmmp ?? null} />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
