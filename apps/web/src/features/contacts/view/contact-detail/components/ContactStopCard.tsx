import { MOTION_CONTACT_STOP_OUTCOMES, type ContactStopReason } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContactStop, useRecordContactStop } from '@/features/contacts/hooks/useContactStop'
import { i18n } from '@/i18n'

/**
 * Le refus de contact — « ne me contactez plus ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `POST/GET /contacts/:id/stop` existait, gardé, testé, consulté par quinze
 * chemins d'envoi (GA-122) — et **aucun écran ne le proposait**. Une personne
 * pouvait demander qu'on cesse ; le produit savait l'enregistrer, personne ne
 * pouvait le faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI LE DISTINGUE D'« ÉCARTER » (la carte voisine)
 * ─────────────────────────────────────────────────────────────────────────────
 * Écarter est NOTRE décision : le contact sort de nos listes, et c'est
 * réversible. Le refus est LA SIENNE : il retire le moyen de la joindre
 * (l'adresse part à la liste de suppression, les séquences en cours
 * s'annulent), et **il ne se lève pas d'ici**. Confondre les deux ferait
 * réintégrer d'un clic quelqu'un qui a dit « cessez ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES TENUES PAR L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Aucune levée.** Décision D351 : défaire un refus est un geste dont le
 *    titulaire est la personne, pas nous. Il n'existe pas de route pour le
 *    retirer, et l'écran n'en propose donc aucune — pas même grisée. Un bouton
 *    inerte invite à ouvrir la route qui le servirait.
 * 2. **La conséquence est annoncée AVANT le clic**, dans une confirmation :
 *    le geste est irréversible, et une irréversibilité qui se découvre après
 *    coup n'a pas été consentie.
 * 3. **Seules les trois raisons DÉCLARABLES sont offertes.** `unsubscribed` et
 *    `bounced` viennent du serveur de messagerie : personne ne les « déclare »,
 *    et les proposer laisserait quelqu'un affirmer un désabonnement qui n'a
 *    jamais eu lieu.
 */
export function ContactStopCard({ contactId }: { contactId: string }) {
  const { t } = useTranslation('contacts')
  const { data: stop, isLoading } = useContactStop(contactId)
  const record = useRecordContactStop(contactId)
  const [reason, setReason] = useState<ContactStopReason | ''>('')
  const [confirming, setConfirming] = useState(false)

  // On n'affiche RIEN tant qu'on ne sait pas : « aucun refus » et « pas encore
  // lu » ne se ressemblent pas, et proposer le formulaire pendant le chargement
  // ferait déclarer un refus déjà posé.
  if (isLoading) return null

  if (stop) {
    return (
      <Box className="rounded-md border border-border bg-card p-4">
        <Box display="flex" className="flex-wrap items-baseline justify-between gap-2">
          <Text element="h3" size="sm" weight="medium">
            {t('stop.declaredTitle')}
          </Text>
          <Badge variant="warning">{t('stop.badge')}</Badge>
        </Box>
        <Text size="sm" color="text-[var(--warning-soft-text)]" className="mt-2">
          {/* i18n keys: stop.reason.do_not_call | stop.reason.confirmed_wrong_contact |
              stop.reason.relationship_invalid | stop.reason.unsubscribed | stop.reason.bounced */}
          {t('stop.since', { reason: t(`stop.reason.${stop.reason}`), date: formatDay(stop.since) })}
        </Text>
        {stop.motion ? (
          <Text size="xs" color="text-muted-foreground" className="mt-1">
            {t('stop.viaMotion', { motion: stop.motion })}
          </Text>
        ) : null}
        {/* Pas de bouton. La phrase dit pourquoi, plutôt qu'un geste grisé qui
            laisserait croire qu'il suffit d'un droit de plus. */}
        <Text size="xs" color="text-muted-foreground" className="mt-2">
          {t('stop.noLift')}
        </Text>
      </Box>
    )
  }

  return (
    <Box className="rounded-md border border-border bg-card p-4">
      <Text element="h3" size="sm" weight="medium">
        {t('stop.title')}
      </Text>
      <Text size="sm" color="text-muted-foreground" className="mt-2">
        {t('stop.explain')}
      </Text>

      {/* #3702 — mesuré en prod le 10/10 : « Enregistrer le refus » coupé à droite de
          la carte (sélecteur 288 px + bouton dans une colonne étroite). La rangée passe
          à la ligne, le sélecteur peut rétrécir (`min-w-0`), le bouton garde 44 px. */}
      <Box className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={reason} onValueChange={next => setReason(next as ContactStopReason)}>
          <SelectTrigger aria-label={t('stop.reasonLabel')} className="w-full min-w-0 sm:w-72 sm:max-w-full">
            <SelectValue placeholder={t('stop.reasonPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {MOTION_CONTACT_STOP_OUTCOMES.map(value => (
              <SelectItem key={value} value={value}>
                {t(`stop.reason.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 max-w-full whitespace-normal"
          // Inerte tant qu'aucune raison n'est choisie : le serveur refuse un
          // arrêt sans raison, et l'annoncer ici évite un aller-retour pour
          // apprendre une règle qu'on pouvait dire.
          disabled={!reason || record.isPending}
          onClick={() => setConfirming(true)}
        >
          {t('stop.action')}
        </Button>
      </Box>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('stop.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('stop.confirmBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t('stop.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!reason || record.isPending}
              onClick={() => {
                if (!reason) return
                record.mutate({ reason })
                setConfirming(false)
              }}
            >
              {t('stop.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

/** Un refus est un fait DATÉ — jamais un booléen. */
function formatDay(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
