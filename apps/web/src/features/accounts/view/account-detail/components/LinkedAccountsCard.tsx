import { Button, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link2, Link2Off } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { accountKeys, accountsApi, type LinkedAccount } from '@/features/accounts/api'
import { useDetachAccount } from '@/features/accounts/hooks/useDetachAccount'
import { PendingBandSlot } from '@/components/primitives/PendingBandSlot'

/**
 * Les dossiers du MÊME GROUPE que celui-ci (#1111).
 *
 * « J'ai lancé deux analyses, sur KLESIA et KLESIA ADP. C'est la même chose,
 * simplement des entités. »
 *
 * ── Ce que cette carte répare ────────────────────────────────────────────
 *
 * Le rattachement était livré, mais `accounts.merged_into_id` était ÉCRITE et
 * jamais relue. La migration qui l'a créée disait pourtant sa raison d'être en
 * toutes lettres — « dire à l'écran : ce dossier a été rattaché à KLESIA, au
 * lieu de laisser un compte archivé sans explication ». Cet écran n'existait
 * pas : un dossier quittait la liste, et rien nulle part ne disait où il était
 * parti ni comment y aller.
 *
 * ── Ce qu'elle affiche, et ce qu'elle n'affiche pas ──────────────────────
 *
 * Les DEUX sens du lien, parce qu'ils se lisent depuis les deux dossiers : « ce
 * dossier appartient à … » sur le rattaché, « … lui sont rattachés » sur celui
 * qu'on a gardé.
 *
 * La PROVENANCE, quand on l'a : un rattachement est une affirmation HUMAINE
 * (« ces deux dossiers sont le même groupe »), jamais une déduction du produit.
 * Sans date, la carte le dit — elle n'affiche pas celle du jour, qui ferait
 * passer un lien ancien pour un lien de ce matin.
 *
 * Rien du tout quand il n'y a aucun lien : « aucun dossier lié » n'est pas
 * « 0 lien mesuré », et une carte vide sur tous les comptes du portefeuille
 * apprendrait surtout à ne plus la regarder.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1816 — LE CONTENU SE SÉPARE DE SON CONTENANT
 * ─────────────────────────────────────────────────────────────────────────
 * `useLinkedAccountsBand` porte le calcul et le rendu ; il ne pose plus la
 * bordure, le fond ni le padding. `LinkedAccountsCard` (ce composant) reste
 * le point d'entrée AUTONOME, avec le même cadre qu'avant, pour qui l'utilise
 * seul.
 *
 * #3161 (retour bêta, 28/09/2026) — Louis : « supprimer » sur le bandeau
 * `AccountContextBand` qui fusionnait ce contenu avec celui
 * d'`AccountRevenueBanner` (le CA cumulé — cette info a déjà sa place sur
 * l'onglet Missions du même dossier, `TabMissions.tsx`, donc rien à déplacer
 * pour elle). Le rattachement de groupe (§1111), lui, n'a JAMAIS d'autre
 * emplacement dans le dossier — seul le bouton « Détacher » vit aussi dans le
 * menu Actions (`AccountDetailMoreActionsMenu.tsx`), sans dire À QUI le
 * dossier est rattaché. `AccountContextBand` a donc été supprimée, et ce
 * composant, déjà le point d'entrée autonome et déjà testé seul, est monté
 * directement dans `account-context-row` (`AccountDetail.tsx`) — sans
 * duplication, sans nouveau code.
 */
function linksQuery(accountId: string) {
  return {
    queryKey: accountKeys.links(accountId),
    queryFn: () => accountsApi.accountLinks(accountId),
  }
}

