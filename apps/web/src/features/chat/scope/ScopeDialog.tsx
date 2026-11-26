import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BriefcaseBusiness,
  Briefcase,
  ContactRound,
  Globe2,
  MessageCircle,
  Rocket,
  Search,
  ShieldOff,
  Sparkles,
  X,
  Target,
  UserRound,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
  cn,
} from '@bellum/ui'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useAccountSignals } from '@/features/accounts/hooks/useAccountSignals'
import { useConsultants } from '@/features/consultants/hooks'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useMissions } from '@/features/missions/api'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import {
  NO_ACCOUNT_SCOPE,
  STRICT_NO_DATA_SCOPE,
  PORTFOLIO_SCOPE,
  consultantScope,
  contactScope,
  filterScopeAccounts,
  filterScopeConsultants,
  filterScopeContacts,
  filterScopeJobOffers,
  filterScopeMissions,
  filterScopeNeeds,
  filterScopeOpportunities,
  isObjectScope,
  isSameScope,
  jobOfferScope,
  missionScope,
  needScope,
  opportunityScope,
  scopeAccount,
  scopeConsultantsFrom,
  scopeContactsFrom,
  scopeJobOffersFrom,
  scopeMissionsFrom,
  scopeNeedsFrom,
  scopeOpportunitiesFrom,
  type ChatScope,
  type ScopeAccount,
} from './chat-scope'
import { PRECISE_KINDS, type PreciseKind } from './precise-kind'

/**
 * #1951.2 / #1951.3 / #1910.6 — une portée objet rouvre la modale sur SON
 * onglet : sinon la sélection en cours serait cachée. Les six natures elles-
 * mêmes vivent dans `precise-kind.ts` (voir ce fichier pour l'ordre et
 * pourquoi elles sont isolées d'ici, #2589).
 */
const PRECISE_LABEL_KEY: Record<PreciseKind, string> = {
  account: 'scope.dialog.tabs.account',
  consultant: 'scope.dialog.tabs.consultant',
  need: 'scope.dialog.tabs.need',
  mission: 'scope.dialog.tabs.mission',
  // #1951.1 — « une personne » et non « un contact » : c'est ce que le
  // commercial cherche quand il ouvre cet onglet, et le mot « contact » désigne
  // aussi bien la fiche que le geste de contacter.
  contact: 'scope.dialog.tabs.contact',
  // #1951.4 — LA LIGNE du pipe, jamais le statut d'un compte.
  opportunity: 'scope.dialog.tabs.opportunity',
  // Théo L1 — sélecteur avancé — un signal de recrutement repéré chez un compte.
  job_offer: 'scope.dialog.tabs.job_offer',
}

function preciseKindOf(scope: ChatScope): PreciseKind {
  return scope.kind === 'consultant' ||
    scope.kind === 'need' ||
    scope.kind === 'mission' ||
    scope.kind === 'contact' ||
    scope.kind === 'opportunity' ||
    scope.kind === 'job_offer'
    ? scope.kind
    : 'account'
}

/** Une page de besoins suffit à la modale : au-delà, la recherche interroge le serveur. */
const NEED_PAGE_SIZE = 50

/**
 * « Choisis la portée. Laura ne lira que ce périmètre. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CHOIX EST DEMANDÉ AVANT LA PREMIÈRE QUESTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'ici, ouvrir une conversation ouvrait un champ de texte : la portée se
 * décidait implicitement, par le compte qu'on avait sous les yeux au moment du
 * clic. Deux conséquences, toutes deux vécues — on pose une question sur le
 * portefeuille depuis un compte, et Laura répond sur ce compte seul ; ou on
 * pose une question sur un compte depuis le tableau de bord, et elle balaie
 * tout. Dans les deux cas la réponse est juste pour une question qui n'était pas
 * celle-là, et rien à l'écran ne permet de s'en apercevoir.
 *
 * Le rendre EXPLICITE coûte un clic et supprime la classe entière de méprises.
 *
 * ⚠️ Le choix n'est pas un engagement : la dernière ligne le dit, et l'en-tête
 * du fil permet d'en changer. Une modale qui donnerait l'impression de verrouiller
 * ferait hésiter — et on choisirait « tout mon portefeuille » par prudence, ce
 * qui est le pire des deux (Laura lit large, répond flou, et coûte cher).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE LIGNE MONTRE, ET CE QU'ELLE TAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un compte porte son score et son état. Le score est rendu par `ScoreBadge`
 * ci-dessous, qui n'affiche RIEN quand il n'est pas mesuré — un « 0 » sur un
 * compte jamais analysé se lirait « compte sans intérêt » et l'écarterait de la
 * conversation pour de bon.
 */
