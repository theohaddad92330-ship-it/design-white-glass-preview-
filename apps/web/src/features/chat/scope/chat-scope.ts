/**
 * La PORTÉE d'une conversation avec Laura — « ce périmètre-là, et rien d'autre ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST UNE PRIMITIVE ET PAS UN BOUT D'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * La portée apparaît à QUATRE endroits de la refonte : l'en-tête du fil, la
 * modale de nouvelle conversation, le composer, et la feuille du mobile. Écrite
 * quatre fois, elle divergerait au premier ajustement — c'est la loi 1 du tome 7
 * (« un réglage vit à un seul endroit », GA-26) appliquée avant d'avoir le
 * défaut plutôt qu'après.
 *
 * Elle reste par ailleurs pilotée par `?accountId=` dans l'URL, ce qui existait
 * déjà : tout appelant du produit qui ouvre Laura sur un compte continue de
 * fonctionner sans rien savoir de ce module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette annonce « 2 signaux non traités » sous un compte. Aucun champ de
 * `GET /accounts` ne porte ce compteur — le fabriquer depuis un champ voisin
 * serait exactement la faute nommée le 22/08 : « une intervention doit être
 * déclenchée par une mesure qui parle de SON sujet ; un ratio proche n'est pas
 * une mesure, c'est une ressemblance ».
 *
 * Ce module rend donc l'état RÉELLEMENT mesuré (`status`, `signal_preview`,
 * `commercial_status`), et rien quand rien n'est mesurable. Un compte sans état
 * affiche son nom seul, ce qui est vrai.
 */

import { chatScopeObjectParam, isInternshipPosting, type ChatScopeObject } from '@bellum/contracts'

/**
 * Les périmètres qu'une conversation peut avoir.
 *
 * #1951.2 / #1951.3 / #1910.5 / #1910.7 — « un consultant » et « un besoin »
 * rejoignent les trois d'origine (décision du 12/09/2026 : ces deux-là d'abord,
 * les autres selon la demande réelle). Leur `label` ne sert qu'à l'AFFICHER :
 * il ne part jamais au serveur, qui relit la fiche depuis l'identifiant
 * (`scopeObjectOf`).
 *
 * #1910.6 — « une mission » est la demande réelle attendue, et elle ferme la
 * boucle : un besoin devient une mission, un consultant y est affecté, et
 * « où en est-on sur cette mission ? » était la seule des trois questions sans
 * périmètre. Elle s'ajoute EN FIN de `CHAT_SCOPE_OBJECT_KINDS` (GA-08).
 *
 * #1951.1 — « un contact » rejoint les quatre autres, et c'était la demande la
 * plus citée du retour. Jusqu'ici « prépare une relance pour Sophie » se posait
 * sur le COMPTE entier : Laura lisait le dossier complet pour parler d'une seule
 * personne, et la réponse dérivait vers le compte. Elle s'ajoute EN FIN à son
 * tour (GA-08).
 *
 * #1910.8 — « une conversation partagée » rejoint la liste EN FIN (GA-08), et
 * elle n'est pas de la même nature que les autres : c'est un périmètre de
 * LECTURE HUMAINE. Arbitré par Louis le 16/09/2026 — un filtre pour RETROUVER
 * ses fils partagés, que l'humain lit et que Laura NE lit PAS. Aucun corps de
 * message écrit par un collègue n'entre dans le contexte du modèle : D65 tient,
 * et c'est pour ça que `scopeAccountId` et `scopeObjectOf` lui rendent `null`
 * comme à `none` — ce périmètre ne DESCEND nulle part.
 */
export type ChatScope =
  | { kind: 'portfolio' }
  | { kind: 'none'; strict?: true }
  | { kind: 'account'; accountId: string }
  | { kind: 'consultant'; consultantId: string; label: string | null }
  | { kind: 'need'; needId: string; label: string | null }
  | { kind: 'mission'; missionId: string; label: string | null }
  | { kind: 'contact'; contactId: string; label: string | null }
  | { kind: 'opportunity'; opportunityId: string; label: string | null }
  | { kind: 'shared' }
  // Théo L1 — sélecteur avancé — une offre d'emploi (signal de recrutement d'un compte), EN FIN.
  | { kind: 'job_offer'; jobOfferId: string; label: string | null }

