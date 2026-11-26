import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_TOOLS,
  OUR_SUPPLIERS,
  connectedClientTools,
  supplierNamesIn,
  type ConnectedTool,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * GA-44 — aucun nom d'outil ÉCRIT EN DUR dans les écrans, et jamais NOS fournisseurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE REFAITE — décision Louis 13/09/2026, batch 11 (#1912.11)
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle d'avant (ci-dessous, gardée pour la trace) traitait pareil l'outil
 * du client et le nôtre. Elle est refaite sur l'axe D354 du site public — à qui
 * appartient l'outil :
 *
 *   • l'outil que l'espace a BRANCHÉ se nomme — « brouillon déposé dans Gmail »,
 *     les outils branchés dans la saisie de Laura — par INJECTION depuis ses
 *     connexions (`connectedClientTools`, `@bellum/contracts`). `{tool.name}`
 *     n'est pas un littéral : cette garde ne le voit pas, et c'est voulu ;
 *   • un nom d'outil client écrit EN DUR reste refusé : il serait promis à qui
 *     ne l'a pas branché ;
 *   • NOTRE fournisseur ne se nomme jamais, ni en dur, ni injecté — la
 *     dérivation l'écarte (`tool-naming.test.ts`, et le dernier bloc ici).
 *
 * Les listes ne sont plus recopiées ici : elles vivent dans `@bellum/contracts`
 * (`schemas/tool-naming.ts`), un seul endroit pour cinq gardes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE D'AVANT (02/08/2026), ET SON EXCEPTION UNIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Arbitrage du 02/08/2026 : le copilote, les dossiers, les contacts, les
 * séquences et les notifications nomment la CAPACITÉ — « ton CRM », « ta
 * messagerie », « ton agenda » — jamais l'éditeur.
 *
 * L'exception est l'écran **Réglages › Intégrations**, et elle se justifie
 * d'elle-même : c'est là que l'utilisateur autorise l'accès, et un bouton
 * « Connecter » doit dire ce qu'il connecte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux gardes existaient et couvraient chacune une moitié :
 *
 *   - `test_copilote_prompt_blocks.py` — le PROMPT système du copilote ;
 *   - `tool-capability-digest.spec.ts` — le DIGEST des outils qu'on lui injecte.
 *
 * Aucune ne regardait l'ÉCRAN. Résultat mesuré en recette live le 25/08/2026 :
 * le bandeau en tête de chaque conversation avec Laura affichait « HubSpot ·
 * Connecté », « Google Workspace · Connecté », « Slack · Non connecté » — à
 * l'endroit exact que la règle cite en premier, et depuis des mois.
 *
 * C'est le motif « la garde vérifie une moitié » : ce qui est gardé est ce que
 * le modèle DIT, pas ce que l'écran MONTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'ELLE AVAIT ENCORE — LES CONTRATS PARTAGÉS (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Son propre docblock l'annonçait : « un nom d'éditeur peut arriver du serveur
 * dans une chaîne de données ». C'est exactement ce qui se passait.
 *
 * `packages/contracts/src/schemas/classified-data.ts` écrivait
 * `'Apollo (annuaire vérifié)'` et `'registre public Pappers'` dans les PREUVES
 * du score de contact. Ces preuves sont recalculées à chaque lecture par
 * `ContactsService.scoreContacts`, voyagent dans `GET /contacts`, et
 * `ContactScoreBreakdown` les rend BRUTES sous chaque critère. Deux noms
 * d'éditeur s'affichaient donc sur la fiche contact — et un test
 * (`ContactScoreBreakdown.test.tsx`) EXIGEAIT leur présence : la garde qui
 * aurait dû protéger la règle protégeait son infraction.
 *
 * Ni cette garde (qui ne lisait que `apps/web/src`), ni celle de l'i18n
 * (`i18n/no-vendor-names.test.ts`, qui ne lit que `resources`) ne pouvaient le
 * voir : le texte n'était écrit ni dans un écran, ni dans un catalogue de
 * traduction, mais dans un paquet partagé. D'où le second corpus ci-dessous.
 *
 * ⚠️ Elle ne peut toujours pas tout attraper — un nom d'éditeur peut encore
 * venir d'une réponse de fournisseur recopiée telle quelle. Elle ferme les deux
 * chemins durables : le littéral écrit dans l'écran, et celui écrit dans le
 * contrat que l'écran affiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'ELLE AVAIT ENCORE — LE RÉSEAU PROFESSIONNEL (recette live 29/08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot D4 est parti mergé, et la recette en ligne du soir même a trouvé
 * « LinkedIn » à trois endroits hors Réglages › Intégrations :
 *
 *   1. les 25 cartes de personne de l'organigramme, en SOURCE sous chaque nom
 *      (`accountOrg.json` → `orgGraph.sourceKinds.linkedin`) ;
 *   2. le composant « Identité » de la couverture du compte (« un email ou un
 *      profil LinkedIn ») — à QUATRE lignes du composant « Sources » qui écrit,
 *      lui, « réseau professionnel » ;
 *   3. la réponse de Laura à `search_dormant_network` (« LinkedIn disponible »).
 *
 * La raison est bête et vaut d'être écrite : **`LinkedIn` n'était pas dans
 * `VENDORS`**. Les deux premiers vivaient dans `apps/web/src/i18n/locales`, en
 * plein dans le corpus que cette garde balaie déjà — elle les LISAIT et ne les
 * RECONNAISSAIT pas. Le troisième vient d'`apps/api` (la charge utile du pont
 * copilote), qu'aucun de ses deux corpus n'atteint : c'est GA-69
 * (`apps/api/src/architecture/copilot-payload-names-the-capability.spec.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX SURFACES — ET POURQUOI LA RÈGLE NE VAUT QUE POUR LA PREMIÈRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajouter `LinkedIn` sans rien d'autre aurait rendu la garde rouge sur du code
 * JUSTE — et une garde rouge sur du code juste se fait désactiver dans la
 * semaine. Le plan d'action écrit « Envoyer une demande de connexion LinkedIn
 * personnalisée à … », et c'est utile : « envoyer une demande de connexion sur
 * ton réseau professionnel » est plus vague, donc moins actionnable.
 *
 * La règle a été écrite pour des LIBELLÉS D'INTERFACE. On distingue donc deux
 * surfaces, ici comme dans les écrans :
 *
 *   • **Surface d'interface** — ce que l'application dit de SES données : la
 *     provenance d'un fait, la source d'un lien, un composant de score, une
 *     explication de qualité. L'utilisateur n'agit pas dessus, il la LIT.
 *     ⇒ on nomme la CAPACITÉ. C'est là que vivaient les trois fuites.
 *
 *   • **Surface d'action** — le CANAL d'un geste que l'humain va exécuter
 *     lui-même : ouvrir un profil, rédiger un message, choisir par quoi
 *     joindre quelqu'un, une colonne d'import ou d'export, une question sur sa
 *     propre routine. ⇒ le canal se NOMME.
 *
 * La seconde surface est énumérée clé par clé plus bas. Cette énumération est
 * volontairement pénible : une clé neuve est GARDÉE par défaut, et la liste ne
 * peut que rétrécir. Un `if (key.includes('linkedin')) continue` aurait été
 * plus court et n'aurait rien gardé du tout.
 */

const WEB_SRC = join(__dirname, '..')

/** Les schémas partagés — la deuxième source de texte qui atteint un écran. */
const CONTRACTS_SCHEMAS = join(__dirname, '../../../../packages/contracts/src/schemas')

/**
 * Les noms que cette garde cherche en sous-chaîne dans le texte AFFICHÉ — lus
 * dans `@bellum/contracts` (`tool-naming.ts`), plus recopiés ici (#1912.11).
 *
 * Tous les outils du CLIENT, sous chacune de leurs formes : écrits en dur, ils
 * seraient promis à qui ne les a pas branchés. « LinkedIn » en fait partie, et
 * c'est par lui que les trois fuites de la recette du 29/08 sont passées — le
 * produit a déjà tranché la formulation ailleurs (« Réseau professionnel »).
 *
 * NOS fournisseurs de données et de modèles : « Apollo (annuaire vérifié) » est
 * arrivé sur la fiche contact par là. Le contrat les porte sous leur forme non
 * ambiguë (« Brave Search », « Hunter.io ») : « Brave » est un mot français, et
 * « Hunter » un mot anglais que l'archétype « Solo hunter » emploie.
 *
 * L'hébergement aussi. Mesuré le 13/09/2026 en l'ajoutant : `manager.json →
 * footer.hosting` écrivait « base Supabase, région eu-west-1 » sous le tableau
 * de bord d'ÉQUIPE (`routes/team`, un écran client, pas le back-office). La
 * garantie due au lecteur est la RÉSIDENCE des données, pas le nom de
 * l'hébergeur : le texte dit désormais « hébergées dans l'Union européenne ».
 */
const VENDORS: readonly string[] = [
  ...new Set([...CLIENT_TOOLS.flatMap(tool => tool.names), ...OUR_SUPPLIERS.map(supplier => supplier.name)]),
]

/**
 * Là où nommer l'éditeur est LÉGITIME.
 *
 * ⚠️ Cette liste ne peut que RÉTRÉCIR. Y ajouter un chemin demande de répondre
 * d'abord à « pourquoi cet écran doit-il nommer un outil ? ».
 */
const ALLOWED_PATHS = [
  '/features/integration-center/', // l'écran Réglages › Intégrations — l'exception
  '/features/integrations/',
  '/features/settings/integrations',
  '/features/tools/', // le registre d'outils : même écran, autre dossier
  '/architecture/', // cette garde elle-même
] as const

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.(tsx?|json)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Retire les commentaires : un docblock qui EXPLIQUE la règle la cite. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function isAllowed(file: string): boolean {
  return ALLOWED_PATHS.some(p => file.includes(p))
}

/**
 * Ce qui peut atteindre l'écran : les littéraux de chaîne et le texte JSX.
 *
 * Un identifiant (`ApolloFirmographicsCard`, `apolloEnrichment`) n'est pas
 * affiché. Le confondre avec du texte ferait échouer la garde sur des
 * renommages qui ne changeraient rien pour l'utilisateur — et une garde qui
 * demande du travail sans effet est une garde qu'on finit par désactiver.
 */
function displayedParts(source: string): string[] {
  // Un CHEMIN d'import est un littéral de chaîne, et il porte le nom du
  // composant : `from './sections/ApolloFirmographicsCard'`. Le compter
  // exigerait de renommer des fichiers sans rien changer à l'écran.
  const body = source.replace(/^\s*(import|export)\s[^\n]*$/gm, '')
  const parts: string[] = []
  // Littéraux simples, doubles et gabarits.
  for (const m of body.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g)) {
    parts.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  // Texte nu entre balises JSX : `>Apollo<`.
  //
  // ⚠️ Le même motif attrape les GÉNÉRIQUES TypeScript — `<Foo | null>` finit
  // par `>` et commence par `<`. On écarte donc ce qui n'a aucune espace ET
  // ressemble à un identifiant : du texte affiché en contient presque toujours,
  // un identifiant jamais.
  for (const m of body.matchAll(/>([^<>{}\n]{2,})</g)) {
    const text = (m[1] ?? '').trim()
    if (!text.includes(' ') && /^[A-Za-z][A-Za-z0-9_$.|\s]*$/.test(text)) continue
    parts.push(text)
  }
  return parts
}

/**
 * Le même corpus, en un seul bloc.
 *
 * ⚠️ La forme découpée est celle qui compte pour les CONTRATS : on y exempte un
 * littéral, pas un fichier — `dashboard.ts` porte le canal d'une action ET
 * pourrait porter demain une provenance, et un `.includes()` sur le fichier
 * entier ne saurait pas les distinguer.
 */
function displayedStrings(source: string): string {
  return displayedParts(source).join('\n')
}

/**
 * #1912 — la PROSE parmi ce qui peut atteindre l'écran : un littéral qui porte
 * une espace. C'est là que NOS fournisseurs se cherchent sans la casse.
 *
 * Pourquoi pas tous les littéraux : mesuré le 13/09/2026, la recherche
 * insensible à la casse sur l'ensemble du corpus rendait 45 fautifs, TOUS des
 * identifiants machine (`'pappers'`, `'apollo.linkedin'`) et une URL — des
 * valeurs qu'aucun écran n'affiche telles quelles, et qu'une garde ne peut pas
 * interdire sans interdire le code qui route vers le bon fournisseur. Une phrase,
 * elle, a une espace. Un identifiant AFFICHÉ se tient ailleurs : c'est
 * `dataSourceLabel` et son test, qui passe chaque identifiant au rendu.
 */
function proseParts(source: string): string[] {
  return displayedParts(source).filter(part => /\s/.test(part))
}

/** Les fichiers d'i18n de l'écran Intégrations, exemptés par leur nom. */
function isIntegrationsCopy(file: string): boolean {
  return /\/locales\/[a-z]{2}\/(integrations|tools|settings)\.json$/.test(file)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * LA SURFACE D'ACTION — le canal d'un geste que l'humain exécute lui-même.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Les cinq raisons pour lesquelles nommer le canal est LÉGITIME.
 *
 * Chacune décrit un geste que l'UTILISATEUR pose, pas une donnée que
 * l'application lui présente. C'est toute la différence : « Ouvrir LinkedIn »
 * est un bouton qui l'emmène quelque part ; « source : LinkedIn » sous une
 * carte de personne est l'application qui parle de sa propre collecte.
 */
const ACTION_SURFACE_REASONS = {
  openTheProfile:
    "Le geste emmène l'utilisateur SUR le réseau : un bouton qui promet « ouvrir le réseau professionnel » et atterrit ailleurs qu'attendu ment sur sa destination. Nommer la destination d'un lien sortant, c'est la même honnêteté que le reste de la règle.",
  draftTheMessage:
    "Le CONTENU d'une action recommandée à un humain. Le canal est l'information dont le commercial a besoin pour l'exécuter — « envoyer une demande de connexion sur ton réseau professionnel » est plus vague, donc moins utile. Arbitrage de la recette live du 29/08/2026.",
  pickTheChannel:
    "Un filtre ou un compteur PAR CANAL : l'utilisateur choisit par quoi il va joindre quelqu'un. Le canal est ici le critère de son choix, pas la provenance d'une donnée qu'on lui affiche.",
  fileColumn:
    "Une colonne d'un fichier importé ou exporté. Elle est lue hors de l'application, par un humain ou un tableur, et doit dire ce qu'elle contient — l'anonymiser rendrait le mapping d'import indevinable.",
  ownRoutine:
    "Une question sur la routine de l'utilisateur, ou un exemple de SON contenu. C'est lui qui nomme ses outils, comme à l'onboarding — même nature que l'exception de Réglages › Intégrations.",
} as const

type ActionSurfaceReason = keyof typeof ACTION_SURFACE_REASONS

/**
 * Les clés d'i18n qui vivent sur la surface d'ACTION, une par une.
 *
 * ⚠️ La clé est identifiée par `<catalogue>:<chemin de clé>` — les deux langues
 * partagent le même chemin, donc une entrée vaut pour `fr` ET `en`. Une clé
 * absente du catalogue fait ÉCHOUER la garde (test « la liste ne prend pas la
 * poussière ») : elle ne peut que rétrécir.
 */
const ACTION_SURFACE_KEYS: ReadonlyArray<{ key: string; why: ActionSurfaceReason }> = [
  // ── Ouvrir le profil de quelqu'un ──────────────────────────────────────────
  { key: 'accountDetail.json:firmographics.linkedinAria', why: 'openTheProfile' },
  // #4416 (lot W, intégration PR n°3) — le canal d'une ÉTAPE du plan : le commercial doit savoir par où l'exécuter.
  { key: 'accountDetail.json:planSteps.channel.linkedin', why: 'draftTheMessage' },
  // #3427 — le canal d'un exemple de la bibliothèque de messages : le critère par lequel l'exemple se range.
  { key: 'knowledge.json:messageLibrary.channel.linkedin_draft', why: 'pickTheChannel' },
  { key: 'accountDetail.json:reverseProspects.openProfile', why: 'openTheProfile' },
  { key: 'accountOrg.json:row.viewLinkedin', why: 'openTheProfile' },
  { key: 'contacts.json:table.viewOnLinkedin', why: 'openTheProfile' },
  { key: 'contacts.json:table.contactViaLinkedin', why: 'openTheProfile' },
  { key: 'contacts.json:header.linkedin', why: 'openTheProfile' },
  // #4404 (lot M, intégration PR n°2+3) — l'étiquette du champ « Profil LinkedIn » de la fiche : le lien que le commercial ouvre, comme header.linkedin.
  { key: 'contacts.json:keyInfo.linkedin', why: 'openTheProfile' },
  { key: 'contacts.json:apollo.linkedin', why: 'openTheProfile' },
  // #3952.2 (lot N04) — le champ où le commercial SAISIT l'adresse du profil d'un consultant : la personne cherche « la case LinkedIn » (retour bêta 08/10). Même geste que contacts.json:header.linkedin. Choix de l'intégration Z, à ratifier.
  { key: 'consultants.json:form.publicProfile', why: 'openTheProfile' },
  { key: 'consultants.json:identity.fields.publicProfileUrl', why: 'openTheProfile' },
  // #4348 (intégration PR n°2) — pré-remplir une fiche consultant depuis l'ADRESSE d'un profil : le champ et le geste
  // portent le nom du réseau parce que la personne y COLLE une adresse de ce réseau (même geste que `form.publicProfile`).
  { key: 'consultants.json:form.linkedinLookup.label', why: 'openTheProfile' },
  { key: 'consultants.json:form.linkedinLookup.open', why: 'openTheProfile' },
  // #4348 — la nature de la source d'une valeur pré-remplie : le profil que le commercial a lui-même désigné.
  { key: 'consultants.json:sources.linkedin_profile', why: 'openTheProfile' },
  { key: 'engagement.json:message.openLinkedin', why: 'openTheProfile' },
  { key: 'engagement.json:message.copyAndOpenLinkedin', why: 'openTheProfile' },
  { key: 'engagement.json:message.copyAndOpenLinkedinHint', why: 'openTheProfile' },
  {
    key: 'accountOrg.json:orgGraph.verifyRelationHint',
    why: 'openTheProfile',
  },

  // ── Préparer un message, une cadence, un geste ─────────────────────────────
  { key: 'chat.json:pending.describeMessage.linkedin', why: 'draftTheMessage' },
  { key: 'contacts.json:selection.actions.linkedinLabel', why: 'draftTheMessage' },
  { key: 'contacts.json:cadence.scenario.linkedin', why: 'draftTheMessage' },
  // #4737 — l'envoi d'un message SOUS MANDAT sur le réseau : le geste que le commercial pose, et le canal est ce qu'il
  // faut lui dire (le mandat, la borne du jour, un envoi à l'issue inconnue). C'est le réseau de la personne jointe,
  // jamais le fournisseur d'envoi, qui ne se nomme nulle part.
  { key: 'engagement.json:linkedinDelegation.aria', why: 'draftTheMessage' },
  { key: 'engagement.json:linkedinDelegation.error', why: 'draftTheMessage' },
  { key: 'engagement.json:linkedinDelegation.notOpen.hint', why: 'draftTheMessage' },
  { key: 'engagement.json:linkedinDelegation.result.refused.previous_unknown', why: 'draftTheMessage' },
  { key: 'engagement.json:linkedinDelegation.result.unknown', why: 'draftTheMessage' },
  { key: 'engagement.json:linkedinDelegation.send', why: 'draftTheMessage' },
  { key: 'engagement.json:linkedinDelegation.title', why: 'draftTheMessage' },
  { key: 'accountDetail.json:salesContext.states.linkedin', why: 'draftTheMessage' },
  { key: 'engagement.json:channel.draft.linkedin', why: 'draftTheMessage' },
  // #3693.1 — le geste « Préparer un message LinkedIn » : le canal du texte que l'humain envoie lui-même.
  { key: 'engagement.json:channel.action.linkedin', why: 'draftTheMessage' },
  { key: 'engagement.json:preset.linkedin', why: 'draftTheMessage' },
  // #2370 (lot V10-F) — la note d'invitation LinkedIn : le texte que l'humain colle lui-même dans sa demande
  // de connexion. Même geste que `engagement.json:channel.draft.linkedin` / `channel.action.linkedin`.
  { key: 'engagement.json:channel.draft.linkedin_connection_note', why: 'draftTheMessage' },
  { key: 'engagement.json:channel.action.linkedin_connection_note', why: 'draftTheMessage' },
  { key: 'engagement.json:message.declareSent.tooltip', why: 'draftTheMessage' },
  // #2147.5 (correctif 26/09 soir) — l'import de style lit un exemple que le
  // commercial COLLE lui-même ; ce sélecteur nomme le CANAL d'où vient ce
  // texte, même nature que `chat.json:pending.describeMessage.linkedin`
  // juste au-dessus — le commercial a besoin de savoir quel type de message il
  // décrit, pas l'application qui parlerait de sa propre collecte.
  { key: 'knowledge.json:style.importKind.linkedin_message', why: 'draftTheMessage' },

  // ── Choisir le canal ───────────────────────────────────────────────────────
  { key: 'contacts.json:channels.linkedin', why: 'pickTheChannel' },
  { key: 'contacts.json:list.channelWithLinkedin', why: 'pickTheChannel' },
  { key: 'contacts.json:list.channelWithBoth', why: 'pickTheChannel' },
  { key: 'contacts.json:selection.infoLinkedin', why: 'pickTheChannel' },
  { key: 'contacts.json:selection.missingLinkedin', why: 'pickTheChannel' },
  { key: 'contacts.json:enrich.confirm.fieldLinkedin', why: 'pickTheChannel' },
  { key: 'engagement.json:channel.linkedin', why: 'pickTheChannel' },
  // #2370 (lot V10-F) — le canal « note d'invitation LinkedIn » dans le sélecteur de canal et dans la
  // création d'un style : même surface que `engagement.json:channel.linkedin`.
  { key: 'engagement.json:channel.linkedin_connection_note', why: 'pickTheChannel' },
  { key: 'knowledge.json:style.create.channels.linkedin_connection_note', why: 'pickTheChannel' },
  { key: 'engagement.json:trigger.enrichTooltip', why: 'pickTheChannel' },
  // #2629.2 — le repli de canal, sur la fiche d'un compte. Même surface que
  // `contacts.json:selection.missingLinkedin` et `list.channelWithLinkedin`
  // déjà déclarés ci-dessus : l'écran dit PAR QUOI ce contact-là se joint
  // encore, pour que le commercial choisisse son geste. Ce n'est pas la
  // provenance d'une donnée qu'on lui présente, et ce n'est pas un
  // fournisseur de Bellum — c'est la coordonnée que le contact possède.
  { key: 'engagement.json:trigger.linkedinOnly', why: 'pickTheChannel' },
  { key: 'engagement.json:trigger.availableChannelsLinkedinOnly', why: 'pickTheChannel' },
  // Théo C6 — la page « Préparer ton message LinkedIn » : le canal est le CONTENU du geste (choisir le canal de
  // préparation, rédiger le message, ouvrir le profil) — mêmes raisons que `engagement.json:channel.*` ci-dessus.
  { key: 'engagement.json:approachPage.channel.linkedin', why: 'pickTheChannel' },
  { key: 'engagement.json:approachPage.notFound.body', why: 'pickTheChannel' },
  { key: 'engagement.json:approachPage.title.linkedin', why: 'draftTheMessage' },
  { key: 'engagement.json:approachPage.draft.toLinkedin', why: 'draftTheMessage' },
  { key: 'engagement.json:approachPage.draft.noLinkedin', why: 'openTheProfile' },
  { key: 'engagement.json:approachPage.draft.linkedinKind', why: 'draftTheMessage' },
  { key: 'engagement.json:approachPage.more.connectionNote', why: 'pickTheChannel' },
  // #2373.9 — la preuve d'autorisation d'une introduction : le canal par lequel
  // le référent a confirmé. Même surface que `contacts.json:channels.linkedin`
  // juste au-dessus — un sélecteur de canal, pas une donnée affichée.
  { key: 'contacts.json:warmIntro.form.channel.linkedin', why: 'pickTheChannel' },
  // #2373.9 — l'étape « Classifier ce lien » de la même autorisation : le
  // commercial CHOISIT, dans une liste, ce qui décrit le lien avec le référent
  // (collègue, ancien collègue, relation commune…). « Interaction LinkedIn » en
  // est une VALEUR parmi d'autres — le geste de choisir sa nature, pas une
  // provenance affichée.
  { key: 'contacts.json:warmIntro.linkKind.linkedin_interaction', why: 'pickTheChannel' },

  // ── Une colonne de fichier ─────────────────────────────────────────────────
  { key: 'accountOrg.json:import.description', why: 'fileColumn' },
  // Le descripteur du livrable CONTACTS énumère les colonnes du tableur produit
  // (`documents.service.ts` : « Nom, Fonction, Entité, Email, Téléphone,
  // LinkedIn, Statut », la colonne LinkedIn étant remplie par `linkedin_url`).
  // Écrire « réseau professionnel » ici ferait MENTIR l'écran sur l'en-tête que
  // le commercial lira dans son tableur — vérifié le 22/09/2026 côté API avant
  // de poser cette ligne, pas déduit du libellé.
  { key: 'accounts.json:deliverables.descriptors.content.contacts', why: 'fileColumn' },
  // #2927 (#2159.32/.33, lot V17 28/09) — le rapport de simulation d'import
  // nomme sur QUELLE colonne du fichier déposé une ligne fait doublon
  // (« ligne 42 — doublon sur : profil LinkedIn »). Même nature que
  // `accountOrg.json:import.description` juste au-dessus : la colonne
  // s'appelle comme dans le fichier du commercial, jamais comme un
  // fournisseur de Bellum.
  { key: 'importWizard.json:duplicateKeys.linkedin_url', why: 'fileColumn' },
  // Aperçu du fichier d'organigramme déclaré (« Complété par Bellum : … ») : la colonne
  // s'appelle comme dans le fichier du commercial.
  { key: 'accounts.json:orgDeclare.file.preview.fieldLinkedin', why: 'fileColumn' },

  // ── Le contenu de l'utilisateur, ou une question sur sa routine ────────────
  { key: 'knowledge.json:documents.titlePlaceholder', why: 'ownRoutine' },
  { key: 'onboarding.json:profileQuestions.items.weekly_linkedin.label', why: 'ownRoutine' },
  // #2634.1 — « Ajouter un signal depuis LinkedIn » : le commercial colle
  // lui-même une URL et/ou un texte qu'il a lu, jamais une collecte
  // automatisée (doctrine c79). Le CONTENU de ce geste — le bouton qui le
  // déclenche, le titre du formulaire, le champ où coller le texte, l'accusé
  // de réception — nomme honnêtement d'où vient le fait déclaré, même patron
  // que `engagement.json:message.declareSent.tooltip` juste au-dessus.
  { key: 'accountWatch.json:declareLinkedin.trigger', why: 'draftTheMessage' },
  { key: 'accountWatch.json:declareLinkedin.dialogTitle', why: 'draftTheMessage' },
  { key: 'accountWatch.json:declareLinkedin.dialogDescription', why: 'draftTheMessage' },
  { key: 'accountWatch.json:declareLinkedin.noteLabel', why: 'draftTheMessage' },
  { key: 'accountWatch.json:declareLinkedin.toast.done', why: 'draftTheMessage' },
  // Lot L-B (#4165) — les VRAIS canaux d'une étape de séquence. LinkedIn y est le canal d'un geste que
  // l'humain exécute lui-même (« copier le message et ouvrir le profil », puis « marquer envoyé ») : Bellum
  // ne pilote jamais LinkedIn. Nommer le canal est ce dont le commercial a besoin pour exécuter l'étape,
  // et le choisir est le critère de sa cadence — mêmes raisons que `engagement.json:channel.*` plus haut.
  { key: 'outreach.json:stepKind.linkedin_invite', why: 'pickTheChannel' },
  { key: 'outreach.json:stepKind.linkedin_message', why: 'pickTheChannel' },
  { key: 'outreach.json:kind.linkedin_invite', why: 'pickTheChannel' },
  { key: 'outreach.json:kind.linkedin_message', why: 'pickTheChannel' },
  { key: 'outreach.json:multichannel.gesture.linkedinNoDraft', why: 'draftTheMessage' },
  { key: 'outreach.json:multichannel.gesture.linkedinNoProfile', why: 'openTheProfile' },
  { key: 'outreach.json:multichannel.gesture.manualNote', why: 'draftTheMessage' },
  { key: 'outreach.json:multichannel.skipped.linkedin_invite_not_accepted', why: 'draftTheMessage' },
]

/**
 * Les fichiers de CODE qui vivent sur la surface d'action.
 *
 * Beaucoup moins nombreux que les clés, parce qu'un libellé écrit en dur dans
 * un composant est déjà une anomalie ailleurs. Ceux-là portent des VALEURS de
 * canal (`ActionChannel`) ou des en-têtes de fichier, pas de la traduction.
 */
const ACTION_SURFACE_FILES: ReadonlyArray<{ file: string; why: ActionSurfaceReason }> = [
  {
    file: '/features/accounts/view/account-detail/components/contact-engagement/EngagementPanel.tsx',
    why: 'draftTheMessage',
  },
  { file: '/features/contacts/view/contacts-list/ContactTableRow.tsx', why: 'openTheProfile' },
  { file: '/features/knowledge/view/Knowledge.tsx', why: 'ownRoutine' },
  { file: '/features/google/components/ExportSheetButton.tsx', why: 'fileColumn' },
  { file: '/lib/export-csv.ts', why: 'fileColumn' },
  // #2634.1 — `source: 'LinkedIn'` est la VALEUR envoyée à
  // `POST /accounts/:id/signals/declare` (`DECLARED_SIGNAL_SOURCES` côté
  // contrat), pas un texte affiché à part le titre déjà déclaré ci-dessus.
  {
    file: '/features/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog.tsx',
    why: 'draftTheMessage',
  },
]

/** `apps/web/src/i18n/locales/fr/contacts.json` → `contacts.json`. */
function catalogueName(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1)
}

/** Un catalogue i18n, aplati : le chemin de clé et le texte AFFICHÉ. */
function i18nLeaves(raw: string): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = []
  const walk = (node: unknown, prefix: string): void => {
    if (typeof node === 'string') {
      out.push({ key: prefix, text: node })
      return
    }
    if (!node || typeof node !== 'object') return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, prefix ? `${prefix}.${k}` : k)
    }
  }
  walk(JSON.parse(raw), '')
  return out
}

function isLocaleCatalogue(file: string): boolean {
  return /\/i18n\/locales\/[a-z]{2}\/[^/]+\.json$/.test(file)
}

const ACTION_SURFACE_KEY_SET = new Set(ACTION_SURFACE_KEYS.map(e => e.key))

/**
 * Ce qui, aujourd'hui, affiche un nom d'éditeur hors de l'écran autorisé.
 *
 * ⚠️ Un catalogue i18n est lu CLÉ PAR CLÉ, pas en vrac. C'est ce qui permet de
 * distinguer les deux surfaces sans exempter un fichier entier — exempter
 * `contacts.json` pour son bouton « Voir sur LinkedIn » aurait ré-ouvert
 * `lifecycle.sources.linkedin_apify`, qui est une PROVENANCE, dans le même
 * fichier et à deux cents lignes de là.
 */
function vendorNamesOnScreens(): string[] {
  const found: string[] = []
  for (const file of sourceFiles(WEB_SRC)) {
    if (isAllowed(file) || isIntegrationsCopy(file)) continue
    const shortPath = file.slice(file.indexOf('/src'))
    const raw = readFileSync(file, 'utf8')

    if (isLocaleCatalogue(file)) {
      const catalogue = catalogueName(file)
      for (const { key, text } of i18nLeaves(raw)) {
        if (ACTION_SURFACE_KEY_SET.has(`${catalogue}:${key}`)) continue
        for (const vendor of VENDORS) {
          if (text.includes(vendor)) found.push(`${shortPath} → ${key} → ${vendor}`)
        }
        // #1912 — NOTRE fournisseur, casse ignorée (« pappers » en minuscules).
        for (const name of supplierNamesIn(text)) {
          if (!text.includes(name)) found.push(`${shortPath} → ${key} → ${name} (casse ignorée)`)
        }
      }
      continue
    }

    if (ACTION_SURFACE_FILES.some(e => file.endsWith(e.file))) continue
    const haystack = file.endsWith('.json') ? raw : displayedStrings(stripComments(raw))
    for (const vendor of VENDORS) {
      if (haystack.includes(vendor)) found.push(`${shortPath} → ${vendor}`)
    }
    if (!file.endsWith('.json')) {
      for (const prose of proseParts(stripComments(raw))) {
        for (const name of supplierNamesIn(prose)) {
          if (!prose.includes(name)) found.push(`${shortPath} → « ${prose.slice(0, 60)} » → ${name} (casse ignorée)`)
        }
      }
    }
  }
  return found.sort()
}

/** Les clés d'action déclarées qui n'existent plus, ou qui ne nomment plus rien. */
function staleActionSurfaceKeys(): string[] {
  const catalogues = new Map<string, Array<{ key: string; text: string }>>()
  for (const file of sourceFiles(WEB_SRC)) {
    if (!isLocaleCatalogue(file) || !file.includes('/locales/fr/')) continue
    catalogues.set(catalogueName(file), i18nLeaves(readFileSync(file, 'utf8')))
  }
  const stale: string[] = []
  for (const { key } of ACTION_SURFACE_KEYS) {
    const [catalogue, path] = key.split(':')
    const leaf = catalogues.get(catalogue ?? '')?.find(l => l.key === path)
    if (!leaf) stale.push(`${key} — clé absente du catalogue`)
    else if (!VENDORS.some(v => leaf.text.includes(v))) stale.push(`${key} — ne nomme plus aucun éditeur`)
  }
  return stale
}

/**
 * ZÉRO toléré — arbitrage de Louis, 25/08/2026.
 *
 * La question posée était : sur un bouton d'EXPORT, le nom de l'éditeur est-il
 * de la plomberie (donc interdit) ou la destination de la donnée (donc due à
 * l'utilisateur) ? Réponse : « capacité partout, sans exception ».
 *
 * Le cas que ça ouvrait — plusieurs CRM connectés, donc plusieurs lignes du
 * même libellé — se règle par un discriminant qui n'est PAS l'éditeur : le
 * `accountLabel`, le nom de l'espace CRM de l'utilisateur. Il est exposé par les
 * quatre statuts et lui parle davantage qu'un nom de produit — il reconnaît
 * « Acme Corp », pas « l'instance Salesforce ». Il n'apparaît QUE lorsqu'il y a
 * plus d'un CRM connecté : ajouter un discriminant là où il n'y a rien à
 * discriminer est du bruit.
 */
const KNOWN_VENDOR_LABELS: readonly string[] = []

/**
 * Les schémas partagés où nommer un éditeur est LÉGITIME — mesuré, pas deviné.
 *
 * ⚠️ Une garde qui interdirait partout serait rouge sur du code juste, et une
 * garde rouge sur du code juste finit désactivée. Chaque ligne dit donc POURQUOI
 * ce fichier échappe à la règle, et ce qui a été vérifié pour l'affirmer. Cette
 * liste ne peut que RÉTRÉCIR : un fichier neuf est gardé par défaut.
 */
const CONTRACTS_ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'account-job-offers.ts',
    why: "#5010.1 — `offerOriginLabel` nomme le SITE où l'annonce est publiée, lu sur l'hôte de l'URL de l'offre (liste fermée, hôte inconnu = rien). C'est le site de l'offre, jamais le champ `source` (notre fournisseur, qui ne se montre jamais). À confirmer par Louis.",
  },
  {
    file: 'telephony.ts',
    why: "Message de validation du formulaire d'identifiants de téléphonie — il ne s'affiche que dans Réglages › Intégrations, l'exception, là où l'utilisateur saisit lui-même la clé de son outil.",
  },
  {
    file: 'profile-questionnaire.ts',
    why: "Liste d'outils que l'utilisateur DÉCLARE utiliser à l'onboarding. Même nature que l'exception : c'est lui qui nomme son CRM, l'application ne lui en impose aucun.",
  },
  {
    file: 'crm-adapter.ts',
    why: "`CRM_TOOL_NAMES` nomme l'OUTIL que l'espace a lui-même BRANCHÉ (« Envoyer vers HubSpot · bellum-it.com ») — pas un de NOS fournisseurs. Décision Louis 16/10/2026 (lot CRM-ENVOI) : sans le nom de l'outil, on ne sait pas où part l'envoi.",
  },
  {
    file: 'plan-features.ts',
    why: "`pitchFr` / `pitchEn` n'ont AUCUN lecteur : l'écran verrouillé et la carte d'offre rendent `planFeatures.pitches.*` (i18n), qui dit « Pousse un contact dans ton CRM en un clic ». Seul `.fr` est lu, par le message de verrou de l'API. Mesuré le 29/08/2026.",
  },
  {
    file: 'doctrine-registry.ts',
    why: 'Registre de gouvernance : il CITE les arbitrages (« on ne vend pas remplace X »). Exporté mais rendu nulle part — aucun écran ne le lit, seule GA-38 vérifie ses chemins.',
  },
  {
    file: 'technology-radar.ts',
    why: "#4282 (décision Louis 19/10 n°16) — la liste FERMÉE du radar par technologie (« SAP, Salesforce, ServiceNow… ») : la technologie est le SUJET de la recherche du commercial (où placer un consultant SAP), jamais un de NOS fournisseurs de données. Aucune source n'y est nommée (schéma `.strict()` sans champ source).",
  },
  {
    file: 'criteria-referential.ts',
    why: "#4434 (épopée #4433, intégration PR n°4) — le référentiel PARTAGÉ des compétences : « Salesforce » y est une COMPÉTENCE (un consultant la porte, un besoin la demande), le SUJET de la recherche du commercial — même nature que `technology-radar.ts`, jamais un de NOS fournisseurs de données ni un outil que l'espace a branché. Liste fermée, aucune source n'y est nommée.",
  },
  {
    file: 'tool-naming.ts',
    why: "#1912.11 — LA liste que cette garde lit. Ses noms ne s'affichent jamais tels quels : seul `connectedClientTools` en rend un, et seulement pour un outil que l'espace a BRANCHÉ (testé dans `tool-naming.test.ts` et ci-dessous).",
  },
]

/**
 * ⚠️ EXCEPTION NOMMÉE, ET TENUE — `computeContactPriorityReason`.
 *
 * Cette fonction de `classified-data.ts` compose « décideur technique · c-level
 * · email vérifié · Apollo ». Elle a UN seul rendu : le back-office OPÉRATEUR
 * (`apps/dashboard-manager`), où l'équipe Bellum lit le rendement fournisseur
 * par fournisseur — ce n'est pas un écran client, la doctrine dit « côté app ».
 *
 * Une exception qui n'est pas tenue est une exception qui s'élargit toute seule.
 * Le test ci-dessous vérifie donc que `apps/web` ne l'importe pas : le jour où
 * un écran client l'appelle, la garde passe au rouge et l'arbitrage se rejoue.
 */
const BACKOFFICE_ONLY_EXPORT = 'computeContactPriorityReason'

function contractsFiles(): string[] {
  return readdirSync(CONTRACTS_SCHEMAS)
    .filter(f => /\.ts$/.test(f) && !/\.(test|spec)\.ts$/.test(f))
    .map(f => join(CONTRACTS_SCHEMAS, f))
}

/**
 * Retire le corps de l'export back-office, et LUI SEUL.
 *
 * Découpe bornée : de la ligne `export function …(` à la première accolade
 * fermante en colonne 0. Un découpage plus malin (compter les accolades, lire
 * jusqu'à la prochaine flèche) est exactement ce qui a produit des gardes
 * borgnes ailleurs. Les tests ci-dessous vérifient que la coupe est petite et
 * qu'elle emporte bien la fonction nommée.
 */
function stripBackofficeOnlyExport(source: string): string {
  const start = source.indexOf(`export function ${BACKOFFICE_ONLY_EXPORT}(`)
  if (start === -1) return source
  const end = source.indexOf('\n}\n', start)
  return end === -1 ? source : source.slice(0, start) + source.slice(end + 3)
}

/**
 * Les LITTÉRAUX de contrat qui vivent sur la surface d'action.
 *
 * Exempter par littéral et non par fichier : `dashboard.ts` porte le canal
 * d'une action recommandée (légitime) et pourrait porter demain une provenance
 * (interdite). Un fichier exempté ne saurait pas les distinguer — c'est
 * exactement l'erreur que l'exemption par NOM DE FICHIER de GA-44 a déjà
 * commise une fois, et que GA-45 a dû rattraper.
 */
const CONTRACTS_ACTION_SURFACE: ReadonlyArray<{ file: string; literal: string; why: ActionSurfaceReason }> = [
  {
    // `dashboardActionItemSchema.channel` — par quoi le commercial va exécuter
    // l'action que le tableau de bord lui recommande.
    file: 'dashboard.ts',
    literal: 'LinkedIn',
    why: 'draftTheMessage',
  },
  {
    // Le NOM d'un modèle de cadence que le commercial déroule à la main. Le
    // canal est la moitié de l'information : « Compte froid » seul ne dit pas
    // s'il s'agit d'une demande de connexion ou d'un e-mail.
    file: 'outreach-sequence.ts',
    literal: 'Compte froid — LinkedIn',
    why: 'draftTheMessage',
  },
  {
    // #2371 — le stade relationnel « linkedin » de la matrice du message : la
    // connexion acceptée sur LE canal où le commercial va écrire. C'est une
    // consigne de rédaction (recopiée dans le prompt, miroir
    // `app/knowledge/message_matrix.py`), pas un fournisseur de Bellum.
    file: 'message-matrix.ts',
    literal: 'connexion LinkedIn acceptée',
    why: 'draftTheMessage',
  },
]

/** Ce que les contrats partagés écrivent et qu'un écran peut afficher tel quel. */
function vendorNamesInContracts(): string[] {
  const found: string[] = []
  for (const file of contractsFiles()) {
    const name = file.slice(file.lastIndexOf('/') + 1)
    if (CONTRACTS_ALLOWED.some(a => a.file === name)) continue
    const raw = stripBackofficeOnlyExport(readFileSync(file, 'utf8'))
    for (const literal of displayedParts(stripComments(raw))) {
      if (CONTRACTS_ACTION_SURFACE.some(a => a.file === name && a.literal === literal)) continue
      for (const vendor of VENDORS) {
        if (literal.includes(vendor)) found.push(`packages/contracts/src/schemas/${name} → « ${literal} » → ${vendor}`)
      }
      if (/\s/.test(literal)) {
        for (const supplier of supplierNamesIn(literal)) {
          if (!literal.includes(supplier)) {
            found.push(`packages/contracts/src/schemas/${name} → « ${literal} » → ${supplier} (casse ignorée)`)
          }
        }
      }
    }
  }
  return [...new Set(found)].sort()
}

/** Les littéraux exemptés qui n'existent plus, ou qui ne nomment plus d'éditeur. */
function staleContractsActionSurface(): string[] {
  const stale: string[] = []
  for (const { file, literal } of CONTRACTS_ACTION_SURFACE) {
    const full = contractsFiles().find(f => f.endsWith(`/${file}`))
    if (!full) {
      stale.push(`${file} — fichier absent`)
      continue
    }
    const parts = displayedParts(stripComments(readFileSync(full, 'utf8')))
    if (!parts.includes(literal)) stale.push(`${file} → « ${literal} » — littéral absent`)
    else if (!VENDORS.some(v => literal.includes(v))) stale.push(`${file} → « ${literal} » — ne nomme aucun éditeur`)
  }
  return stale
}

/** Les fichiers d'`apps/web` qui importent l'export réservé au back-office. */
function webImportersOfBackofficeExport(): string[] {
  return sourceFiles(WEB_SRC)
    .filter(f => /\.tsx?$/.test(f))
    .filter(f => new RegExp(`\\b${BACKOFFICE_ONLY_EXPORT}\\b`).test(readFileSync(f, 'utf8')))
    .map(f => f.slice(f.indexOf('/src')))
}

describe('GA-44 — les écrans nomment la capacité, pas l’éditeur', () => {
  it('LIT quelque chose — le corpus des écrans n’est pas vide', () => {
    // Sans ce test, un chemin renommé rendrait la garde verte sur du vide.
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(200)
  })

  it('trouve bien les noms là où ils sont AUTORISÉS — preuve qu’elle sait voir', () => {
    // Si elle ne trouve aucun éditeur dans l'écran Intégrations, c'est qu'elle
    // ne cherche pas au bon endroit, et son silence ailleurs ne vaut rien.
    const allowed = sourceFiles(WEB_SRC).filter(f => isAllowed(f) || isIntegrationsCopy(f))
    const hits = allowed.filter(f => VENDORS.some(v => readFileSync(f, 'utf8').includes(v)))
    expect(hits.length).toBeGreaterThan(0)
  })

  it('aucun écran hors Réglages › Intégrations n’AFFICHE un nom d’éditeur', () => {
    const offenders = vendorNamesOnScreens()
    // Nommer le coupable : un `toEqual([])` afficherait « Array(3) », et une
    // garde qu'il faut relire pour comprendre finit désactivée.
    if (offenders.length > KNOWN_VENDOR_LABELS.length) {
      throw new Error(
        `Un écran hors Réglages › Intégrations écrit un nom d'outil EN DUR :\n  ${offenders.join('\n  ')}\n` +
          `Nomme la CAPACITÉ (« réseau professionnel », « registre officiel », « ton CRM »).\n` +
          `Si c'est l'outil que l'espace a BRANCHÉ, injecte son nom depuis ses connexions ` +
          `(\`connectedClientTools\`, #1912.11) au lieu de l'écrire — jamais pour un fournisseur de Bellum.\n` +
          `Si c'est le CONTENU d'une action que l'humain exécute (ouvrir un profil, rédiger un message, ` +
          `une colonne de fichier), déclare la clé dans ACTION_SURFACE_KEYS avec sa raison.`,
      )
    }
    expect(offenders).toEqual(KNOWN_VENDOR_LABELS)
  })

  it('sait dire NON — un libellé d’éditeur est refusé', () => {
    const fautif = `const name = 'HubSpot'`
    const sain = `const name = t('connectors.crm')`
    expect(VENDORS.some(v => fautif.includes(v))).toBe(true)
    expect(VENDORS.some(v => sain.includes(v))).toBe(false)
  })
})