export function ScopeDialog({
  open,
  onOpenChange,
  accounts,
  accountsLoading = false,
  accountsError = false,
  portfolioCount,
  initialScope,
  onConfirm,
  onAccountQuery,
  conversationId,
  threadStarted,
  disabled,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: readonly ScopeAccount[]
  /**
   * #3809.1 — la LISTE des comptes (`accounts`) ne dit pas pourquoi elle est
   * vide : en cours de lecture, ou la requête a échoué. Sans ces deux drapeaux,
   * l'onglet « compte » ne rendait RIEN (ni message ni repère) le temps que
   * `GET /accounts` réponde — vu en prod sur « Nouvelle conversation » juste
   * après un chargement de page : la modale paraissait vide (#3809).
   */
  accountsLoading?: boolean
  accountsError?: boolean
  /** Le total du SERVEUR ; `null` pendant le chargement. Voir `ScopeButton`. */
  portfolioCount: number | null
  initialScope: ChatScope
  onConfirm: (scope: ChatScope) => void
  /** #3654.1 — la recherche de compte tapée, pour que l'appelant aille la chercher au-delà de la page chargée. */
  onAccountQuery?: (query: string) => void
  /**
   * #3772.1 — LE fil dont la personnalisation (section « Personnalisation »
   * ci-dessous) se change : `null` = aucun fil encore créé, la section ne se
   * monte pas (rien à personnaliser avant le premier message).
   */
  conversationId?: string | null
  /**
   * #3772.1 RÉFUTÉ (recette prod 07/10 soir) — `conversationId` seul ne dit
   * pas « ce fil existe déjà aux yeux de l'utilisateur » : `Chat.tsx` en
   * pose TOUJOURS un (un UUID tiré au hasard pour un fil neuf, voir
   * `activeConversationId`), donc le titre ne peut pas s'appuyer dessus sans
   * dire « Nouvelle conversation » même en rouvrant cette modale depuis un
   * fil déjà écrit. `threadStarted` = au moins un message échangé (même
   * signal que `hasMessages` côté `Chat.tsx`) : faux = on choisit encore le
   * dossier d'un fil qui n'existe pas pour l'utilisateur, vrai = on AJUSTE
   * ce que Laura lit pour CE fil.
   */
  threadStarted?: boolean
  disabled?: boolean
  /**
   * #3697 (vu en passant, recette prod 09/10) — GA-378 (`Dialog` restaure le
   * focus au déclencheur à la fermeture) reste le défaut TANT QUE l'appelant
   * ne demande rien ici : omise, cette prop laisse Radix se comporter
   * normalement — la modale ne rompt jamais seule cette règle.
   */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const { t } = useTranslation('chat')
  const [scope, setScope] = useState<ChatScope>(initialScope)
  const [query, setQuery] = useState('')
  const [precise, setPrecise] = useState<PreciseKind>(() => preciseKindOf(initialScope))
  useEffect(() => {
    onAccountQuery?.(precise === 'account' ? query : '')
  }, [query, precise, onAccountQuery])

  // Rouvrir la modale doit repartir de la portée COURANTE, pas de celle qu'on
  // avait survolée la fois d'avant : sans ce reset, un abandon laisse une
  // sélection fantôme qui s'appliquerait au clic suivant.
  useEffect(() => {
    if (!open) return
    setScope(initialScope)
    setQuery('')
    setPrecise(preciseKindOf(initialScope))
  }, [open, initialScope])

  /**
   * Les comptes SUIVIS d'abord — mais seulement s'il y en a.
   *
   * ⚠️ Mesuré en production le 26/08 : sur dix-sept comptes analysés, AUCUN ne
   * portait de `commercial_status`. Une section « Comptes suivis » vide, sur un
   * espace qui en compte dix-sept, se lit comme un bug — et la modale devient
   * inutilisable puisqu'aucun compte n'est proposé.
   *
   * Quand rien n'est marqué comme suivi, on montre donc TOUS les comptes, sous
   * un titre qui dit ce qu'ils sont. Le suivi reste ce qui trie quand il existe.
   */
  const tracked = useMemo(() => accounts.filter(account => account.active), [accounts])
  const watched = tracked.length > 0 ? tracked : accounts
  const listTitleKey = tracked.length > 0 ? 'scope.dialog.watched' : 'scope.dialog.allAccounts'
  /**
   * Sans recherche, on montre les comptes SUIVIS — c'est la maquette, et c'est
   * la liste courte qui sert 90 % du temps.
   *
   * ⚠️ Dès qu'on TAPE, on cherche dans TOUS les comptes. Sans cela, un compte
   * non suivi deviendrait impossible à choisir comme portée — alors que
   * `?accountId=` en accepte n'importe lequel depuis toujours. La modale aurait
   * donc RETIRÉ une capacité en ayant l'air d'en ajouter une, ce qui est la
   * pire des régressions : invisible, et découverte par quelqu'un qui cherchait
   * un compte qu'il vient d'ajouter.
   */
  const shown = useMemo(
    () => (query.trim() ? filterScopeAccounts(accounts, query) : [...watched]),
    [accounts, watched, query],
  )
  // Le sous-titre de « tout le portefeuille » compte ce que Laura LIT, pas ce
  // qu on a marqué comme suivi — voir `portfolioSize`.
  // Le total du serveur, jamais la longueur de la page chargée.

  // #1910.10 — la phrase de pied dit ce qui change pour LE CHOIX EN COURS,
  // donc elle a besoin du compte que ce choix désigne — le même calcul que
  // `ScopeButton.scopeLabel`, ici pour nourrir `scopeEffect` plutôt qu'un
  // libellé de bouton.
  const selectedAccount = scopeAccount(scope, accounts)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('common:actions.close')}
        className="max-w-xl"
        // #3697 (vu en passant, recette prod 09/10) — GA-378 fait de « fermer
        // une modale rend le focus au déclencheur » la règle PAR DÉFAUT,
        // tenue par Radix sans rien à écrire ici d'habitude. Sur CETTE
        // modale, l'ouverture crée aussi un fil neuf et place le focus dans
        // le composer (`Chat.tsx::applyScope`, synchrone) : Radix reprenait
        // ce focus pour le rendre au déclencheur une fois l'animation de
        // sortie terminée, et une frappe immédiate tombait hors du champ.
        // L'appelant (seul aujourd'hui : `Chat.tsx`) DOIT donc fournir sa
        // propre redirection — la modale ne décide jamais seule de rompre
        // GA-378, elle n'omet le défaut QUE si on le lui demande.
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          {/* #3772.1 RÉFUTÉ — « Nouvelle conversation » dit vrai pour le fil
              vierge que `?new=` ouvre, mais ment pour le fil déjà écrit que
              `ScopeButton` (en-tête) rouvre sur CETTE même modale : ce
              second cas réutilise le libellé du bouton qui l'a ouverte
              (`scope.change`, déjà sans le mot de code « portée »),
              puisqu'aucun fil n'est créé par la simple OUVERTURE. */}
          <DialogTitle>{threadStarted ? t('scope.change') : t('scope.dialog.title')}</DialogTitle>
          <DialogDescription>{t('scope.dialog.subtitle')}</DialogDescription>
          {/*
            #1599 — LA PORTÉE PROTÈGE LE CONTEXTE PRIVÉ, PAS L'ACCÈS AU MARCHÉ.

            Aucun scope « Marché » n'est ajouté (les options ci-dessous restent
            Tout le portefeuille / Un compte / Sans compte) : un scope existe
            pour dire QUELLES données PRIVÉES de l'espace Laura peut lire, pas
            pour autoriser ou couper l'accès à un référentiel PARTAGÉ entre
            espaces — la mémoire marché Bellum n'appartient à aucun espace en
            particulier, la restreindre par « portée » laisserait croire
            qu'un autre choix la couperait. Cette ligne le dit explicitement
            plutôt que de laisser deviner pourquoi elle n'a pas sa propre case.
          */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('scope.dialog.marketNote')}
          </Text>
        </DialogHeader>

        <div className="space-y-4">
          {/* #1910.10 — le titre disait « Portée large », un mot de code. Ce
              groupe rassemble les deux choix qui ne DÉSIGNENT aucun compte
              précis (tout le portefeuille, ou aucun) ; la clé `broad` reste
              (elle n'est lue nulle part ailleurs), seule sa phrase change. */}
          <GroupTitle label={t('scope.dialog.broad')} />
          <div className="space-y-2">
            <ScopeOption
              icon={<Globe2 className="size-4" aria-hidden />}
              title={t('scope.portfolio')}
              hint={
                portfolioCount === null
                  ? t('scope.dialog.portfolioReadNote')
                  : `${t('scope.dialog.activeAccounts', { count: portfolioCount })} — ${t('scope.dialog.portfolioReadNote')}`
              }
              selected={isSameScope(scope, PORTFOLIO_SCOPE)}
              onSelect={() => setScope(PORTFOLIO_SCOPE)}
            />
            <ScopeOption
              icon={<Sparkles className="size-4" aria-hidden />}
              title={t('scope.none')}
              hint={t('scope.dialog.noneHint')}
              selected={isSameScope(scope, NO_ACCOUNT_SCOPE)}
              onSelect={() => setScope(NO_ACCOUNT_SCOPE)}
            />
            <ScopeOption
              icon={<ShieldOff className="size-4" aria-hidden />}
              title={t('scope.strictNone')}
              hint={t('scope.dialog.strictNoneHint')}
              selected={isSameScope(scope, STRICT_NO_DATA_SCOPE)}
              onSelect={() => setScope(STRICT_NO_DATA_SCOPE)}
            />
          </div>

          {/* #1951.2 / #1951.3 / #1910.5 / #1910.7 — « un consultant » et « un
              besoin » à côté du compte. Trois boutons plutôt que trois listes
              empilées : la modale garde UNE liste à la fois, et le vivier ou les
              besoins ne se chargent qu'au moment où on les demande. */}
          <GroupTitle label={t('scope.dialog.precise')} />
          <div className="flex flex-wrap gap-2">
            {PRECISE_KINDS.map(kind => (
              <button
                key={kind}
                type="button"
                aria-pressed={precise === kind}
                // #2589 — accroche STABLE pour le test générique, indépendante
                // du libellé traduit (celui-ci change de langue, pas le genre).
                data-testid={`scope-tab-${kind}`}
                onClick={() => {
                  setPrecise(kind)
                  setQuery('')
                }}
                className={cn(
                  'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  precise === kind
                    ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                    : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]',
                )}
              >
                {t(PRECISE_LABEL_KEY[kind])}
              </button>
            ))}
          </div>

          {precise === 'consultant' && (
            <div data-testid="scope-panel-consultant">
              <ConsultantOptions scope={scope} query={query} onQuery={setQuery} onSelect={setScope} />
            </div>
          )}
          {precise === 'need' && (
            <div data-testid="scope-panel-need">
              <NeedOptions scope={scope} query={query} onQuery={setQuery} onSelect={setScope} />
            </div>
          )}
          {precise === 'mission' && (
            <div data-testid="scope-panel-mission">
              <MissionOptions scope={scope} query={query} onQuery={setQuery} onSelect={setScope} />
            </div>
          )}
          {/* #1951.1 — « une personne » : le périmètre le plus demandé du retour. */}
          {precise === 'contact' && (
            <div data-testid="scope-panel-contact">
              <ContactOptions scope={scope} query={query} onQuery={setQuery} onSelect={setScope} />
            </div>
          )}
          {/* #2589 — le panneau existait (`OpportunityOptions`, complet, testé en
              pur dans `chat-scope-opportunity.test.ts`) mais rien ne le montait :
              six onglets rendus, cinq panneaux branchés. Même patron que les
              quatre autres genres précis ci-dessus. */}
          {precise === 'opportunity' && (
            <div data-testid="scope-panel-opportunity">
              <OpportunityOptions scope={scope} query={query} onQuery={setQuery} onSelect={setScope} />
            </div>
          )}
          {/* Théo L1 — sélecteur avancé — une offre d'emploi repérée chez un compte. */}
          {precise === 'job_offer' && (
            <div data-testid="scope-panel-job_offer">
              <JobOfferOptions scope={scope} query={query} onQuery={setQuery} onSelect={setScope} />
            </div>
          )}
          {/* Théo L1 — sélecteur avancé — un choix EFFAÇABLE : un geste rend le
              portefeuille, sans aller chercher la bonne case plus haut. Montré
              seulement quand un dossier précis est choisi — sinon il n'efface rien. */}
          {(isObjectScope(scope) || scope.kind === 'account') && (
            <Button variant="ghost" size="sm" onClick={() => setScope(PORTFOLIO_SCOPE)}>
              <X className="size-4" aria-hidden />
              {t('scope.dialog.clearPrecise')}
            </Button>
          )}

          {/*
            #3809.1 — ce panneau se montre TOUJOURS quand l'onglet est
            « compte », même sans un seul compte chargé. Avant ce correctif,
            `watched.length > 0` gardait le bloc entier : juste après
            l'ouverture de « Nouvelle conversation », le temps que
            `GET /accounts` réponde, `accounts` est encore `[]` et ce bloc ne
            rendait RIEN — ni champ de recherche, ni liste, ni message. Ce
            qui restait visible (en-tête, les trois choix larges, les
            onglets) a été lu en prod comme une modale VIDE (#3809). Le
            chargement et l'échec se nomment désormais ; une liste réellement
            vide (portefeuille sans AUCUN compte analysé) le dit aussi, elle
            ne se contente plus de disparaître.
          */}
          {precise === 'account' && (
            <div data-testid="scope-panel-account">
              <GroupTitle label={t(listTitleKey)} />
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={t('scope.dialog.searchPlaceholder')}
                label={t('scope.dialog.searchLabel')}
              />

              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {accountsLoading ? (
                  <ListMessage>{t('scope.dialog.loading')}</ListMessage>
                ) : accountsError ? (
                  <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
                ) : (
                  <>
                    {shown.map(account => (
                      <ScopeOption
                        key={account.id}
                        icon={
                          <CompanyAvatar
                            name={account.companyName ?? t('scope.dialog.unnamedAccount')}
                            logoUrl={account.logoUrl}
                            website={account.website}
                            size="sm"
                          />
                        }
                        title={account.companyName ?? t('scope.dialog.unnamedAccount')}
                        hint={stateHint(account, t)}
                        trailing={<AccountMeta account={account} />}
                        selected={isSameScope(scope, { kind: 'account', accountId: account.id })}
                        onSelect={() => setScope({ kind: 'account', accountId: account.id })}
                      />
                    ))}
                    {shown.length === 0 && (
                      <ListMessage>
                        {query.trim() ? t('scope.dialog.noMatch') : t('scope.dialog.noAccount')}
                      </ListMessage>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* #5048 — la personnalisation (« Mon profil ») a quitté ce panneau (revient sur #3772.1, Louis
              31/10/2026) : elle vit dans la barre du composeur, le seul endroit (GA-26). */}
        </div>

        <DialogFooter
          // #2584 — mesuré en prod : « Ouvrir la conversation » débordait du
          // pied (~106 px) et de la modale (~70 px). `Button` pose `shrink-0`
          // sans condition (`packages/ui/src/components/button.tsx`) et rien
          // ici ne l'annule — les deux boutons gardent leur taille pleine, on
          // ne coupe pas leur libellé en deux lignes. `flex-wrap` laisse donc
          // la RANGÉE céder : les boutons passent sous le texte plutôt que de
          // sortir de la carte, quand les deux ne tiennent pas côte à côte.
          className="flex-wrap items-center justify-between gap-3 sm:justify-between"
        >
          {/* #1910.10 — CE QUI CHANGE, EN CLAIR, POUR LE CHOIX EN COURS.
              Le pied se contentait d'une réassurance générique (« Tu pourras
              changer la portée à tout moment ») : elle ne disait RIEN du
              choix qu'on regarde à l'instant, et « portée » est un mot de
              code. La phrase du dessus s'ADAPTE (compte, portefeuille, ou
              aucun) ; celle du dessous garde la réassurance — reformulée sans
              le mot de code — pour la raison écrite plus haut : une modale qui
              donnerait l'impression de verrouiller ferait choisir « tout le
              portefeuille » par prudence. */}
          <div className="flex flex-col gap-0.5">
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {scopeEffect(scope, selectedAccount, t)}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('scope.dialog.changeable')}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('scope.dialog.cancel')}
            </Button>
            <Button
              onClick={() => {
                onConfirm(scope)
                onOpenChange(false)
              }}
            >
              {t('scope.dialog.confirm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2">
      <Search className="size-4 text-[var(--bellum-text-muted)]" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full bg-transparent text-sm text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)]"
      />
    </label>
  )
}

