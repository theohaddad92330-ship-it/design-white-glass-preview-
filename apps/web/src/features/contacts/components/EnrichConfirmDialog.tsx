import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  Text,
} from '@bellum/ui'
import { type BulkEnrichmentExclusionReason, type EnrichmentCoordinate } from '@bellum/contracts'
import { Linkedin, Mail, Phone, Zap } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEnrichmentDurationEstimate } from '@/features/contacts/hooks/useEnrichmentDurationEstimate'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { enrichmentDurationAnnouncement } from './enrichment-duration-text'

/**
 * #2988.1 — la coordonnée à rechercher : les deux (défaut), ou une seule. Le
 * pipeline serveur (queue, worker, fournisseurs) filtre déjà par `only` — ce
 * type est la forme ÉCRAN de ce choix ; `'both'` s'y traduit par `only`
 * absent, jamais une valeur envoyée au serveur.
 */
export type EnrichmentScope = 'both' | EnrichmentCoordinate

type EnrichConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Number of contacts about to be enriched. Absent sur le chemin RECHERCHE
   * (#2120.52) : une recherche de nouveaux contacts n'a pas encore de compte à
   * annoncer — le dossier peut être vide (`ContactsEmptyState`), c'est
   * justement pourquoi on cherche. Un `0` y mentirait autant qu'un chiffre
   * inventé ; l'absence est donc un état à part, pas un repli sur `0`.
   */
  count?: number
  /** #3819 — chemin RECHERCHE : l'entreprise (ou « N entreprises ») visée, nommée dans le titre. */
  subject?: string
  /**
   * #2120.52-57 — chemin RECHERCHE de contacts (`POST /analysis/:id/enrich-contacts`,
   * Phase 2) : aucune durée mesurée, libellé « Lancer la recherche ».
   * #4463 — plus aucun coût affiché, quel que soit le chemin.
   */
  free?: boolean
  /** Fired when the user confirms; the caller runs the actual enrichment. */
  onConfirm: () => void
  /**
   * Le refus, quand il vaut mieux qu'une impasse.
   *
   * Cas mesuré : « ouvrir un canal » sur une sélection dont une partie a déjà
   * le canal et l'autre pas. Annoncer le coût est obligatoire ; laisser le
   * refus ne RIEN faire enferme l'utilisateur — il reclique, on lui reredemande.
   * Le refus fait alors la part gratuite : ouvrir avec ce qui est déjà en main.
   *
   * Absent ⇒ « Annuler », qui ferme et ne fait rien. C'est le comportement des
   * quatre autres appelants, et il ne change pas.
   */
  declineLabel?: string
  onDecline?: () => void
  /**
   * #2297.25 / #2297.26 — le reste de la sélection qui ne partira PAS, par
   * raison nommée (identité non résolue / déjà pourvu d'une coordonnée /
   * déjà enrichi récemment — cooldown, `planBulkEnrichment`). Absent ou vide
   * ⇒ rien à annoncer — un lot unique (chemin UN contact) n'a jamais
   * d'exclusion à ce niveau.
   */
  excluded?: readonly { reason: BulkEnrichmentExclusionReason; count: number }[]
  /**
   * #2988.1 — enrichissement séparé par coordonnée. Absent ⇒ pas de
   * sélecteur : les appelants existants (fiche contact, ligne de tableau)
   * gardent leur écran inchangé. Fourni ⇒ rangée « Les deux / Email
   * seulement / Téléphone seulement », contrôlée par l'appelant (le lot
   * d'enrichissement de la liste de contacts, #2161/#2988).
   */
  coordinateScope?: EnrichmentScope
  onCoordinateScopeChange?: (next: EnrichmentScope) => void
  /**
   * #4016.L8b — « Ne plus me demander » : fourni ⇒ une case sur la question de coût d'UN contact
   * (jamais un lot, GA-49 ; jamais un chemin gratuit, il n'y a pas de coût à ne plus annoncer).
   * Cochée puis confirmée, l'appelant pose la préférence (`useEnrichmentCostPreference`).
   */
  onDontAskAgain?: () => void
  /**
   * #4504.2 (contrat Louis 24/10) — ce qu'il faut résoudre AVANT d'enrichir UN contact (l'explication de la
   * recherche par rôle, le champ du nom complet, « Nom à révéler ») : quitte l'en-tête de la fiche pour la
   * modale qu'ouvre « Enrichir ». Rendu sous l'en-tête de la modale ; absent ⇒ rien.
   */
  children?: ReactNode
  /** #4504.2 — tant que ce qui précède n'est pas résolu (aucune ancre de recherche), « Enrichir » reste grisé. */
  confirmDisabled?: boolean
}