/**
 * Les deux surfaces — la distinction sans laquelle cette garde serait fausse.
 *
 * Elle a deux façons d'être fausse, et les deux ont un test :
 *   - trop LARGE : elle interdit le canal dans le contenu d'une action, le plan
 *     d'action devient inutilisable et quelqu'un la désactive ;
 *   - trop ÉTROITE : la liste d'exemptions prend la poussière, une clé
 *     renommée n'est plus gardée par personne et la fuite revient.
 */
describe('GA-44 — la surface d’INTERFACE et la surface d’ACTION', () => {
  it('LIT quelque chose — les catalogues d’i18n sont bien aplatis', () => {
    // Un chemin faux ou un `JSON.parse` silencieux rendrait la lecture vide, et
    // les exemptions ci-dessous ne vaudraient plus rien.
    const catalogues = sourceFiles(WEB_SRC).filter(f => isLocaleCatalogue(f) && f.includes('/locales/fr/'))
    expect(catalogues.length).toBeGreaterThan(20)
    const leaves = catalogues.flatMap(f => i18nLeaves(readFileSync(f, 'utf8')))
    expect(leaves.length).toBeGreaterThan(2000)
    // …et elle voit bien les chemins de clé imbriqués, pas seulement la racine.
    expect(leaves.some(l => l.key.split('.').length >= 3)).toBe(true)
  })

  it('la surface d’ACTION est déclarée clé par clé, et chaque raison est ÉCRITE', () => {
    expect(ACTION_SURFACE_KEYS.length).toBeGreaterThan(20)
    for (const reason of Object.values(ACTION_SURFACE_REASONS)) expect(reason.length).toBeGreaterThan(120)
    for (const { why } of [...ACTION_SURFACE_KEYS, ...ACTION_SURFACE_FILES]) {
      expect(ACTION_SURFACE_REASONS[why]).toBeTruthy()
    }
  })

  it('la liste d’exemptions ne prend pas la poussière — chaque clé existe ET nomme un éditeur', () => {
    // C'est le test qui la fait RÉTRÉCIR : le jour où un libellé cesse de
    // nommer le canal, son exemption devient rouge et doit être retirée.
    expect(staleActionSurfaceKeys()).toEqual([])
    for (const { file } of ACTION_SURFACE_FILES) {
      const full = sourceFiles(WEB_SRC).find(f => f.endsWith(file))
      expect(full, `${file} — fichier exempté qui n'existe plus`).toBeTruthy()
      const raw = readFileSync(full as string, 'utf8')
      expect(
        VENDORS.some(v => displayedStrings(stripComments(raw)).includes(v)),
        `${file}`,
      ).toBe(true)
    }
  })

  it('le CONTENU d’une action garde le droit de nommer le canal', () => {
    // La garde de D4 aurait dû attraper les trois fuites ; celle-ci ne doit PAS
    // attraper le plan d'action. « Envoyer une demande de connexion LinkedIn
    // personnalisée » décrit ce que LA PERSONNE fait, pas ce que le système
    // collecte — le refus du scraping n'est pas en cause.
    expect(ACTION_SURFACE_KEY_SET.has('chat.json:pending.describeMessage.linkedin')).toBe(true)
    expect(ACTION_SURFACE_KEY_SET.has('engagement.json:preset.linkedin')).toBe(true)
    // ⚠️ L'ancre était `/features/dashboard/lib/types.ts` jusqu'au 04/09/2026
    // (#1457) : ce fichier, comme `lib/utils.ts` et `lib/actionDestination.ts`,
    // a DISPARU avec l'onglet « Équipe » de `/dashboard`. La clé
    // `dashboard.json:weeklyActivity.messagesBreakdownHelp` est partie avec
    // eux. L'ancre suit donc un fichier de code qui porte toujours une VALEUR
    // de canal — le geste, pas la provenance.
    expect(ACTION_SURFACE_FILES.some(e => e.file.endsWith('/contact-engagement/EngagementPanel.tsx'))).toBe(true)
  })

  it('sait dire NON — une PROVENANCE ne s’exempte pas, même dans un fichier qui a des clés d’action', () => {
    // Le cas réel : `contacts.json` porte « Voir sur LinkedIn » (action) ET
    // `lifecycle.sources.linkedin_apify` (provenance). Exempter le FICHIER
    // aurait laissé passer la seconde.
    expect(ACTION_SURFACE_KEY_SET.has('contacts.json:table.viewOnLinkedin')).toBe(true)
    for (const provenance of [
      'contacts.json:lifecycle.sources.linkedin_apify',
      'accountOrg.json:orgGraph.sourceKinds.linkedin',
      'accountDetail.json:coverage.confidenceComponents.identity.hint',
    ]) {
      expect(ACTION_SURFACE_KEY_SET.has(provenance), provenance).toBe(false)
    }
    // …et un libellé de provenance remis en dur est bien vu par le détecteur.
    const fautif = JSON.stringify({ lifecycle: { sources: { linkedin_apify: 'LinkedIn' } } })
    const sain = JSON.stringify({ lifecycle: { sources: { linkedin_apify: 'Réseau professionnel' } } })
    const scan = (raw: string) =>
      i18nLeaves(raw)
        .filter(l => VENDORS.some(v => l.text.includes(v)))
        .map(l => l.key)
    expect(scan(fautif)).toEqual(['lifecycle.sources.linkedin_apify'])
    expect(scan(sain)).toEqual([])
  })
})