function ListMessage({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="px-1 py-3">
      {children}
    </Text>
  )
}

type ObjectOptionsProps = {
  scope: ChatScope
  query: string
  onQuery: (query: string) => void
  onSelect: (scope: ChatScope) => void
}

/**
 * #1951.2 — le vivier, lu par le hook de SON écran (`useConsultants`).
 *
 * Monté seulement quand l'onglet est ouvert : la modale de nouvelle conversation
 * ne charge pas le vivier de quelqu'un qui cherche un compte.
 */
function ConsultantOptions({ scope, query, onQuery, onSelect }: ObjectOptionsProps) {
  const { t } = useTranslation('chat')
  const { data, isLoading, isError } = useConsultants()
  const all = useMemo(() => scopeConsultantsFrom(data ?? []), [data])
  const shown = useMemo(() => filterScopeConsultants(all, query), [all, query])
  return (
    <>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder={t('scope.dialog.consultantSearchPlaceholder')}
        label={t('scope.dialog.consultantSearchLabel')}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <ListMessage>{t('scope.dialog.loading')}</ListMessage>
        ) : isError ? (
          <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
        ) : shown.length === 0 ? (
          <ListMessage>{t('scope.dialog.noConsultant')}</ListMessage>
        ) : (
          shown.map(consultant => (
            <ScopeOption
              key={consultant.id}
              icon={<UserRound className="size-4" aria-hidden />}
              title={consultant.fullName ?? t('scope.dialog.unnamedConsultant')}
              hint={
                [
                  consultant.title,
                  consultant.availableFrom ? t('scope.dialog.availableFrom', { date: consultant.availableFrom }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              selected={isSameScope(scope, consultantScope(consultant))}
              onSelect={() => onSelect(consultantScope(consultant))}
            />
          ))
        )}
      </div>
    </>
  )
}

/**
 * #1951.3 — les besoins OUVERTS, lus par le hook de LEUR écran (`useOpenNeeds`).
 *
 * La recherche part aussi au serveur (`q`) : une page de cinquante ne doit pas
 * rendre introuvable le cinquante-et-unième — « une recherche qui ment est pire
 * qu'une recherche absente », la même règle que la liste des comptes.
 */
function NeedOptions({ scope, query, onQuery, onSelect }: ObjectOptionsProps) {
  const { t } = useTranslation('chat')
  const needle = query.trim().slice(0, 120)
  const { data, isLoading, isError } = useOpenNeeds({
    offset: 0,
    limit: NEED_PAGE_SIZE,
    ...(needle ? { q: needle } : {}),
  })
  const all = useMemo(() => scopeNeedsFrom(data?.data ?? []), [data])
  const shown = useMemo(() => filterScopeNeeds(all, query), [all, query])
  return (
    <>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder={t('scope.dialog.needSearchPlaceholder')}
        label={t('scope.dialog.needSearchLabel')}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <ListMessage>{t('scope.dialog.loading')}</ListMessage>
        ) : isError ? (
          <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
        ) : shown.length === 0 ? (
          <ListMessage>{t('scope.dialog.noNeed')}</ListMessage>
        ) : (
          shown.map(need => (
            <ScopeOption
              key={need.id}
              icon={<Briefcase className="size-4" aria-hidden />}
              title={need.title}
              hint={need.accountName}
              selected={isSameScope(scope, needScope(need))}
              onSelect={() => onSelect(needScope(need))}
            />
          ))
        )}
      </div>
    </>
  )
}