/** Une portée qui désigne UN objet du vivier, du pipe, de la production ou du dossier. */
export type ObjectChatScope = Extract<
  ChatScope,
  { kind: 'consultant' | 'need' | 'mission' | 'contact' | 'opportunity' | 'job_offer' }
>

export const PORTFOLIO_SCOPE: ChatScope = { kind: 'portfolio' }
export const NO_ACCOUNT_SCOPE: ChatScope = { kind: 'none' }
/**
 * #3772.4 / #3772.5 — « sans les données de l'espace » : l'EXCLUSION STRICTE.
 * Distincte de `NO_ACCOUNT_SCOPE`, qui ne promet PAS d'exclure le portefeuille
 * (#1779) : celle-ci part au serveur (`excludeWorkspaceData`), qui ne lit ni le
 * portefeuille, ni un compte nommé dans le texte, ni les outils qui lisent
 * l'espace. Un libellé seul ne vaut jamais cette promesse.
 */
export const STRICT_NO_DATA_SCOPE: ChatScope = { kind: 'none', strict: true }

/** #3772.5 — la portée demande-t-elle l'exclusion stricte des données de l'espace ? */
export function isStrictScope(scope: ChatScope): boolean {
  return scope.kind === 'none' && scope.strict === true
}
/** #1910.8 — le périmètre de LECTURE : mes fils partagés, que Laura ne relit pas. */
export const SHARED_SCOPE: ChatScope = { kind: 'shared' }

/** #1910.8 — la portée est-elle le filtre « conversation partagée » ? */
export function isSharedScope(scope: ChatScope): boolean {
  return scope.kind === 'shared'
}

/**
 * L'état d'un compte, tel qu'il est MESURÉ — jamais déduit d'une ressemblance.
 *
 * Discriminé et non une phrase : l'écran choisit sa clé i18n, si bien que le
 * module reste pur et traduisible. Une phrase française ici sortirait en dur
 * dans la version anglaise.
 */
type ScopeAccountState =
  | { kind: 'never_analysed' }
  | { kind: 'analysing' }
  | { kind: 'signal'; label: string }
  | { kind: 'customer' }
  | { kind: 'opportunity' }

export type ScopeAccount = {
  id: string
  companyName: string | null
  /** Score d'intérêt. `null` = NON MESURÉ — ne s'affiche jamais « 0 ». */
  priorityScore: number | null
  logoUrl: string | null
  website: string | null
  /** `null` quand rien n'est mesurable : le compte s'affiche alors seul. */
  state: ScopeAccountState | null
  /** Conversations déjà ouvertes sur ce compte. `0` est ici une vraie mesure. */
  conversationCount: number
  /** Le compte est-il SUIVI ? C'est ce que compte « N comptes actifs ». */
  active: boolean
}

/** La forme minimale qu'on lit d'un compte — un sous-ensemble de `AccountListItem`. */
type AccountLike = {
  id: string
  company_name?: string | null
  priority_score?: number | null
  logo_url?: string | null
  website?: string | null
  status?: string | null
  commercial_status?: string | null
  last_analyzed_at?: string | null
  signal_preview?: { label: string } | null
}

/**
 * Les états commerciaux qui font d'un compte un compte SUIVI.
 *
 * C'est la même liste que le rafraîchissement quotidien de la veille
 * (`watchlist-refresh`) : un compte qu'on surveille est un compte sur lequel on
 * travaille. En inventer une seconde ici ferait que « 4 comptes actifs » et « 4
 * comptes rafraîchis cette nuit » ne parleraient pas des mêmes quatre.
 */
const WATCHED: ReadonlySet<string> = new Set(['watching', 'opportunity', 'customer'])