/**
 * Le second corpus : ce que les CONTRATS écrivent et que l'écran affiche brut.
 *
 * Mesuré le 29/08/2026 : `classified-data.ts` mettait « Apollo (annuaire
 * vérifié) » et « registre public Pappers » dans les preuves du score, que la
 * fiche contact rend telles quelles. Aucune des deux gardes existantes ne
 * regardait ce paquet.
 */
describe('GA-44 — les contrats partagés n’envoient pas de nom d’éditeur à l’écran', () => {
  it('LIT quelque chose — le corpus des schémas n’est pas vide', () => {
    // Un chemin faux rendrait `readdirSync` vide et la garde verte sur du rien.
    expect(contractsFiles().length).toBeGreaterThan(30)
  })

  it('trouve bien les noms là où ils sont AUTORISÉS — preuve qu’elle sait voir', () => {
    // Si elle ne voit aucun éditeur dans les fichiers dérogés, c'est qu'elle ne
    // sait pas lire ce corpus, et son silence ailleurs ne vaudrait rien.
    const exempted = contractsFiles().filter(f => CONTRACTS_ALLOWED.some(a => f.endsWith(`/${a.file}`)))
    expect(exempted.length).toBe(CONTRACTS_ALLOWED.length)
    const hits = exempted.filter(f => {
      const haystack = displayedStrings(stripComments(readFileSync(f, 'utf8')))
      return VENDORS.some(v => haystack.includes(v))
    })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('chaque dérogation porte sa raison ÉCRITE', () => {
    // Une exception sans raison est une exception qu'on recopiera sans la
    // relire. Elles ne s'ajoutent pas en passant.
    for (const { file, why } of CONTRACTS_ALLOWED) {
      expect(why.length).toBeGreaterThan(60)
      expect(contractsFiles().some(f => f.endsWith(`/${file}`))).toBe(true)
    }
  })

  it('aucun schéma partagé n’envoie un nom d’éditeur vers un écran', () => {
    const offenders = vendorNamesInContracts()
    // Un `toEqual([])` dirait « Array(1) ». Une garde qui ne nomme pas le
    // coupable oblige à la relire pour la comprendre, et se fait désactiver.
    if (offenders.length > 0) {
      throw new Error(
        `Un contrat partagé écrit un nom d'éditeur dans un libellé que l'écran affiche :\n  ${offenders.join('\n  ')}\n` +
          `Nomme la CAPACITÉ (« annuaire professionnel vérifié », « registre public des entreprises », « ton CRM »).\n` +
          `La seule exception est Réglages › Intégrations, où l'utilisateur autorise lui-même l'accès.`,
      )
    }
  })

  it('la coupe de l’exception back-office est BORNÉE à la fonction nommée', () => {
    const raw = readFileSync(join(CONTRACTS_SCHEMAS, 'classified-data.ts'), 'utf8')
    const cut = stripBackofficeOnlyExport(raw)
    // Elle emporte la fonction…
    expect(raw).toContain(`export function ${BACKOFFICE_ONLY_EXPORT}(`)
    expect(cut).not.toContain(`export function ${BACKOFFICE_ONLY_EXPORT}(`)
    // …et à peu près rien d'autre : moins de 3 % du fichier.
    expect(raw.length - cut.length).toBeLessThan(raw.length * 0.03)
    // Le reste du fichier est toujours lu — la coupe n'a pas avalé les preuves.
    expect(cut).toContain('annuaire professionnel vérifié')
  })

  it('l’exception back-office reste bornée — aucun écran client ne l’importe', () => {
    // `computeContactPriorityReason` a le droit de nommer le fournisseur PARCE
    // QUE seul le back-office opérateur l'affiche. Le jour où `apps/web`
    // l'importe, ce test passe au rouge et l'arbitrage se rejoue.
    expect(webImportersOfBackofficeExport()).toEqual([])
  })

  it('sait dire NON — un nom d’éditeur remis dans un contrat est refusé', () => {
    const fautif = `const _SOURCE_LABEL_FR = { apollo: 'Apollo (annuaire vérifié)' }`
    const sain = `const _SOURCE_LABEL_FR = { apollo: 'annuaire professionnel vérifié' }`
    const scan = (src: string) => VENDORS.filter(v => displayedStrings(stripComments(src)).includes(v))
    expect(scan(fautif)).toEqual(['Apollo'])
    expect(scan(sain)).toEqual([])
    // …et un fichier neuf n'est PAS dérogé par défaut.
    expect(CONTRACTS_ALLOWED.some(a => a.file === 'un-nouveau-schema.ts')).toBe(false)
  })

  it('la liste des noms vit dans le CONTRAT, et cette garde la lit sans la recopier', () => {
    // #1912.11 — un seul endroit. Une copie locale divergerait en silence, et
    // c'est exactement ce qui avait laissé « LinkedIn » hors de cette liste.
    const self = readFileSync(join(__dirname, 'no-vendor-names-in-app.test.ts'), 'utf8')
    expect(self).not.toMatch(/const VENDORS = \[\s*'/)
    expect(VENDORS).toEqual(
      expect.arrayContaining(['HubSpot', 'Gmail', 'LinkedIn', 'Apollo', 'Brave Search', 'OpenAI']),
    )
    expect(VENDORS.length).toBeGreaterThan(40)
  })

  it('la surface d’action des contrats s’exempte par LITTÉRAL, et la liste ne prend pas la poussière', () => {
    expect(staleContractsActionSurface()).toEqual([])
    for (const { why } of CONTRACTS_ACTION_SURFACE) expect(ACTION_SURFACE_REASONS[why]).toBeTruthy()
    // Le littéral exempté ne couvre QUE lui : un autre littéral du même fichier
    // reste gardé. C'est la différence avec une exemption par nom de fichier.
    const scan = (src: string) => displayedParts(stripComments(src)).filter(p => VENDORS.some(v => p.includes(v)))
    const fichier = `const a = 'LinkedIn'\nconst b = 'source : LinkedIn'`
    expect(scan(fichier)).toEqual(['LinkedIn', 'source : LinkedIn'])
    const exempte = CONTRACTS_ACTION_SURFACE.filter(a => a.file === 'dashboard.ts').map(a => a.literal)
    expect(scan(fichier).filter(p => !exempte.includes(p))).toEqual(['source : LinkedIn'])
  })
})

/**
 * #1912.11 — décision Louis 13/09/2026, batch 11 : l'outil BRANCHÉ se nomme par
 * INJECTION, jamais par un littéral.
 *
 * Les trois preuves, sur la nouvelle moitié de la règle :
 *   - elle LIT : les deux appelants réels (la barre de saisie de Laura, la carte
 *     de brouillon) existent et passent par la dérivation du contrat ;
 *   - elle dit NON : un nom d'outil client écrit en dur est vu, et un fournisseur
 *     de Bellum ne sort pas de la dérivation même « connecté » ;
 *   - elle laisse passer le voisin légitime : le nom injecté (`{tool.name}`,
 *     `{ mailbox }`) n'est pas un littéral, et l'écran qui le rend reste vert.
 */
/**
 * #1912 — « Non appliqué par pappers » : un nom de NOTRE fournisseur, en
 * minuscules, a traversé cette garde. Trois preuves pour la moitié neuve.
 */
describe('#1912 — nos fournisseurs se cherchent sans la casse, dans le texte', () => {
  it('LIT — la prose des écrans et des catalogues n’est pas vide', () => {
    const prose = sourceFiles(WEB_SRC)
      .filter(f => /\.tsx?$/.test(f))
      .flatMap(f => proseParts(stripComments(readFileSync(f, 'utf8'))))
    expect(prose.length).toBeGreaterThan(1000)
  })

  it('sait dire NON — « pappers » en minuscules dans un texte affiché ou un catalogue', () => {
    const fautif = `const note = t('x', { defaultValue: 'Non appliqué par pappers — résultats plus larges' })`
    expect(proseParts(fautif).flatMap(part => supplierNamesIn(part))).toEqual(['Pappers'])
    const catalogue = JSON.stringify({ registry: { unapplied: 'Non appliqué par pappers' } })
    expect(i18nLeaves(catalogue).flatMap(leaf => supplierNamesIn(leaf.text))).toEqual(['Pappers'])
  })

  it('n’attrape pas les voisins — identifiant machine, URL, registre public, mots ordinaires', () => {
    const source = [
      `const a = 'pappers'`,
      `const b = 'apollo.linkedin'`,
      `const c = 'https://www.pappers.fr/entreprise/1'`,
      `const d = 'France Travail et la bravoure d’un brave commercial'`,
    ].join('\n')
    expect(proseParts(source).flatMap(part => supplierNamesIn(part))).toEqual([])
  })
})

describe('#1912.11 — l’outil branché se nomme par INJECTION, jamais par un littéral', () => {
  const STRIP = '/features/chat/view/ToolsSourcesMenu.tsx'
  const HOOK = '/features/chat/hooks/useConnectedCapabilities.ts'
  const CARD = '/features/chat/view/PendingActions.tsx'
  const fileEndingWith = (suffix: string): string => {
    const found = sourceFiles(WEB_SRC).find(f => f.endsWith(suffix))
    if (!found) throw new Error(`${suffix} — appelant réel introuvable : la garde ne lirait plus rien`)
    return found
  }
  const scan = (source: string) => VENDORS.filter(v => displayedStrings(stripComments(source)).includes(v))

  it('LIT quelque chose — les appelants réels existent et lisent la dérivation du contrat', () => {
    expect(readFileSync(fileEndingWith(HOOK), 'utf8')).toContain('connectedClientTools(')
    expect(readFileSync(fileEndingWith(STRIP), 'utf8')).toContain('{tool.name}')
    expect(readFileSync(fileEndingWith(CARD), 'utf8')).toContain('mailboxToolName(')
  })

  it('laisse passer le nom INJECTÉ — l’écran qui rend les outils branchés reste vert', () => {
    expect(scan(readFileSync(fileEndingWith(STRIP), 'utf8'))).toEqual([])
    expect(scan(readFileSync(fileEndingWith(CARD), 'utf8'))).toEqual([])
    expect(scan(`<li key={tool.provider}>{tool.name}</li>`)).toEqual([])
    expect(scan(`t('pending.mailDraftSaved', { mailbox: mailboxToolName(draft.provider) })`)).toEqual([])
  })

  it('sait dire NON — un nom d’outil client écrit EN DUR serait promis à qui ne l’a pas branché', () => {
    expect(scan(`<span>Brouillon déposé dans Gmail</span>`)).toEqual(['Gmail'])
    expect(scan(`const label = 'Brouillon déposé dans Outlook'`)).toEqual(['Outlook'])
    // ⚠️ Limite CONNUE, antérieure à ce lot et écrite dans `displayedParts` : un
    // texte JSX d'UN seul mot (`<li>Gmail</li>`) ressemble à un générique
    // TypeScript et n'est pas lu. Ce témoin l'épingle pour qu'elle ne se
    // découvre pas en recette.
    expect(scan(`<li>Gmail</li>`)).toEqual([])
  })

  it('sait dire NON — NOTRE fournisseur ne sort pas de la dérivation, même « connecté »', () => {
    const registry = OUR_SUPPLIERS.flatMap(s =>
      s.provider ? [{ provider: s.provider, family: 'prospection', status: 'connected' }] : [],
    ) as unknown as ConnectedTool[]
    expect(registry.length).toBeGreaterThan(8)
    expect(connectedClientTools(registry)).toEqual([])
    // …et le voisin légitime, lui, en sort bien.
    expect(
      connectedClientTools([{ provider: 'gmail', family: 'email', status: 'connected' }] as unknown as ConnectedTool[]),
    ).toEqual([{ provider: 'gmail', family: 'email', name: 'Gmail', capabilities: [] }])
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * #1912.11 — LE JUMEAU RATÉ : l'identifiant de SOURCE interpolé dans un écran.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Mesuré EN PRODUCTION le 14/09/2026, sur `/discover` : les **24 cartes** de
 * résultat écrivaient « Sources : pappers ».
 *
 * Le lot #1912.11 avait corrigé le libellé JUMEAU (« Non appliqué par pappers »,
 * `FilterRail`) et raté celui-là. Et cette garde est restée VERTE pendant ce
 * temps, pour une raison qui tient à sa forme : **elle ne lit que des LITTÉRAUX**
 * (`displayedParts`). `{candidate.sources.map(s => s.name)}` n'en est pas un —
 * le nom n'est écrit nulle part dans le dépôt, il arrive dans la DONNÉE. Le bloc
 * ci-dessus l'assume même explicitement pour son voisin LÉGITIME : `{tool.name}`,
 * l'outil que l'espace a BRANCHÉ, se nomme par injection et ne doit pas être vu.
 * Cette exemption, taillée pour le jumeau licite, laissait passer TOUS les `.name`
 * interpolés — dont l'illicite.
 *
 * Ce bloc distingue les deux, et la distinction n'est pas « quel objet » (une
 * garde textuelle ne connaît pas les types) mais **quel CHAMP est lu** :
 *
 *   • `{tool.name}` — le nom d'un outil du CLIENT, dérivé de ses connexions.
 *     Aucune lecture d'un champ de source. VERT, et un témoin le prouve.
 *   • `{source.name}`, `{signal.source}`, `{candidate.sources.map(s => s.name)}`
 *     — la lecture d'un champ de SOURCE de données. ROUGE, sauf à passer par une
 *     porte : `dataSourceLabel` / `dataSourceLabels` (un identifiant),
 *     `signalSourceLabel` (le texte libre d'un signal), `contactSourceLabel`.
 *
 * ⚠️ CE QU'ELLE NE VOIT PAS, et qui a donc été corrigé À LA MAIN dans ce lot :
 *   - une valeur rangée dans une CONSTANTE avant d'être rendue
 *     (`const source = readableSource(item.signalSource)` puis `{source}`) : la
 *     garde ne suit pas les liaisons. `WatchlistTable.tsx` en portait deux.
 *   - un fichier NON-JSX qui écrit pour un client : `discover-export.ts` mettait
 *     le même identifiant dans une cellule du CSV. C'est `discover-export.test.ts`
 *     qui le tient, en lisant la cellule rendue.
 */

/** Les attributs JSX dont la valeur est du TEXTE que l'utilisateur LIT.
 *  `key`, `value`, `href`, `id` n'en sont pas : ils ne peignent rien. */
const DISPLAY_ATTRIBUTES = new Set(['name', 'label', 'title', 'detail', 'text', 'children', 'placeholder'])

/** La lecture d'un champ de SOURCE de données — le seul motif que ce bloc vise. */
const SOURCE_FIELD_ACCESS = /\.\s*sources?\b|\bsources?\s*\.\s*name\b|\bsignalSource\b/

/** Les portes par lesquelles un champ de source devient un texte affichable. */
const SOURCE_LABEL_DOORS = /dataSourceLabel|signalSourceLabel|contactSourceLabel/

type DisplayedExpression = { file: string; attribute: string | null; expression: string }

/**
 * Les expressions JSX qui PEIGNENT du texte : un enfant `{…}`, ou la valeur d'un
 * attribut d'affichage. Volontairement conservateur — une expression qui porte un
 * `<`, un `>` (hors flèche) ou une accolade imbriquée est ignorée plutôt que mal
 * découpée : mieux vaut une garde qui rate un cas qu'une garde qui accuse du code
 * juste. C'est l'erreur de l'extracteur coupé à la flèche de `onClick={() => …}`.
 */
function displayedExpressions(file: string, source: string): DisplayedExpression[] {
  // La flèche porte un `>` qui n'a jamais fermé de balise.
  const body = stripComments(source).replace(/=>/g, '= ')
  const out: DisplayedExpression[] = []
  for (const m of body.matchAll(/\{([^{}<>\n]{1,300})\}/g)) {
    const expression = (m[1] ?? '').trim()
    // `{ clé: valeur }` est un OBJET LITTÉRAL : ni un enfant JSX (ce serait une
    // erreur de syntaxe), ni la valeur d'un attribut (elle s'écrirait `{{ … }}`).
    // Derrière le `?` d'un ternaire, rien d'autre ne l'écartait — intégration R,
    // `TabProofs.tsx` recopiait la proposition de Laura dans le corps d'une requête.
    if (/^(?:[A-Za-z_$][\w$]*|'[^'\n]*'|"[^"\n]*")\s*:(?!:)/.test(expression)) continue
    const before = body.slice(0, m.index).replace(/\s+$/, '')
    const attribute = /([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before)?.[1] ?? null
    if (attribute !== null) {
      if (!DISPLAY_ATTRIBUTES.has(attribute)) continue
    } else {
      // Un enfant JSX suit du texte ou une balise fermée. Ce qui suit `(`, `,`,
      // `=`, `[`, `;` ou un identifiant est un objet, un type ou un argument —
      // c'est ce qui écartait 89 destructurations et annotations sur 94.
      const prev = before.at(-1) ?? ''
      if ('(,=[;'.includes(prev) || /[\w$]/.test(prev)) continue
      if (before.lastIndexOf('>') < before.lastIndexOf('<')) continue
    }
    out.push({ file, attribute, expression })
  }
  return out
}

/** Le code de l'expression, littéraux retirés : `t('card.sourcesTitle')` ne lit aucune source. */
function withoutStringLiterals(expression: string): string {
  return expression.replace(/'[^'\\\n]*'|"[^"\\\n]*"|`[^`\\]*`/g, '')
}

function rendersARawSource(entry: DisplayedExpression): boolean {
  const code = withoutStringLiterals(entry.expression)
  return SOURCE_FIELD_ACCESS.test(code) && !SOURCE_LABEL_DOORS.test(code)
}

/**
 * Les rendus bruts LÉGITIMES, un par un, avec leur raison.
 *
 * ⚠️ Cette liste ne peut que RÉTRÉCIR, et un test vérifie qu'elle ne prend pas la
 * poussière. Y ajouter une entrée demande de répondre d'abord à « pourquoi CE
 * champ de source s'affiche-t-il sans passer par la capacité ? ».
 */
const RAW_SOURCE_ALLOWED: ReadonlyArray<{ file: string; expression: string; why: string }> = [
  {
    file: '/features/accounts/view/account-detail/tabs/TabMissions.tsx',
    expression: 'data.source.label',
    why: "Surface d'ACTION : le lien sort vers l'outil que l'espace a lui-même branché (son ATS/ERP), et son libellé arrive du serveur avec l'URL. Un lien qui promet « ta source » et atterrit ailleurs ment sur sa destination — c'est la raison openTheProfile, et l'axe D354.",
  },
]

describe('#1912.11 — un identifiant de SOURCE ne s’interpole jamais brut dans un écran', () => {
  const screens = sourceFiles(WEB_SRC).filter(file => file.endsWith('.tsx'))
  const displayed = screens.flatMap(file => displayedExpressions(file, readFileSync(file, 'utf8')))
  const raw = displayed.filter(rendersARawSource)
  const isNamed = (entry: DisplayedExpression): boolean =>
    RAW_SOURCE_ALLOWED.some(a => entry.file.endsWith(a.file) && entry.expression === a.expression)

  it('LIT quelque chose — les écrans et leurs interpolations affichées ne sont pas vides', () => {
    expect(screens.length).toBeGreaterThan(400)
    expect(displayed.length).toBeGreaterThan(1000)
    // …et le corpus contient bien le motif LICITE dont ce bloc doit distinguer le fautif.
    expect(displayed.some(entry => entry.expression === 'tool.name')).toBe(true)
  })

  it('aucun écran ne rend un champ de source sans passer par la capacité', () => {
    expect(raw.filter(entry => !isNamed(entry)).map(entry => `${entry.file} — {${entry.expression}}`)).toEqual([])
  })

  it('sait dire NON — les trois formes trouvées en production le 14/09/2026', () => {
    const found = (code: string): string[] =>
      displayedExpressions('x.tsx', code)
        .filter(rendersARawSource)
        .map(entry => entry.expression)
    expect(found(`<p>{t('card.sourcesTitle')} : {candidate.sources.map(s => s.name).join(', ')}</p>`)).toEqual([
      "candidate.sources.map(s =  s.name).join(', ')",
    ])
    expect(found(`<SourceRow name={source.name} date={source.date} />`)).toEqual(['source.name'])
    expect(found(`<Text size="xs">{signal.source}</Text>`)).toEqual(['signal.source'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — l’outil BRANCHÉ, un registre public, une clé React', () => {
    const found = (code: string): string[] =>
      displayedExpressions('x.tsx', code)
        .filter(rendersARawSource)
        .map(entry => entry.expression)
    // Le voisin licite de #1912.11 : le nom injecté depuis les connexions de l'espace.
    expect(found(`<li key={tool.provider}>{tool.name}</li>`)).toEqual([])
    expect(found(`<p>{t('pending.mailDraftSaved', { mailbox: mailboxToolName(draft.provider) })}</p>`)).toEqual([])
    // Un registre PUBLIC se nomme — le nom EST la garantie (D354).
    expect(found(`<span>{t('common:dataSources.franceTravail')}</span>`)).toEqual([])
    expect(found(`<Badge>{dataSourceLabel(t, 'boamp')}</Badge>`)).toEqual([])
    // Les portes, sur les trois formes fautives ci-dessus.
    expect(found(`<p>{dataSourceLabels(t, candidate.sources.map(s => s.name)).join(', ')}</p>`)).toEqual([])
    expect(found(`<SourceRow name={signalSourceLabel(t, source.name)} />`)).toEqual([])
    expect(found(`<Text>{signalSourceLabel(t, signal.source)}</Text>`)).toEqual([])
    // Une clé React ne peint rien.
    expect(found(`<SourceRow key={source.name} />`)).toEqual([])
    // Un OBJET LITTÉRAL ne peint rien non plus, même derrière un `?` de ternaire
    // (intégration R, `TabProofs.tsx` : la proposition de Laura recopiée dans le
    // corps d'une requête). `{ clé: valeur }` n'est jamais un enfant JSX valide.
    expect(found(`const body = { ...(proposal?.source ? { source: proposal.source } : {}) }`)).toEqual([])
    expect(found(`const next = ok ? { sources: item.sources } : fallback`)).toEqual([])
  })

  it('la liste d’exceptions ne prend pas la poussière — chaque entrée existe encore', () => {
    expect(RAW_SOURCE_ALLOWED.length).toBeGreaterThan(0)
    for (const entry of RAW_SOURCE_ALLOWED) {
      const found = raw.find(r => r.file.endsWith(entry.file) && r.expression === entry.expression)
      expect(found, `${entry.file} — exception qui ne correspond plus à rien`).toBeTruthy()
      expect(entry.why.length).toBeGreaterThan(60)
    }
  })
})