/**
 * #1910.6 — les missions EN COURS, lues par le hook de LEUR écran
 * (`useMissions`), sans filtre : la route rend les missions de l'espace, et
 * `scopeMissionsFrom` écarte celles qui sont terminées ou interrompues.
 *
 * Monté seulement quand l'onglet est ouvert, comme les deux autres : la modale
 * ne charge pas la production de quelqu'un qui cherche un compte.
 */
function MissionOptions({ scope, query, onQuery, onSelect }: ObjectOptionsProps) {
  const { t } = useTranslation('chat')
  const { data, isLoading, isError } = useMissions()
  const all = useMemo(() => scopeMissionsFrom(data?.missions ?? []), [data])
  const shown = useMemo(() => filterScopeMissions(all, query), [all, query])
  return (
    <>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder={t('scope.dialog.missionSearchPlaceholder')}
        label={t('scope.dialog.missionSearchLabel')}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <ListMessage>{t('scope.dialog.loading')}</ListMessage>
        ) : isError ? (
          <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
        ) : shown.length === 0 ? (
          <ListMessage>{t('scope.dialog.noMission')}</ListMessage>
        ) : (
          shown.map(mission => (
            <ScopeOption
              key={mission.id}
              icon={<Rocket className="size-4" aria-hidden />}
              title={mission.label}
              hint={mission.accountName}
              selected={isSameScope(scope, missionScope(mission))}
              onSelect={() => onSelect(missionScope(mission))}
            />
          ))
        )}
      </div>
    </>
  )
}