export function useLinkedAccountsBand(accountId: string): React.ReactNode | null {
  const { t } = useTranslation('accounts', { keyPrefix: 'links' })
  const detach = useDetachAccount()

  const { data, isError } = useQuery(linksQuery(accountId))

  // #4805 — une lecture en ÉCHEC se dit (« réessaie ») : elle n'est ni « aucun lien » ni un bandeau absent.
  if (isError) return <QueryLoadError />
  // Tant qu'on ne sait pas (chargement), on n'affirme rien — surtout pas « aucun lien ».
  if (!data) return null
  if (!data.mergedInto && data.linked.length === 0) return null

  return (
    <div className="flex items-start gap-3">
      <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" />
      <div className="min-w-0 flex-1 space-y-3">
        {data.mergedInto ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {t('belongsToTitle')}
              </Text>
              {/* La MÊME mention que celle des dossiers rattachés, plus bas
                  dans ce fichier : elle était recopiée à l'identique douze
                  lignes plus loin. La provenance reste l'attribut unique de
                  la forme — la source (un geste humain) ET la date, et sans
                  date on le DIT plutôt que de mettre celle du jour. */}
              <LinkedAccountLine account={data.mergedInto} />
            </div>

            {data.detachRefusal ? (
              // Un bouton grisé sans raison se lit comme une panne : on écrit
              // la raison, telle que le serveur la formule.
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {data.detachRefusalMessage}
              </Text>
            ) : (
              <Button
                variant="outline"
                size="sm"
                icon={Link2Off}
                className="shrink-0"
                disabled={detach.isPending}
                onClick={() => detach.mutate({ accountId })}
              >
                {detach.isPending ? t('detaching') : t('detach')}
              </Button>
            )}
          </div>
        ) : null}

        {data.linked.length > 0 ? (
          <div className="space-y-1.5">
            <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {t('attachedTitle', { count: data.linked.length })}
            </Text>
            <ul className="space-y-1">
              {data.linked.map(item => (
                <li key={item.id}>
                  <LinkedAccountLine account={item} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function LinkedAccountsCard({ accountId }: { accountId: string }) {
  const content = useLinkedAccountsBand(accountId)
  // #3465 — pendant la lecture on réserve la place de la bande (voir `PendingBandSlot`).
  const { isPending } = useQuery(linksQuery(accountId))
  if (!content) return isPending ? <PendingBandSlot testId="linked-accounts-slot" /> : null

  return (
    // #2351 — `min-w-0` : monté directement dans `account-context-row`
    // (`flex lg:flex-nowrap`, #3161), ce cadre est un enfant flex au même
    // titre qu'AccountCollaborationBand et AccountDossierSearch ; sans lui sa
    // largeur minimale resterait celle de son contenu le plus long au lieu de
    // pouvoir rétrécir (cause racine documentée dans `index.css`).
    <div className="min-w-0 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3">
      {content}
    </div>
  )
}

/**
 * Une ligne de dossier rattaché : son nom, cliquable, et depuis quand.
 *
 * C'est une mention au sens strict du tome 7 — nom + UN attribut, action
 * « ouvrir » — donc elle passe par la primitive plutôt que par un `<Link>`
 * habillé à la main. La date rattachée est cet unique attribut.
 */
function LinkedAccountLine({ account }: { account: LinkedAccount }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'links' })
  return (
    <ObjectMention
      kind="account"
      id={account.id}
      name={account.companyName}
      attribute={dateLabel(t, account.linkedAt)}
    />
  )
}

/**
 * Ce qu'on écrit à propos de la date du lien : « rattaché le 27 août 2026 », ou
 * « date inconnue » quand elle n'a pas été enregistrée. Une seule fonction pour
 * les deux bouts du lien, sinon ils divergent au premier ajustement.
 */
function dateLabel(t: (key: string, options?: Record<string, unknown>) => string, iso: string | null): string {
  const formatted = formatLinkDate(iso)
  return formatted ? t('linkedOn', { date: formatted }) : t('linkedDateUnknown')
}

/**
 * La date du lien, dans la langue du navigateur, ou `null`.
 *
 * Une date illisible vaut INCONNU, jamais « Invalid Date » ni une chaîne vide
 * qui laisserait « rattaché le  » à l'écran : un champ qu'on ne sait pas lire
 * n'est pas une valeur de remplissage.
 */
function formatLinkDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
