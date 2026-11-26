import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { Badge, Card, Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, EyeOff, SquareDashedMousePointer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { accountsApi } from '@/features/accounts/api'
import { similarToAccountQueryKey, useSimilarToAccount } from '@/features/accounts/hooks/useSimilarToAccount'
import { describeSimilarHeadline } from '@/features/accounts/model/similarHeadline'
import { SimilarHeadlineText } from '@/features/accounts/view/accounts-list/SimilarAccountContainer'
import { compactSector } from '@bellum/utils'

/**
 * "Comptes similaires à CE compte" (Théo p.41) — same-sector companies found by
 * the account's NAF code, shown in the account-detail sidebar. Distinct from the
 * portfolio-level {@link SimilarAccountContainer} on the accounts list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1632.5 — L'AFFINITÉ TECHNOLOGIQUE, LIVRÉE LE 08/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour bêta du 06/09 demandait d'enrichir cette carte avec une AFFINITÉ
 * TECHNOLOGIQUE (« au moins 3 technologies communes suffisamment
 * discriminantes », une techno ubiquitaire pesant moins qu'une techno rare). Le
 * triage du 07/09 l'avait REPORTÉE : c'est un moteur entier, et il vit côté API.
 *
 * Il existe désormais, et ce commentaire remplace celui qui disait le contraire :
 *
 *  · le calcul est `discriminantCommonTechnos` (`@bellum/contracts`) — les deux
 *    piles observées, moins ce que presque toutes les entreprises partagent ;
 *  · la lecture est `MarketMemoryService.observedStacksFor`, groupée ;
 *  · la composition est `AccountsController.withSimilarityHeadlines` (GA-07
 *    interdit qu'un service en importe un autre).
 *
 * Ce que le retour interdisait est tenu, et l'est maintenant PAR LE CODE :
 *
 *  · **Jamais « stack proche ».** Le libellé rendu est « Environnement
 *    technologique proche de {{compte}} : {{technologies}} » — le compte de
 *    RÉFÉRENCE nommé, les technologies LISTÉES.
 *  · **Jamais un score nu** (« similarité 0,84 ») : une seule RAISON principale
 *    par suggestion, jamais un nombre (`c26_probabilite`, doctrine).
 *
 * ⚠️ Le « profil d'externalisation comparable », lui, reste ÉCARTÉ — et pas par
 * manque de temps : `externalization_score` n'est pas normalisé par cohorte,
 * donc il mesure la TAILLE de l'entreprise (#1640.6, garde GA-257). Deux
 * entreprises « au même profil » seraient deux entreprises de la même taille.
 */
export const AccountSimilarContainer = ({ accountId }: { accountId: string }) => {
  const { t } = useTranslation('accountDetail')
  const { data: companies = [], isLoading } = useSimilarToAccount(accountId)

  // #2117.82 — SUR UN COMPTE PAUVRE, LE PANNEAU LATÉRAL NE SE REND PLUS EN
  // FULL HEIGHT « POUR RIEN ». Cette carte ne portait aucune information
  // quand la recherche par secteur ne trouve rien : un titre et « Aucune
  // entreprise similaire trouvée pour ce secteur. » — contrairement à
  // `AccountRunsContainer`, dont le message vide DISTINGUE deux faits
  // (jamais analysé / analysé avant le suivi des runs), celui-ci n'ajoute
  // rien à « rien à savoir ». Doctrine « on n'affiche pas ce qu'on n'a
  // pas » : une carte permanente sans donnée ne se rend pas du tout (même
  // patron que `AccountProvenancePanel` et `AccountKnownMovementsCard`,
  // présents-only). Le chargement reste visible : il dit qu'une recherche
  // est en cours, pas qu'il n'y a rien.
  if (!isLoading && companies.length === 0) return null

  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex items-center gap-2">
        <SquareDashedMousePointer className="size-3.5 text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)]" />
        <Text size="sm" weight="semibold">
          {t('similar.sameSectorTitle')}
        </Text>
      </div>
      {isLoading ? (
        <Text size="xs">{t('similar.searching')}</Text>
      ) : (
        <ul className="min-w-0 space-y-1">
          {companies.map(company => (
            <SimilarCompanyListItem key={company.id} accountId={accountId} company={company} />
          ))}
        </ul>
      )}
    </Card>
  )
}