/**
 * #1951.1 — LES PERSONNES DU PORTEFEUILLE, lues par le hook de LEUR écran
 * (`useContacts`), avec la recherche qui part au SERVEUR (`q`).
 *
 * ⚠️ Une ESN porte des milliers de fiches — mesuré : 2 027 sur un seul compte le
 * 14/09. Une page locale filtrée à la main rendrait introuvable la personne
 * qu'on cherche, et « une recherche qui ment est pire qu'une recherche
 * absente ». `useContacts` interroge le serveur page par page ; le filtre local
 * ne fait que resserrer ce qui est déjà arrivé.
 *
 * Monté seulement quand l'onglet est ouvert, comme les trois autres.
 */
function ContactOptions({ scope, query, onQuery, onSelect }: ObjectOptionsProps) {
  const { t } = useTranslation('chat')
  const needle = query.trim().slice(0, 120)
  const { data, isLoading, isError } = useContacts(needle ? { q: needle } : {})
  const all = useMemo(() => scopeContactsFrom(data?.pages.flatMap(page => page.data) ?? []), [data])
  const shown = useMemo(() => filterScopeContacts(all, query), [all, query])
  return (
    <>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder={t('scope.dialog.contactSearchPlaceholder')}
        label={t('scope.dialog.contactSearchLabel')}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <ListMessage>{t('scope.dialog.loading')}</ListMessage>
        ) : isError ? (
          <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
        ) : shown.length === 0 ? (
          <ListMessage>{t('scope.dialog.noContact')}</ListMessage>
        ) : (
          shown.map(contact => (
            <ScopeOption
              key={contact.id}
              icon={<ContactRound className="size-4" aria-hidden />}
              title={contact.fullName ?? t('scope.dialog.unnamedContact')}
              /* #1951.23 — la SOCIÉTÉ est ce qui sépare deux homonymes ; sans elle,
                 « Sophie Martin » et « Sophie Martin » se choisissent à l'aveugle. */
              hint={[contact.title, contact.companyName].filter(Boolean).join(' · ') || null}
              selected={isSameScope(scope, contactScope(contact))}
              onSelect={() => onSelect(contactScope(contact))}
            />
          ))
        )}
      </div>
    </>
  )
}