/**
 * L'état à montrer, par ORDRE DE GESTE et non par ordre d'importance.
 *
 * Ce qui EMPÊCHE de travailler passe devant : sans analyse, Laura n'a rien à
 * lire sur ce compte, et le proposer comme portée sans le dire ferait poser une
 * question à laquelle elle ne peut structurellement pas répondre.
 */
export function accountState(account: AccountLike): ScopeAccountState | null {
  if (!account.last_analyzed_at && account.status !== 'completed') return { kind: 'never_analysed' }
  if (account.status === 'pending' || account.status === 'analyzing') return { kind: 'analysing' }
  const signal = account.signal_preview?.label?.trim()
  if (signal) return { kind: 'signal', label: signal }
  if (account.commercial_status === 'customer') return { kind: 'customer' }
  if (account.commercial_status === 'opportunity') return { kind: 'opportunity' }
  return null
}

/**
 * Les comptes proposables comme portée, avec leur état et leurs conversations.
 *
 * `conversationCounts` vient du panneau de conversations : il est passé plutôt
 * que lu ici pour que le module reste pur — et parce que la source des fils
 * (l'API du copilote) n'est pas celle des comptes.
 */
export function scopeAccountsFrom(
  accounts: readonly AccountLike[],
  conversationCounts: Readonly<Record<string, number>> = {},
): ScopeAccount[] {
  return accounts.map(account => ({
    id: account.id,
    companyName: account.company_name ?? null,
    priorityScore: typeof account.priority_score === 'number' ? account.priority_score : null,
    logoUrl: account.logo_url ?? null,
    website: account.website ?? null,
    state: accountState(account),
    conversationCount: conversationCounts[account.id] ?? 0,
    active: WATCHED.has(account.commercial_status ?? ''),
  }))
}

/**
 * Combien de comptes sont SUIVIS.
 *
 * ⚠️ Il ne sert PAS à qualifier la portée « tout le portefeuille », et la
 * raison n'est pas celle qu'on croit. Ce qu'on a d'abord vu en production le
 * 26/08 — « 0 compte actif » sur un espace de vingt comptes — n'était pas un
 * `commercial_status` absent : c'était l'état de CHARGEMENT, la liste n'étant
 * pas encore arrivée. Un zéro transitoire est indiscernable d'un zéro vrai, et
 * il dit le contraire de la réalité pendant la seconde où on le lit.
 *
 * La seconde raison, elle, est structurelle : ce compteur ne voit que les
 * comptes CHARGÉS. Sur un portefeuille paginé il annoncerait « 20 » pour
 * cinquante, et son chiffre changerait au gré des défilements ailleurs dans
 * l'application. Le total du serveur (`pagination.totalItems`) est la seule
 * mesure qui décrive la portée — voir `ScopeButton.portfolioCount`.
 *
 * Il reste utilisé là où il est vrai et local : proposer d'abord les comptes
 * suivis dans la modale, quand il y en a.
 */
export function activeAccountCount(accounts: readonly ScopeAccount[]): number {
  return accounts.filter(account => account.active).length
}

/** La portée que porte l'URL. `?accountId=` absent = tout le portefeuille. */
export function scopeFromAccountId(accountId: string | null): ChatScope {
  return accountId ? { kind: 'account', accountId } : PORTFOLIO_SCOPE
}