const EXCLUSION_LABEL_KEY: Record<BulkEnrichmentExclusionReason, string> = {
  identity_unresolved: 'enrich.confirm.excludedIdentityUnresolved',
  already_has_contact_info: 'enrich.confirm.excludedAlreadyHasContactInfo',
  on_cooldown: 'enrich.confirm.excludedOnCooldown',
}

/**
 * Transparence billing (addendum Théo p.11, beta 15/08) : confirmation AVANT
 * tout enrichissement — coût en crédits (1 par contact), source (Apollo /
 * Dropcontact) et champs attendus (email + téléphone + LinkedIn) annoncés
 * avant le débit. Rappelle aussi la garantie côté serveur : aucun crédit n'est
 * débité si la recherche ne trouve rien (`ContactsService.enrichContact`).
 */
export function EnrichConfirmDialog({
  open,
  onOpenChange,
  count,
  subject,
  free,
  onConfirm,
  declineLabel,
  onDecline,
  excluded,
  coordinateScope,
  onCoordinateScopeChange,
  onDontAskAgain,
  children,
  confirmDisabled = false,
}: EnrichConfirmDialogProps) {
  const { t } = useTranslation('contacts')
  const dontAskId = useId()
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const scope = coordinateScope ?? 'both'
  // #2297 — le titre nomme la SÉLECTION (facturables + exclus annoncés plus bas) ; le coût, lui, reste celui des seuls facturables.
  const selectedCount = count === undefined ? undefined : (excluded ?? []).reduce((sum, row) => sum + row.count, count)
  // #2297 (30/09/2026, recette « 1 crédit sera consommé » sous le bandeau
  // « MODE DÉMO · aucun crédit consommé ») — l'espace de démonstration ne
  // débite JAMAIS (`ContactsService.enrichContactInDemo`, `credits_debited: 0`
  // en dur) : annoncer un coût ici contredisait le bandeau permanent
  // (`DemoModeBanner`), qui lit la MÊME source (`useIsDemo`, GA-26).
  const isDemo = useIsDemo()
  // #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE et s'annonce,
  // mais SEULEMENT sur le chemin qui la mesure. La médiane vient de
  // `ContactsService.enrichContact` ; le chemin RECHERCHE (`free`, Phase 2
  // `enrich-contacts`) n'appelle jamais cette méthode — lui annoncer cette
  // médiane décrirait une mesure qui ne parle pas de lui. `enabled: open &&
  // !free` : pas d'appel réseau pour une donnée que ce chemin n'affichera
  // jamais.
  const { data: durationData } = useEnrichmentDurationEstimate(open && !free)
  const durationAnnouncement = free
    ? ({ key: 'enrich.confirm.durationUnknown' } as const)
    : enrichmentDurationAnnouncement(durationData?.estimate ?? null, count)

  // #4016.L8b — la case n'existe que sur la question d'UN contact payant.
  const offersDontAsk = onDontAskAgain !== undefined && count === 1 && !free && !isDemo

  const handleConfirm = () => {
    // Confirm BEFORE closing: the caller's confirm handler may read state that
    // its own close handler resets (e.g. the pending-contacts list).
    onConfirm()
    if (offersDontAsk && dontAskAgain) onDontAskAgain()
    onOpenChange(false)
  }

  // Même ordre que la confirmation, et pour la même raison : le geste lit un
  // état que la fermeture remet à zéro.
  const handleDecline = () => {
    onDecline?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">
            {count !== undefined
              ? t('enrich.confirm.title', { count: selectedCount })
              : subject
                ? t('enrich.confirm.titleSearchFor', { subject })
                : t('enrich.confirm.titleSearch')}
          </DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('enrich.confirm.via')}
          </DialogDescription>
        </DialogHeader>

        {children}

        <Box className="rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
          <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
            {t('enrich.confirm.expectedFields')}
          </Text>
          <Box display="flex" className="mt-2 flex-wrap items-center gap-x-4 gap-y-1.5">
            {scope !== 'phone' ? <ExpectedField icon={Mail} label={t('enrich.confirm.fieldEmail')} /> : null}
            {scope !== 'email' ? <ExpectedField icon={Phone} label={t('enrich.confirm.fieldPhone')} /> : null}
            <ExpectedField icon={Linkedin} label={t('enrich.confirm.fieldLinkedin')} />
          </Box>
        </Box>

        {/* #2988.1 — enrichissement séparé par coordonnée : le pipeline serveur
            filtre déjà par `only`, ce sélecteur est son premier appelant côté
            écran. N'apparaît que pour les appelants qui le contrôlent
            (`onCoordinateScopeChange` fourni) — les autres gardent leur écran
            inchangé. */}
        {onCoordinateScopeChange ? (
          <FilterChips
            ariaLabel={t('enrich.confirm.coordinateScopeAria')}
            legend={t('enrich.confirm.coordinateScopeLegend')}
            size="sm"
            options={[
              { value: 'both', label: t('enrich.confirm.coordinateScopeBoth') },
              { value: 'email', label: t('enrich.confirm.coordinateScopeEmailOnly') },
              { value: 'phone', label: t('enrich.confirm.coordinateScopePhoneOnly') },
            ]}
            value={scope}
            onChange={next => onCoordinateScopeChange(next ?? 'both')}
          />
        ) : null}

        {/* #2120.55 / #2120.57 / #2297.23 — le solde et la durée, tous deux
            absents avant cette confirmation (le seul « crédits restants »
            vivait dans le toast APRÈS le débit). Le solde est un chiffre du
            serveur (`useCredits()`, porté par l'appelant) ; la durée vient
            de la médiane des enrichissements récents
            (`useEnrichmentDurationEstimate`) sur le chemin qui l'appelle —
            « non mesurée » reste affiché tel quel sous 5 mesures (GA-18/19),
            jamais un chiffre deviné, ET reste affiché tel quel sur le chemin
            RECHERCHE (`free`) qui ne mesure rien de ce que cette médiane
            décrit. */}
        <Box display="flex" className="flex-wrap items-center gap-x-4 gap-y-1 text-[var(--bellum-text-muted)]">
          {/* #3819 — chemin RECHERCHE : aucune durée mesurée, la ligne ne s'écrit pas. */}
          {free ? null : (
            <Text size="xs">
              {'params' in durationAnnouncement
                ? t(durationAnnouncement.key, durationAnnouncement.params)
                : t(durationAnnouncement.key)}
            </Text>
          )}
        </Box>

        {/* #2297.25 / #2297.26 — le reste de la sélection ne disparaît plus en
            silence : chaque raison d'exclusion non vide a sa ligne. */}
        {excluded && excluded.length > 0 ? (
          <Box className="space-y-0.5">
            {excluded.map(({ reason, count }) => (
              <Text key={reason} size="xs" className="text-[var(--bellum-text-muted)]">
                {t(EXCLUSION_LABEL_KEY[reason], { count })}
              </Text>
            ))}
          </Box>
        ) : null}

        {offersDontAsk ? (
          <Box display="flex" className="min-h-11 items-center gap-2">
            <Checkbox
              id={dontAskId}
              checked={dontAskAgain}
              onCheckedChange={checked => setDontAskAgain(checked === true)}
            />
            <Text element="label" size="xs" htmlFor={dontAskId} className="text-[var(--bellum-text-secondary)]">
              {t('enrich.confirm.dontAskAgain')}
            </Text>
          </Box>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            {declineLabel ?? t('common:actions.cancel')}
          </Button>
          <Button variant="black" size="sm" icon={Zap} disabled={confirmDisabled} onClick={handleConfirm}>
            {free ? t('enrich.confirm.confirmFree') : t('enrich.confirm.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExpectedField({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <Box display="flex" className="items-center gap-1.5 text-[var(--bellum-text-primary)]">
      <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
      <Text element="span" size="sm">
        {label}
      </Text>
    </Box>
  )
}