/**
 * #1951.4 — LES AFFAIRES DU PIPE, lues par le hook de LEUR écran (`useProjects`).
 *
 * Monté seulement quand l'onglet est ouvert, comme les autres : la modale ne
 * charge pas le pipe de quelqu'un qui cherche un compte.
 */
function OpportunityOptions({ scope, query, onQuery, onSelect }: ObjectOptionsProps) {
  const { t } = useTranslation('chat')
  const { data, isLoading, isError } = useProjects()
  const all = useMemo(() => scopeOpportunitiesFrom(data ?? []), [data])
  const shown = useMemo(() => filterScopeOpportunities(all, query), [all, query])
  return (
    <>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder={t('scope.dialog.opportunitySearchPlaceholder')}
        label={t('scope.dialog.opportunitySearchLabel')}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <ListMessage>{t('scope.dialog.loading')}</ListMessage>
        ) : isError ? (
          <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
        ) : shown.length === 0 ? (
          <ListMessage>{t('scope.dialog.noOpportunity')}</ListMessage>
        ) : (
          shown.map(opportunity => (
            <ScopeOption
              key={opportunity.id}
              icon={<Target className="size-4" aria-hidden />}
              title={opportunity.label}
              /* L'ÉTAPE est un fait ; aucune chance de conclure n'est affichée. */
              hint={[opportunity.accountName, opportunity.stage].filter(Boolean).join(' · ') || null}
              selected={isSameScope(scope, opportunityScope(opportunity))}
              onSelect={() => onSelect(opportunityScope(opportunity))}
            />
          ))
        )}
      </div>
    </>
  )
}

