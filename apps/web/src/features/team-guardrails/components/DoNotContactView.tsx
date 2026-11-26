import { useState } from 'react'
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
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from '@bellum/ui'
import { Plus } from 'lucide-react'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { formatDate } from '@/lib/locale'
import { useAddDoNotContact, useDoNotContactList, useLiftDoNotContact } from '../hooks'
import { useCanLiftDoNotContact } from './DoNotContactPreference'

/**
 * #4158.22 — RÉGLAGES › NE PAS CONTACTER : la liste de l'ESPACE. Un contact ou un
 * domaine, un motif obligatoire, l'auteur. Tout membre propose une entrée ;
 * retirer demande `team:manage` (le serveur le re-vérifie, l'écran ne propose le
 * bouton qu'à qui peut). On ne supprime pas : le retrait archive.
 *
 * Maquette `settings-espace` (Théo V22, A1) : un bloc de l'onglet Accès — « Ajouter » en tête ouvre la modale
 * (domaine + motif), la liste est le tableau commun : Personne ou domaine · Motif · Ajouté par · Actions.
 *
 * ⚠️ Distinct du refus d'une PERSONNE (fiche contact) et de l'effacement RGPD.
 *
 * Théo D settings-espace (Règles métier › Accès) : un BLOC de Réglages — titre, phrase, « Ajouter » qui ouvre la
 * fenêtre de saisie — puis un tableau Personne ou domaine · Motif · Ajouté par. Jamais un second titre de page.
 */
export function DoNotContactView() {
  const { t } = useTranslation('teamGuardrails')
  const list = useDoNotContactList()
  const add = useAddDoNotContact()
  const lift = useLiftDoNotContact()
  // Le serveur tient la règle (`team:manage`) ; ici on évite seulement de proposer un geste refusé (une règle,
  // partagée avec la fiche contact, GA-26).
  const canLift = useCanLiftDoNotContact()
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [reason, setReason] = useState('')
  const items = list.data?.items ?? []

  return (
    <SettingsBlock
      label={t('dnc.title')}
      description={t('dnc.subtitle')}
      actions={
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          {t('dnc.addOpen')}
        </Button>
      }
    >
      {list.isLoading ? (
        <ScreenState state="loading" message={t('dnc.loading')} />
      ) : list.isError ? (
        <ScreenState state="error" message={t('dnc.error')} />
      ) : items.length === 0 ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]" className="px-5 py-4 sm:px-6">
          {t('dnc.empty')}
        </Text>
      ) : (
        <Box className="min-w-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dnc.colTarget')}</TableHead>
                <TableHead>{t('dnc.colReason')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('dnc.colAddedBy')}</TableHead>
                <TableHead>
                  <span className="sr-only">{t('dnc.colActions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(entry => {
                const label = entry.kind === 'domain' ? (entry.domain ?? '') : (entry.contact_name ?? '')
                const date = formatDate(entry.created_at) ?? ''
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Text size="sm" weight="semibold" className="truncate">
                        {label}
                      </Text>
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {entry.kind === 'domain' ? t('dnc.kindDomain') : t('dnc.kindContact')}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                        {entry.reason}
                      </Text>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {entry.added_by_name ? <Text size="sm">{entry.added_by_name}</Text> : null}
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {date}
                      </Text>
                    </TableCell>
                    <TableCell className="text-right">
                      {canLift ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          title={t('dnc.liftTitle', { label })}
                          disabled={lift.isPending}
                          onClick={() => lift.mutate(entry.id)}
                        >
                          {t('dnc.lift')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('dnc.addTitle')}</DialogTitle>
            <DialogDescription>{t('dnc.subtitle')}</DialogDescription>
          </DialogHeader>
          <Box className="space-y-3">
            <Box>
              <Label htmlFor="dnc-domain">{t('dnc.domainLabel')}</Label>
              <Input
                id="dnc-domain"
                value={domain}
                onChange={event => setDomain(event.target.value)}
                placeholder={t('dnc.domainPlaceholder')}
              />
            </Box>
            <Box>
              <Label htmlFor="dnc-reason">{t('dnc.reasonLabel')}</Label>
              <Textarea
                id="dnc-reason"
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder={t('dnc.reasonPlaceholder')}
                maxLength={500}
              />
            </Box>
          </Box>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              className="min-h-11"
              disabled={domain.trim().length < 3 || reason.trim().length < 3 || add.isPending}
              onClick={() =>
                add.mutate(
                  { domain: domain.trim(), reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setDomain('')
                      setReason('')
                      setOpen(false)
                    },
                  },
                )
              }
            >
              {t('dnc.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsBlock>
  )
}