/**
 * L'identifiant de compte que porte une portée.
 *
 * ⚠️ `portfolio` et `none` rendent tous deux `null`, et c'est VOULU : côté API,
 * « pas de compte » est déjà l'absence de `accountId`. La distinction entre les
 * deux est une intention d'INTERFACE (Laura lit-elle le portefeuille, ou
 * répond-elle à une question générale) et le back-end n'a pas à la connaître —
 * lui ajouter un troisième état obligerait chaque appelant historique à choisir.
 *
 * ⚠️ #1779 — CE QUE ÇA VEUT DIRE POUR LA PERSONNE, ET CE QU'ELLE LISAIT.
 * Un client a choisi « Sans compte » puis reçu une réponse appuyée sur deux
 * comptes de son portefeuille. Il avait raison de le signaler : le libellé
 * annonçait « question générale, sans dossier », et sans compte actif le
 * serveur FOURNIT le portefeuille au copilote — décision antérieure assumée
 * (`chat-context.service.ts`, « pas de compte nommé → donne le portefeuille »),
 * pour qu'il puisse répondre à « quels comptes prioriser ? » plutôt que
 * « profil vide ».
 *
 * Arbitré le 09/09 : le comportement RESTE (couper aurait refusé une question
 * légitime), la PROMESSE change. Le libellé dit « sans dossier de compte
 * ouvert — ton portefeuille reste lisible », et le pied de réponse nomme le
 * portefeuille au lieu de l'additionner au dossier ouvert.
 */
export function scopeAccountId(scope: ChatScope): string | null {
  return scope.kind === 'account' ? scope.accountId : null
}

export function isSameScope(a: ChatScope, b: ChatScope): boolean {
  if (a.kind === 'account' && b.kind === 'account') return a.accountId === b.accountId
  // #1951 — deux portées objet se comparent par IDENTIFIANT : un libellé qui a
  // changé (fiche renommée) ne fait pas une autre portée.
  if (a.kind === 'consultant' && b.kind === 'consultant') return a.consultantId === b.consultantId
  if (a.kind === 'need' && b.kind === 'need') return a.needId === b.needId
  if (a.kind === 'mission' && b.kind === 'mission') return a.missionId === b.missionId
  // #1951.1 — un contact aussi se compare par identifiant : deux homonymes chez
  // deux sociétés différentes ne sont pas le même périmètre, et une fiche
  // renommée reste la même fiche.
  if (a.kind === 'contact' && b.kind === 'contact') return a.contactId === b.contactId
  // #1951.4 — deux affaires du même compte ne sont pas la même portée.
  if (a.kind === 'opportunity' && b.kind === 'opportunity') return a.opportunityId === b.opportunityId
  // Théo L1 — sélecteur avancé — deux offres du même compte ne sont pas la même portée.
  if (a.kind === 'job_offer' && b.kind === 'job_offer') return a.jobOfferId === b.jobOfferId
  // #1910.8 — « partagée » n'a pas d'identifiant : deux fois le même filtre est le même filtre.
  // #3772.5 — « sans dossier ciblé » et « sans les données de l'espace » sont deux
  // promesses : les confondre ferait croire qu'on a déjà choisi l'exclusion stricte.
  if (a.kind === 'none' && b.kind === 'none') return (a.strict === true) === (b.strict === true)
  return a.kind === b.kind && (a.kind === 'portfolio' || a.kind === 'shared')
}

/** #1951 — la portée désigne-t-elle UN objet nommé, plutôt qu'un compte ou le portefeuille ? */
export function isObjectScope(scope: ChatScope): scope is ObjectChatScope {
  return (
    scope.kind === 'consultant' ||
    scope.kind === 'need' ||
    scope.kind === 'mission' ||
    scope.kind === 'contact' ||
    scope.kind === 'opportunity' ||
    scope.kind === 'job_offer'
  )
}

/**
 * #1951.2 / #1951.3 — CE QUI PART AU SERVEUR pour une portée objet : une nature
 * et un identifiant, jamais le libellé. `null` pour les autres portées, dont le
 * compte, qui voyage déjà par `accountId`.
 */
export function scopeObjectOf(scope: ChatScope): ChatScopeObject | null {
  if (scope.kind === 'consultant') return { kind: 'consultant', id: scope.consultantId }
  if (scope.kind === 'need') return { kind: 'need', id: scope.needId }
  if (scope.kind === 'mission') return { kind: 'mission', id: scope.missionId }
  // #1951.1 — le contact voyage comme les autres : une nature, un identifiant.
  // Son NOM ne part jamais — le serveur relit la fiche dans l'espace actif.
  if (scope.kind === 'contact') return { kind: 'contact', id: scope.contactId }
  // #1951.4 — l'affaire du pipe, par son identifiant.
  if (scope.kind === 'opportunity') return { kind: 'opportunity', id: scope.opportunityId }
  // Théo L1 — sélecteur avancé — l'offre d'emploi, par l'identifiant de sa ligne d'historique.
  if (scope.kind === 'job_offer') return { kind: 'job_offer', id: scope.jobOfferId }
  return null
}