/**
 * Théo L1 — sélecteur avancé — LES OFFRES D'EMPLOI repérées chez les comptes,
 * lues par le hook de la Veille (`useAccountSignals`, `GET /accounts/signals`) :
 * aucune route nouvelle. Seuls les signaux de recrutement historisés sont
 * proposés, jamais un stage (`scopeJobOffersFrom`).
 *
 * Monté seulement quand l'onglet est ouvert, comme les autres.
 */
function JobOfferOptions({ scope, query, onQuery, onSelect }: ObjectOptionsProps) {
  const { t } = useTranslation('chat')
  const { data, isLoading, isError } = useAccountSignals()
  const all = useMemo(() => scopeJobOffersFrom(data ?? []), [data])
  const shown = useMemo(() => filterScopeJobOffers(all, query), [all, query])
  return (
    <>
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder={t('scope.dialog.jobOfferSearchPlaceholder')}
        label={t('scope.dialog.jobOfferSearchLabel')}
      />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <ListMessage>{t('scope.dialog.loading')}</ListMessage>
        ) : isError ? (
          <ListMessage>{t('scope.dialog.loadError')}</ListMessage>
        ) : shown.length === 0 ? (
          <ListMessage>{t('scope.dialog.noJobOffer')}</ListMessage>
        ) : (
          shown.map(offer => (
            <ScopeOption
              key={offer.id}
              icon={<BriefcaseBusiness className="size-4" aria-hidden />}
              title={offer.title}
              /* Le compte et la date — jamais la source : nos fournisseurs ne se nomment pas. */
              hint={[offer.accountName, offer.date].filter(Boolean).join(' · ') || null}
              selected={isSameScope(scope, jobOfferScope(offer))}
              onSelect={() => onSelect(jobOfferScope(offer))}
            />
          ))
        )}
      </div>
    </>
  )
}

function GroupTitle({ label }: { label: string }) {
  return (
    <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wide">
      {label}
    </Text>
  )
}

/**
 * Une option de portée.
 *
 * `role="radio"` sur un `<button>` : le groupe est un vrai choix exclusif, et
 * l'annoncer ainsi permet à un lecteur d'écran de dire « 2 sur 6 ». La règle
 * GA-35 du dépôt (« ce qui se clique se tabule ») est tenue par construction —
 * c'est un bouton, pas un `<div onClick>`.
 *
 * `min-h-11` = 44 px, le plancher tactile de GA-30.
 */
function ScopeOption({
  icon,
  title,
  hint,
  trailing,
  selected,
  onSelect,
}: {
  icon: React.ReactNode
  title: string
  hint?: string | null
  trailing?: React.ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
        selected
          ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)]'
          : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]',
      )}
    >
      <span className="shrink-0 text-[var(--bellum-text-accent)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <Text size="sm" weight="medium" className="truncate">
          {title}
        </Text>
        {hint && (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
            {hint}
          </Text>
        )}
      </span>
      {trailing}
    </button>
  )
}

