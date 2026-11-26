import { Box, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { capitalize, compactSector } from '@bellum/utils'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { AccountBillingCell } from './AccountBillingCell'
import { AccountInvoiceReadinessCell } from './AccountInvoiceReadinessCell'
import { AccountRevenueCell } from './AccountRevenueCell'
import { AccountVerifiedPill } from './AccountVerifiedPill'
import type { AccountRow } from './types'
import type { AccountExpansionLens } from './useAccountExpansion'
import type { AccountBillingLens } from './useAccountBillingLens'
import type { AccountInvoiceReadinessColumn } from './useAccountInvoiceReadiness'
import type { AccountRevenueColumn } from '@/features/propagation/hooks'

/**
 * UNE CARTE DE COMPTE SOUS L'ANGLE FACTURATION (maquette 11, 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CARTE ET PAS UNE LIGNE DE TABLEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette montre une liste de CARTES, pas un tableau avec une colonne de
 * plus — et ce n'est pas une préférence esthétique. Un tableau sert à COMPARER
 * une colonne d'une ligne à l'autre ; ici, on lit un compte à la fois : sa
 * raison sociale, son SIREN, son état de conformité, l'action qui l'attend.
 * Rien de tout cela ne se compare verticalement, et tout se lit ensemble.
 *
 * L'angle COMMERCIAL garde son tableau (score, effectif, prochaine action) :
 * là, on compare vraiment. Deux formes, un seul modèle de données — ce sont les
 * mêmes `AccountRow`, les mêmes filtres, la même pagination, la même lentille.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CARTE ENTIÈRE EST UN LIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `<Link>` et non `<div onClick>` : ce qui se clique se tabule (GA-35). Le
 * chevron de la maquette n'est donc pas un bouton — il est décoratif, et
 * l'affordance vient du lien lui-même. Les liens de RÉPARATION vivent en dehors
 * de ce lien : un lien dans un lien n'est pas un HTML valide, et le clic y
 * devient un tirage au sort.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUI DÉBORDE DÉFILE DANS SON CONTENEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Les colonnes se replient (une seule colonne sous 768 px, la grille complète
 * au-delà) plutôt que de forcer un défilement horizontal du corps de la page.
 * `min-w-0` sur chaque cellule : `min-width: auto` sur un enfant de grille est
 * le premier responsable des débordements horizontaux.
 */
export function AccountBillingCard({
  row,
  billing,
  expansion,
  readiness,
  revenue,
}: {
  row: AccountRow
  billing: AccountBillingLens
  expansion: AccountExpansionLens
  /* #1413.2 — les deux lectures d'argent, descendues du tableau commercial.
     Les MÊMES composants de cellule (`AccountInvoiceReadinessCell`,
     `AccountRevenueCell`), pas un second rendu : les trois absences qu'ils
     savent distinguer — sans objet, non mesuré, lecture en échec — sont
     précisément ce qu'une recopie perdrait. */
  readiness: AccountInvoiceReadinessColumn
  revenue: AccountRevenueColumn
}) {
  const { t } = useTranslation('accounts')
  const badge = billing.get(row.id)
  const counts = expansion.get(row.id)
  // Ce que la veille a vu. `signal_preview` d'abord (il porte sa source et sa
  // date), sinon le libellé brut. Vide = aucun signal récent, ce qui est un
  // constat et non un trou.
  const signalLabel = row.signal_preview?.label ?? row.primary_signal ?? null

  return (
    <Box className="relative rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] transition-colors hover:border-[var(--bellum-border-strong)]">
      {/* Le lien qui couvre la carte. En `absolute inset-0` plutôt qu'en
          enveloppe : les liens de réparation des bloqueurs sont EUX AUSSI des
          liens, et un <a> dans un <a> est invalide. `z-0` le laisse sous les
          contenus interactifs, qui remontent en `relative z-10`. */}
      <Link
        to="/accounts/$id"
        params={{ id: row.id }}
        aria-label={t('card.openAria', { name: capitalize(row.company_name) })}
        className="absolute inset-0 z-0 rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--bellum-text-accent)] focus-visible:outline-none"
      />
      {/* #1413.2 — les deux lectures d'argent (« Facturé », « Prêt à facturer »)
          ont rejoint l'angle qui les demande. Sous 768 px la grille se replie
          sur une colonne, comme avant.
          ⚠️ Le gabarit SUIT le droit financier au lieu de réserver une colonne
          vide : sans lui, la carte gardait 0,9 fr de blanc chez qui ne lira
          jamais de montant. Même décision que l'entête du tableau d'avant, et
          elle se lit dans le MÊME hook que la cellule (GA-26). */}
      <Box
        className={cn(
          'grid grid-cols-1 items-center gap-x-4 gap-y-3 px-4 py-3',
          revenue.visible
            ? 'md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,0.6fr))_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]'
            : 'md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,0.6fr))_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]',
        )}
      >
        {/* ── 1. Identité : logo, nom + pastille, secteur, SIREN / SIRET ── */}
        <Box className="flex min-w-0 items-center gap-3">
          <CompanyAvatar name={row.company_name} size="md" logoUrl={row.logo_url} website={row.website} />
          <Box className="flex min-w-0 flex-col">
            <Box className="flex min-w-0 items-center gap-1.5">
              <Text
                element="span"
                size="sm"
                weight="semibold"
                noWrap
                className="min-w-0 truncate text-[var(--bellum-text-primary)]"
              >
                {capitalize(row.company_name)}
              </Text>
              {/* Elle ne s'affiche QUE si elle a quelque chose à affirmer, et
                  elle affirme la source ET la date. `relative z-10` : elle porte
                  une infobulle, donc elle doit passer devant le lien de carte. */}
              <span className="relative z-10 inline-flex">
                <AccountVerifiedPill profile={badge?.profile ?? null} />
              </span>
            </Box>
            {/* #1315.3 — le secteur LISIBLE, pas la fiche NAF. */}
            {compactSector(row.sector) && (
              <Text
                element="span"
                size="xs"
                noWrap
                title={row.sector ?? undefined}
                className="truncate text-[var(--bellum-text-secondary)]"
              >
                {compactSector(row.sector)}
              </Text>
            )}
            <IdentifierLine badge={badge} failed={billing.failed} />
          </Box>
        </Box>

        {/* ── 2 & 3. Les deux dénombrements de delivery ── */}
        <CardMetric label={t('card.activeMissions')} value={counts?.activeMissions ?? null} failed={expansion.failed} />
        <CardMetric label={t('card.expertsOnSite')} value={counts?.expertsOnSite ?? null} failed={expansion.failed} />

        {/* ── 4. Le montant facturé (§4.2). Il vivait en colonne du tableau
               COMMERCIAL, c'est-à-dire sous le seul angle qui ne le demande pas.
               `AccountRevenueCell` est réutilisée telle quelle : elle porte le
               lien vers les missions qui composent le chiffre, et elle n'écrit
               JAMAIS « 0 € ».
               ⚠️ Le droit financier commande toujours : `revenue.visible` est
               faux quand l'espace n'a aucun droit, et la colonne disparaît
               ENTIÈREMENT — une colonne d'argent vide chez qui n'y lira jamais
               rien n'est pas une information. `relative z-10` : la cellule
               contient un lien, qui doit passer devant le lien de carte. ── */}
        {revenue.visible ? (
          <Box className="relative z-10 flex min-w-0 flex-col gap-0.5">
            <CardLabel>{t('table.invoiced')}</CardLabel>
            <AccountRevenueCell accountId={row.id} column={revenue} />
          </Box>
        ) : null}

        {/* ── 5. L'entité de facturation — celle DU CLIENT, qui REÇOIT.
               ⚠️ À NE PAS CONFONDRE AVEC `legal_entities`, et la confusion a
               déjà été faite une fois (analyse du 28/08). `legal_entities`
               porte les sociétés DE L'ESN — qui ÉMET la facture, nous ;
               `account_entities` porte celles du client — qui la reçoit. La
               maquette montre « CANAL+ Groupe SA » sous ce titre : c'est bien
               le payeur.
               `legal_entities` est orpheline côté web (quatre routes livrées,
               zéro appelant) et elle N'A PAS SA PLACE ICI pour une seconde
               raison, plus dure que le vocabulaire : elle n'est pas rattachée à
               un COMPTE mais à une MISSION (`missions.legal_entity_id`).
               « Quelle société facture ce compte » n'existe donc pas en base —
               il faudrait l'INVENTER par agrégation, et un compte dont deux
               missions partent de deux sociétés n'aurait pas de réponse. Sa
               place est sur la fiche de mission et dans les réglages de
               facturation, tous deux hors du périmètre de ce lot. ── */}
        <Box className="flex min-w-0 flex-col gap-0.5">
          <CardLabel>{t('card.billingEntity')}</CardLabel>
          {billing.failed ? (
            <Absent>{t('list.billing.failedShort')}</Absent>
          ) : !badge ? null : badge.profile ? (
            <Text element="span" size="sm" noWrap className="truncate text-[var(--bellum-text-primary)]">
              {badge.profile.legalName ?? t('list.billing.legalNameUnknown')}
            </Text>
          ) : (
            // Aucun payeur désigné : ce n'est pas une case vide, c'est le
            // bloqueur `missing_billing_entity` — et il porte son lien.
            <Absent>{t('list.billing.blockers.missing_billing_entity')}</Absent>
          )}
        </Box>

        {/* ── 6. Statut & conformité : le verdict, et ce qui attend un geste.
               ⚠️ RÉUTILISÉE, pas réécrite : `AccountBillingCell` porte déjà le
               badge, les bloqueurs NOMMÉS, leurs liens de réparation, et les
               trois rendus (chargement muet, échec dit, verdict). La recopier
               dans une carte aurait fait diverger le jour où l'un des deux
               apprend un cas — et ses tests ne protégeraient plus que la
               moitié morte. `relative z-10` : elle contient des liens, qui
               doivent passer devant le lien de carte. ── */}
        <Box className="relative z-10 flex min-w-0 flex-col items-start gap-1">
          <CardLabel>{t('card.compliance')}</CardLabel>
          <AccountBillingCell accountId={row.id} lens={billing} />
          <PaymentTerms badge={badge} />
        </Box>

        {/* ── 7. « Prêt à facturer » — CE MOIS-CI, sur les missions du compte.
               ⚠️ Ce n'est PAS une redite de la colonne « Conformité » juste à
               gauche, et les deux fichiers le disent déjà : celle-ci juge le
               dossier STRUCTUREL (« peut-on facturer ce client ? », vrai même
               sans mission), celle-là le MOIS (« qu'est-ce qui bloque sur les
               missions de ce mois ? »). Les deux sous un seul titre auraient
               fait croire à une seule information ; les deux sans titre, à une
               contradiction. ── */}
        <Box className="flex min-w-0 flex-col items-start gap-0.5">
          <CardLabel>{t('table.invoiceReadiness')}</CardLabel>
          <AccountInvoiceReadinessCell accountId={row.id} column={readiness} />
        </Box>

        {/* ── 8. Signaux : ce que la veille a vu sur ce compte.
               PAS une redite des bloqueurs de la colonne voisine — ceux-là
               disent ce qui manque CHEZ NOUS, celui-ci dit ce qui bouge CHEZ
               EUX. Les mettre deux fois sous deux titres ferait croire à deux
               informations. ── */}
        <Box className="flex min-w-0 flex-col gap-0.5">
          <CardLabel>{t('card.signals')}</CardLabel>
          {signalLabel ? (
            <Text element="span" size="xs" className="line-clamp-2 text-[var(--bellum-text-secondary)]">
              {signalLabel}
            </Text>
          ) : (
            // « Aucun signal récent » et non un tiret : c'est un CONSTAT de la
            // veille, pas une donnée manquante.
            <Absent>{t('card.noSignal')}</Absent>
          )}
        </Box>

        {/* ── 9. Le chevron. DÉCORATIF : c'est le lien de carte qui ouvre, et
               un second élément focalisable menant au même endroit ferait
               tabuler deux fois pour le même geste. Masqué sous 768 px, où la
               carte entière est déjà la cible. ── */}
        <ChevronRight
          aria-hidden
          className="hidden size-5 shrink-0 self-center text-[var(--bellum-text-muted)] md:block"
        />
      </Box>
    </Box>
  )
}

/**
 * SIREN et SIRET sous le nom.
 *
 * ⚠️ Le SIRET est AFFICHÉ groupé (« 420 624 777 00034 ») et STOCKÉ nu : les
 * espaces sont une décoration de lecture, et les stocker ferait de deux
 * graphies deux établissements.
 *
 * Trois absences, trois phrases — jamais un tiret muet : chacune se SAISIT, et
 * la nommer est ce qui la fait saisir.
 */
function IdentifierLine({ badge, failed }: { badge: ReturnType<AccountBillingLens['get']>; failed: boolean }) {
  const { t } = useTranslation('accounts')
  if (failed || !badge?.profile) return null
  const { siren, siret } = badge.profile
  return (
    <Text element="span" size="xs" noWrap className="truncate text-[var(--bellum-text-muted)] tabular-nums">
      {siren ? t('list.billing.sirenValue', { siren }) : t('list.billing.sirenUnknown')}
      {siret ? ` · ${t('card.siretValue', { siret: groupSiret(siret) })}` : ''}
    </Text>
  )
}

/** « 42062477700034 » → « 420 624 777 00034 ». Purement visuel. */
function groupSiret(siret: string): string {
  if (!/^[0-9]{14}$/.test(siret)) return siret
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`
}

/** Les conditions de règlement, quand elles sont connues. `0` est une valeur
 *  SAISIE (comptant) : `??` et jamais `||`, sinon un client qui paie le jour
 *  même passerait pour un dossier incomplet. */
function PaymentTerms({ badge }: { badge: ReturnType<AccountBillingLens['get']> }) {
  const { t } = useTranslation('accounts')
  const days = badge?.profile?.paymentTermsDays ?? null
  if (days === null) return null
  return (
    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
      {t('card.paymentTerms', { count: days })}
    </Text>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
      {children}
    </Text>
  )
}

function Absent({ children }: { children: React.ReactNode }) {
  return (
    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
      {children}
    </Text>
  )
}

/**
 * Un dénombrement de la carte.
 *
 * ⚠️ `null` ne s'affiche PAS « 0 ». Un chargement rend le silence, un échec
 * rend une phrase : « la lecture a échoué » et « ce client n'a aucune mission »
 * sont deux états qu'un même « 0 » confondrait, et ils ne se réparent pas
 * pareil. Un vrai zéro, lui, s'écrit — un stock vide est un fait.
 */
function CardMetric({ label, value, failed }: { label: string; value: number | null; failed: boolean }) {
  const { t } = useTranslation('accounts')
  return (
    <Box className="flex min-w-0 flex-col gap-0.5">
      <CardLabel>{label}</CardLabel>
      {failed ? (
        <Absent>{t('list.billing.failedShort')}</Absent>
      ) : value === null ? null : (
        <Text
          element="span"
          size="lg"
          weight="semibold"
          className={cn('text-[var(--bellum-text-primary)] tabular-nums')}
        >
          {value}
        </Text>
      )}
    </Box>
  )
}