/**
 * Théo L1 — sélecteur avancé — L'INVERSE de `scopeObjectOf`, pour le lien
 * partageable (`?scope=<nature>:<id>`, `chatScopeObjectFromParam`).
 *
 * Le libellé reste `null` : l'URL ne le porte pas (un texte d'URL que n'importe
 * qui peut écrire ne s'affiche pas comme le nom d'une fiche), et l'en-tête dit
 * alors la nature seule tant que la fiche n'est pas choisie dans la liste.
 */
export function chatScopeFromObject(object: ChatScopeObject): ObjectChatScope {
  switch (object.kind) {
    case 'consultant':
      return { kind: 'consultant', consultantId: object.id, label: null }
    case 'need':
      return { kind: 'need', needId: object.id, label: null }
    case 'mission':
      return { kind: 'mission', missionId: object.id, label: null }
    case 'contact':
      return { kind: 'contact', contactId: object.id, label: null }
    case 'opportunity':
      return { kind: 'opportunity', opportunityId: object.id, label: null }
    case 'job_offer':
      return { kind: 'job_offer', jobOfferId: object.id, label: null }
  }
}

/** Le compte d'une portée, s'il est encore dans la liste chargée. */
export function scopeAccount(scope: ChatScope, accounts: readonly ScopeAccount[]): ScopeAccount | null {
  const id = scopeAccountId(scope)
  return id ? (accounts.find(account => account.id === id) ?? null) : null
}

/**
 * La recherche de la modale : sur le NOM, insensible à la casse et aux accents.
 *
 * ⚠️ `localeCompare` ne sert à rien ici — c'est un tri. La normalisation Unicode
 * est ce qui fait que « latecoere » trouve « LATÉCOÈRE », et un commercial tape
 * sans accents.
 */