/** Le score et les conversations — chacun absent quand il n'a rien à dire. */
function AccountMeta({ account }: { account: ScopeAccount }) {
  const { t } = useTranslation('chat')
  return (
    <span className="flex shrink-0 items-center gap-3">
      {/*
        Un score non mesuré n'affiche RIEN. Pas « 0 », pas « — » : la place
        reste au compte suivant, et personne ne lit une absence comme un zéro.

        ⚠️ Et un score MESURÉ ne s'affiche pas nu. Vu en recette : une pastille
        « 5 » sur chaque ligne, sans échelle. Un nombre sans son dénominateur
        invite à le comparer à celui d'à côté sans savoir ce qu'on compare —
        c'est précisément ce que GA-18 tient.

        ⚠️⚠️ L'échelle est sur DIX, et j'ai failli écrire « /100 ». Le contrat
        est explicite (`high ≥ 7, medium 5–7, low < 5`) et `ScoreCircle` divise
        par 10 partout ailleurs dans l'application. « 5/100 » aurait fait lire
        comme médiocre un compte qui est moyen — une échelle inventée est pire
        qu'une échelle absente, parce qu'elle a l'air d'une information.
      */}
      {account.priorityScore !== null && (
        <span
          className="rounded-md bg-[var(--bellum-surface-2)] px-2 py-0.5"
          title={t('scope.dialog.score', { score: account.priorityScore })}
        >
          <Text size="xs" weight="semibold">
            {account.priorityScore}
            <span className="font-normal text-[var(--bellum-text-muted)]">/10</span>
          </Text>
          <span className="sr-only">{t('scope.dialog.score', { score: account.priorityScore })}</span>
        </span>
      )}
      {account.conversationCount > 0 && (
        <span className="flex items-center gap-1 text-[var(--bellum-text-muted)]">
          <MessageCircle className="size-3.5" aria-hidden />
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {account.conversationCount}
          </Text>
          <span className="sr-only">{t('scope.dialog.conversations', { count: account.conversationCount })}</span>
        </span>
      )}
    </span>
  )
}

/**
 * L'état d'un compte, traduit.
 *
 * Le module pur rend un état DISCRIMINÉ ; la phrase se choisit ici. C'est ce qui
 * permet à `chat-scope.ts` de rester testable sans i18n et à la version anglaise
 * d'exister.
 */
function stateHint(account: ScopeAccount, t: (key: string) => string): string | null {
  if (!account.state) return null
  switch (account.state.kind) {
    case 'never_analysed':
      return t('scope.state.neverAnalysed')
    case 'analysing':
      return t('scope.state.analysing')
    case 'signal':
      return account.state.label
    case 'customer':
      return t('scope.state.customer')
    case 'opportunity':
      return t('scope.state.opportunity')
  }
}

/**
 * #1910.10 — CE QUE LE CHOIX EN COURS CHANGE, EN LANGAGE MÉTIER.
 *
 * Trois formes, une par nature de portée : sur un compte, elle le NOMME (« Un
 * compte » de repli si la ligne chargée ne le porte plus — même repli que
 * `ScopeButton.scopeLabel`, jamais un identifiant technique affiché) ; sur le
 * portefeuille et sur « sans compte », la phrase reste générique puisqu'aucun
 * compte précis n'est en jeu. Le mot « portée » n'apparaît dans AUCUNE des
 * trois — c'est tout l'objet de #1910.10.
 */
function scopeEffect(
  scope: ChatScope,
  account: ScopeAccount | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (scope.kind === 'none') return t(scope.strict ? 'scope.dialog.effectStrictNone' : 'scope.dialog.effectNone')
  // #1951.2 / #1951.3 — la fiche NOMMÉE, et ce que Laura y lit. Le portefeuille
  // reste lisible côté serveur (aucun compte n'est envoyé), et la phrase le dit.
  if (scope.kind === 'consultant') {
    return t('scope.dialog.effectConsultant', { name: scope.label ?? t('scope.unknownConsultant') })
  }
  if (scope.kind === 'need') return t('scope.dialog.effectNeed', { need: scope.label ?? t('scope.unknownNeed') })
  if (scope.kind === 'mission') {
    return t('scope.dialog.effectMission', { mission: scope.label ?? t('scope.unknownMission') })
  }
  // #1951.1 — ce que Laura lit d'une personne, dit AVANT la première question :
  // sa fiche, et pas le dossier entier de son compte. C'est précisément ce que
  // le retour demandait — « prépare une relance pour Sophie » ne doit plus
  // dériver vers le compte.
  if (scope.kind === 'contact') {
    return t('scope.dialog.effectContact', { name: scope.label ?? t('scope.unknownContact') })
  }
  // #1951.4 — ce que Laura lit d'une affaire : son état, pas un pronostic.
  if (scope.kind === 'opportunity') {
    return t('scope.dialog.effectOpportunity', { deal: scope.label ?? t('scope.unknownOpportunity') })
  }
  // Théo L1 — sélecteur avancé — ce que Laura lit d'une offre d'emploi et du compte qui recrute.
  if (scope.kind === 'job_offer') {
    return t('scope.dialog.effectJobOffer', { offer: scope.label ?? t('scope.unknownJobOffer') })
  }
  if (scope.kind === 'account') {
    return t('scope.dialog.effectAccount', { company: account?.companyName ?? t('scope.unknownAccount') })
  }
  return t('scope.dialog.effectPortfolio')
}