const SimilarCompanyListItem = ({ accountId, company }: { accountId: string; company: SimilarAccountSuggestion }) => {
  const navigate = useNavigate()
  const { t } = useTranslation('accountDetail')
  const queryClient = useQueryClient()
  // Le profil vendeur ne joue pas ici : cette carte ne classe pas contre lui,
  // elle prolonge le secteur registre du compte ouvert.
  const headline = describeSimilarHeadline(company.similarity_headline, false)

  /**
   * #2127.37 — MASQUER, PERSISTANT ET DÉMASQUABLE.
   *
   * L'écriture est PERSISTANTE côté API (`similar_account_dismissals`, jamais
   * supprimée) : la disparition de la carte est donc vraie même après un
   * rechargement, pas seulement un état local optimiste. Le toast propose
   * « Annuler », qui rappelle la MÊME route avec `on: false` — une correction
   * humaine (démasquer) gagne toujours, elle ne supprime jamais la ligne.
   */
  const dismiss = useMutation({
    mutationFn: () => accountsApi.setSimilarSuggestionDismissed(accountId, company.id, true),
    onSuccess: () => {
      queryClient.setQueryData<SimilarAccountSuggestion[]>(similarToAccountQueryKey(accountId), current =>
        current?.filter(item => item.id !== company.id),
      )
      toast(t('similar.dismissed'), {
        action: {
          label: t('similar.undo'),
          onClick: () => {
            void accountsApi.setSimilarSuggestionDismissed(accountId, company.id, false)
            void queryClient.invalidateQueries({ queryKey: similarToAccountQueryKey(accountId) })
          },
        },
      })
    },
    onError: () => toast.error(t('similar.dismissError')),
  })

  return (
    <li>
      <div className="group flex w-full min-w-0 items-start gap-1">
        <button
          type="button"
          onClick={() => navigate({ to: '/search', search: { company: company.company_name } })}
          className="flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-lg p-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] active:scale-[0.99]"
        >
          <CompanyAvatar name={company.company_name} size="md" />
          <div className="min-w-0 flex-1 space-y-1">
            <Text size="xs" weight="semibold" noWrap className="truncate text-[var(--bellum-text-primary)]">
              {company.company_name}
            </Text>
            <div className="mt-1 max-w-full overflow-hidden">
              <Badge
                variant="outline"
                className="max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]"
                title={company.sector}
              >
                {/* #1315.3 — secteur lisible, chaîne complète en infobulle. */}
                <span className="block max-w-[180px] truncate">{compactSector(company.sector)}</span>
              </Badge>
            </div>
            <Text size="xs" className="line-clamp-2 text-[var(--bellum-text-secondary)] leading-relaxed">
              {company.description}
            </Text>
            {/* #1632.5 — la raison, quand elle NOMME quelque chose que la carte ne
              dit pas déjà. Le MÊME composant que la carte du portefeuille : deux
              rendus de la même phrase divergeraient au premier remaniement.

              ⚠️ La raison `sector` n'est pas rendue ICI, et c'est délibéré : le
              titre de la carte dit déjà « Comptes du même secteur », et le
              dossier ouvert EST le compte de référence. L'écrire une seconde
              fois serait le même fait sous deux formes (loi 4 du tome 7). */}
            {headline?.kind === 'tech' ? (
              <Text
                size="xs"
                className="text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)]"
                title={t('similar.whyTechTooltip')}
              >
                <SimilarHeadlineText display={headline} />
              </Text>
            ) : null}
            {/* #2127.26 / .27 / .29 — ce que le candidat PARTAGE avec le compte
              ouvert, au-delà du secteur que le titre dit déjà : la zone, la
              taille, le recours à des externes observé des deux côtés. Seul ce
              que le serveur a vérifié des deux côtés arrive ici ; rien de
              vérifié → rien d'écrit, jamais une différence affirmée. */}
            {company.reference_shared && company.reference_shared.length > 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('similar.sharedWith', {
                  criteria: company.reference_shared.map(criterion => t(`similar.shared.${criterion}`)).join(' · '),
                })}
              </Text>
            ) : null}
          </div>
          <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] opacity-0 transition-[opacity,color] duration-150 group-hover:text-[var(--bellum-text-primary)] group-hover:opacity-100">
            <ArrowRight className="size-3.5" />
          </span>
        </button>
        {/* #2127.37 — SIBLING du bouton de navigation, jamais imbriqué dedans
            (un bouton dans un bouton casse le HTML et l'accessibilité). Cible
            44×44 px (GA-32), visible au survol ET au focus clavier — jamais
            SEULEMENT au survol, sinon elle ne se tabule pas (GA-35). */}
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          aria-label={t('similar.dismiss')}
          title={t('similar.dismiss')}
          // GA-25 — pas de `duration-150` : `transition-[opacity,color]` porte déjà
          // cette durée par défaut (vocabulaire existant, cf. le voisin ci-dessus
          // et motion-grammar.test.ts, #2484), une classe de plus l'aurait fait
          // remonter sans raison.
          className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:text-[var(--bellum-text-primary)] focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <EyeOff className="size-3.5" />
        </button>
      </div>
    </li>
  )
}