export function filterScopeAccounts(accounts: readonly ScopeAccount[], query: string): ScopeAccount[] {
  const needle = fold(query)
  if (!needle) return [...accounts]
  return accounts.filter(account => fold(account.companyName ?? '').includes(needle))
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * #1951.2 — un consultant proposable comme portée.
 *
 * Ce qu'une ligne de la modale montre, et rien de plus : ni photo, ni
 * coordonnées, ni montant. Un champ absent reste `null`.
 */
type ScopeConsultant = { id: string; fullName: string | null; title: string | null; availableFrom: string | null }

/** La forme minimale lue d'un consultant — un sous-ensemble de `Consultant`. */
type ConsultantLike = {
  id: string
  full_name?: string | null
  title?: string | null
  available_from?: string | null
  archived_at?: string | null
}

/**
 * Les consultants proposables. Un consultant ARCHIVÉ n'est pas proposé : il a
 * quitté le vivier, et cadrer un fil dessus ferait travailler Laura sur une
 * personne qu'on ne positionne plus.
 */
export function scopeConsultantsFrom(rows: readonly ConsultantLike[]): ScopeConsultant[] {
  return rows
    .filter(row => !row.archived_at)
    .map(row => ({
      id: row.id,
      fullName: row.full_name?.trim() || null,
      title: row.title?.trim() || null,
      availableFrom: row.available_from ?? null,
    }))
}

/** La recherche de la modale sur le vivier : le NOM et le poste, sans accents ni casse. */
export function filterScopeConsultants(list: readonly ScopeConsultant[], query: string): ScopeConsultant[] {
  const needle = fold(query)
  if (!needle) return [...list]
  return list.filter(item => fold(`${item.fullName ?? ''} ${item.title ?? ''}`).includes(needle))
}

export function consultantScope(consultant: ScopeConsultant): ObjectChatScope {
  return { kind: 'consultant', consultantId: consultant.id, label: consultant.fullName }
}

/** #1951.3 — un besoin proposable comme portée. */
type ScopeNeed = { id: string; title: string; accountName: string | null }

type NeedLike = { id: string; title: string; account_name?: string | null }

export function scopeNeedsFrom(rows: readonly NeedLike[]): ScopeNeed[] {
  return rows.map(row => ({ id: row.id, title: row.title, accountName: row.account_name?.trim() || null }))
}

/** La recherche de la modale sur les besoins : l'intitulé ET le compte. */
export function filterScopeNeeds(list: readonly ScopeNeed[], query: string): ScopeNeed[] {
  const needle = fold(query)
  if (!needle) return [...list]
  return list.filter(item => fold(`${item.title} ${item.accountName ?? ''}`).includes(needle))
}

/** Le libellé nomme le besoin ET son compte : « Data engineer » seul se lit chez n'importe quel client. */
export function needScope(need: ScopeNeed): ObjectChatScope {
  return { kind: 'need', needId: need.id, label: need.accountName ? `${need.title} · ${need.accountName}` : need.title }
}

/** #1910.6 — une mission proposable comme portée. */
type ScopeMission = { id: string; label: string; accountName: string | null }

/** La forme minimale lue d'une mission — un sous-ensemble de `MissionView`. */
type MissionLike = { id: string; label: string; status?: string | null; accountName?: string | null }

/**
 * Les statuts d'une mission sur laquelle il reste quelque chose à dire.
 *
 * ⚠️ C'est une liste de ce qu'on GARDE, jamais de ce qu'on écarte : un statut
 * ajouté demain au contrat (`missionStatusSchema`) n'apparaîtrait pas dans la
 * modale plutôt que d'y apparaître sans qu'on l'ait décidé. `renewed` en fait
 * partie — une mission renouvelée est une mission qui tourne.
 */
const SCOPABLE_MISSION_STATUSES: ReadonlySet<string> = new Set(['onboarding', 'active', 'paused', 'renewed'])

/**
 * Les missions proposables. Une mission TERMINÉE ou INTERROMPUE ne l'est pas :
 * « où en est-on ? » n'a pas de réponse sur un dossier qui ne bouge plus, et la
 * proposer ferait cadrer un fil dessus. Même raison que le consultant archivé.
 */
export function scopeMissionsFrom(rows: readonly MissionLike[]): ScopeMission[] {
  return rows
    .filter(row => SCOPABLE_MISSION_STATUSES.has(row.status ?? ''))
    .map(row => ({ id: row.id, label: row.label, accountName: row.accountName?.trim() || null }))
}

/** La recherche de la modale sur les missions : l'intitulé ET le compte. */
export function filterScopeMissions(list: readonly ScopeMission[], query: string): ScopeMission[] {
  const needle = fold(query)
  if (!needle) return [...list]
  return list.filter(item => fold(`${item.label} ${item.accountName ?? ''}`).includes(needle))
}

/** Le libellé nomme la mission ET son compte — « TMA portail » seul se lit chez n'importe quel client. */
export function missionScope(mission: ScopeMission): ObjectChatScope {
  return {
    kind: 'mission',
    missionId: mission.id,
    label: mission.accountName ? `${mission.label} · ${mission.accountName}` : mission.label,
  }
}

/**
 * #1951.1 — UN CONTACT PROPOSABLE COMME PÉRIMÈTRE.
 *
 * Ce qu'une ligne de la modale montre, et rien de plus : le nom, le poste, la
 * société. Ni e-mail, ni téléphone, ni photo — une modale de choix n'est pas une
 * fiche, et la photo est un critère protégé qui n'a rien à faire dans une liste
 * qu'on parcourt pour CHOISIR quelqu'un (`c58_criteres_proteges`).
 */
type ScopeContact = { id: string; fullName: string | null; title: string | null; companyName: string | null }

/** La forme minimale lue d'un contact — un sous-ensemble de `ContactListItem`. */
type ContactLike = {
  id: string
  full_name?: string | null
  title?: string | null
  company_name?: string | null
  excluded_at?: string | null
}

/**
 * Les contacts proposables. Un contact ÉCARTÉ ne l'est pas : on a décidé de ne
 * plus le travailler, et cadrer un fil dessus ferait préparer une approche vers
 * quelqu'un qu'on a retiré du jeu — même règle que le consultant archivé et que
 * la mission terminée.
 */
export function scopeContactsFrom(rows: readonly ContactLike[]): ScopeContact[] {
  return rows
    .filter(row => !row.excluded_at)
    .map(row => ({
      id: row.id,
      fullName: row.full_name?.trim() || null,
      title: row.title?.trim() || null,
      companyName: row.company_name?.trim() || null,
    }))
}

/**
 * La recherche de la modale sur les contacts : le NOM, le poste ET la société.
 *
 * ⚠️ #1951.23 — LA SOCIÉTÉ EST CE QUI TRANCHE ENTRE DEUX HOMONYMES. « Sophie
 * Martin » existe deux fois dans un portefeuille d'ESN ; sans la société dans la
 * recherche ET dans le libellé, le choix se ferait à pile ou face, et la méprise
 * ne se verrait qu'à la réponse.
 */
export function filterScopeContacts(list: readonly ScopeContact[], query: string): ScopeContact[] {
  const needle = fold(query)
  if (!needle) return [...list]
  return list.filter(item =>
    fold(`${item.fullName ?? ''} ${item.title ?? ''} ${item.companyName ?? ''}`).includes(needle),
  )
}

/**
 * #1951.1 / #1951.23 — le libellé nomme la personne ET sa société.
 *
 * « Sophie Martin » seul se lit chez n'importe quel client ; c'est exactement la
 * confusion d'homonymes que le retour demande d'éviter. Sans société connue, le
 * nom reste seul — on n'invente pas l'employeur d'un contact à qualifier.
 */
export function contactScope(contact: ScopeContact): ObjectChatScope {
  const name = contact.fullName
  return {
    kind: 'contact',
    contactId: contact.id,
    label: name ? (contact.companyName ? `${name} · ${contact.companyName}` : name) : null,
  }
}

/**
 * #1951.4 — UNE OPPORTUNITÉ DU PIPE, proposable comme périmètre.
 *
 * ⚠️ « Opportunité » désigne deux choses dans ce produit, et une seule fait une
 * portée : la LIGNE du pipe (avec son identifiant et son étape), jamais le
 * STATUT commercial d'un compte. Cadrer un fil sur « un compte au statut
 * opportunité » aurait donné un second nom au compte — une deuxième vérité pour
 * un objet déjà atteignable par la portée « un compte ».
 */
type ScopeOpportunity = { id: string; label: string; accountName: string | null; stage: string | null }

/** La forme minimale lue d'une opportunité — un sous-ensemble de `ProjectRow`. */
type OpportunityLike = { id: string; label: string; company_name?: string | null; stage?: string | null }

/**
 * Les affaires proposables. Toutes celles que le pipe rend : contrairement au
 * consultant archivé ou à la mission terminée, une affaire PERDUE reste une
 * question légitime (« pourquoi l'a-t-on perdue ? »), et l'écarter retirerait
 * une capacité en ayant l'air d'en ajouter une. C'est l'étape qui le dit, et
 * elle est montrée.
 */
export function scopeOpportunitiesFrom(rows: readonly OpportunityLike[]): ScopeOpportunity[] {
  return rows.map(row => ({
    id: row.id,
    label: row.label,
    accountName: row.company_name?.trim() || null,
    stage: row.stage?.trim() || null,
  }))
}

/** La recherche de la modale sur le pipe : l'intitulé ET le compte. */
export function filterScopeOpportunities(list: readonly ScopeOpportunity[], query: string): ScopeOpportunity[] {
  const needle = fold(query)
  if (!needle) return [...list]
  return list.filter(item => fold(`${item.label} ${item.accountName ?? ''}`).includes(needle))
}

/** Le libellé nomme l'affaire ET son compte — « Refonte du SI » seul se lit partout. */
export function opportunityScope(opportunity: ScopeOpportunity): ObjectChatScope {
  return {
    kind: 'opportunity',
    opportunityId: opportunity.id,
    label: opportunity.accountName ? `${opportunity.label} · ${opportunity.accountName}` : opportunity.label,
  }
}

/**
 * Théo L1 — sélecteur avancé — UNE OFFRE D'EMPLOI PROPOSABLE COMME PÉRIMÈTRE.
 *
 * Un signal de RECRUTEMENT repéré chez un compte (`GET /accounts/signals`, le
 * flux de la Veille), désigné par l'identifiant de sa ligne d'historique. Ce
 * qu'une ligne de la modale montre : l'intitulé, le compte, la date. Ni la
 * source (nos fournisseurs ne se nomment jamais), ni le salaire.
 */
type ScopeJobOffer = { id: string; title: string; accountName: string | null; date: string | null }

/** La forme minimale lue d'un signal — un sous-ensemble de `AccountSignalItem`. */
type JobOfferSignalLike = {
  history_id?: string | null
  label: string
  company_name?: string | null
  type?: string | null
  date?: string | null
}

/** Les natures de signal qui sont une offre d'emploi — celles que le serveur relit. */
const RECRUITMENT_TYPES: ReadonlySet<string> = new Set(['recrutement', 'hiring', 'recruitment'])

/**
 * Les offres proposables. Trois filtres, chacun une règle :
 *  · un signal de RECRUTEMENT seulement — une levée de fonds n'est pas une offre ;
 *  · un signal HISTORISÉ seulement — sans `history_id`, rien ne le désigne, et
 *    le proposer ferait cadrer un fil sur une offre que le serveur ne relira pas ;
 *  · jamais un STAGE (décision Louis 12/10 : « pas d'offres de stages dans tous
 *    les signaux »), lu par le prédicat partagé `isInternshipPosting`.
 */
export function scopeJobOffersFrom(rows: readonly JobOfferSignalLike[]): ScopeJobOffer[] {
  return rows
    .filter(row => !!row.history_id && RECRUITMENT_TYPES.has(row.type ?? '') && !isInternshipPosting(row.label))
    .map(row => ({
      id: row.history_id as string,
      title: row.label,
      accountName: row.company_name?.trim() || null,
      date: row.date ?? null,
    }))
}

/** La recherche de la modale sur les offres : l'intitulé ET le compte. */
export function filterScopeJobOffers(list: readonly ScopeJobOffer[], query: string): ScopeJobOffer[] {
  const needle = fold(query)
  if (!needle) return [...list]
  return list.filter(item => fold(`${item.title} ${item.accountName ?? ''}`).includes(needle))
}

/** Le libellé nomme l'offre ET son compte — « Data engineer » seul se lit chez n'importe quel client. */
export function jobOfferScope(offer: ScopeJobOffer): ObjectChatScope {
  return {
    kind: 'job_offer',
    jobOfferId: offer.id,
    label: offer.accountName ? `${offer.title} · ${offer.accountName}` : offer.title,
  }
}

/**
 * Théo L1 — sélecteur avancé — « Demander à Laura » depuis UN signal : la valeur
 * `?scope=` qui cadre le fil sur cette offre, ou `null` quand le signal n'en est
 * pas une proposable (autre nature, non historisé, stage) — mêmes règles que la
 * modale, par la même fonction.
 */
export function jobOfferScopeParamOf(signal: JobOfferSignalLike): string | null {
  const [offer] = scopeJobOffersFrom([signal])
  return offer ? chatScopeObjectParam({ kind: 'job_offer', id: offer.id }) : null
}
