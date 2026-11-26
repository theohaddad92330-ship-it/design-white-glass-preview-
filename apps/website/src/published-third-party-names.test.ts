import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CLIENT_TOOLS as CONTRACT_CLIENT_TOOLS, OUR_SUPPLIERS as CONTRACT_SUPPLIERS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { PUBLIC_FEATURES } from './features/chatbot/lib/feature-status'

/**
 * GA-124 / GA-125 — ce que le SITE PUBLIC a le droit de nommer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ARBITRAGE — D354, 30/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine dit : « **Jamais de nom d'éditeur côté app** — on nomme la
 * CAPACITÉ (« votre CRM », « votre messagerie »). Seule exception : Réglages ›
 * Intégrations. » Elle est tenue côté app par GA-44
 * (`apps/web/src/architecture/no-vendor-names-in-app.test.ts`),
 * `test_copilote_prompt_blocks.py` et `tool-capability-digest.spec.ts` —
 * **aucune des trois ne regarde `apps/website/`**.
 *
 * La question n'est pas « comment étendre la garde au site », c'est « la règle
 * s'y applique-t-elle ? ». Elle repose sur deux raisons, et elles ne portent pas
 * pareil sur une page de vente :
 *
 *   1. **Ne pas promettre une intégration qu'on n'a pas.** Cette raison vaut
 *      sur le site PLUS que dans l'app : dans l'app, un bouton qui ne marche pas
 *      se découvre en trois secondes ; sur une page de vente, il se découvre
 *      après la signature.
 *   2. **Ne pas dépendre d'un éditeur dans le vocabulaire du produit.** Celle-ci
 *      ne se transporte PAS. « Votre CRM » est juste dans une interface, où
 *      l'utilisateur a déjà branché le sien. Sur une page de vente, la première
 *      question du prospect est « est-ce que ça marche avec le MIEN ? », et
 *      « votre CRM » ne lui répond pas — c'est même une non-réponse suspecte.
 *
 * D'où l'arbitrage, et il ne porte pas sur « éditeur vs registre » mais sur un
 * axe plus net, **à qui appartient l'outil nommé** :
 *
 *   • **L'outil du CLIENT** — son CRM, sa messagerie, son canal d'équipe, son
 *     assistant IA. **Se nomme sur le site**, à deux conditions : le connecteur
 *     EXISTE, et son ÉTAT RÉEL est publié avec lui (« disponible » /
 *     « sur activation »). C'est GA-124.
 *
 *   • **NOTRE fournisseur** — Apollo, Pappers, Firecrawl, Brave, Serper, Tavily,
 *     Dropcontact… **Ne se nomme nulle part**, ni dans l'app ni sur le site.
 *     Trois raisons, dont la troisième est la plus dure : il est REMPLAÇABLE (le
 *     nommer nous y attache) ; son nom ne répond à aucune question du visiteur ;
 *     et le ranger parmi les « sources officielles » est **faux** — Apollo est un
 *     annuaire commercial, Pappers un rééditeur privé du registre. Le contrôle
 *     qualité du deck le nomme d'ailleurs mot pour mot (« les fournisseurs
 *     backend »), et le site l'applique DÉJÀ à la bouche de Laura
 *     (`guardrails.ts`, `INTERNAL_HOSTS`) — jamais à ses propres pages. C'est
 *     GA-125.
 *
 *   • **Un registre public ou une autorité** — INSEE, INPI, BODACC, France
 *     Travail, BOAMP, DECP. **Se nomme**, et c'est la nuance que la doctrine
 *     n'avait jamais écrite : ce n'est pas une intégration, c'est une
 *     PROVENANCE. Le nom EST la garantie — « nos chiffres viennent du registre
 *     officiel » ne dit pas la même chose que « d'un registre » — et on n'en
 *     change pas comme on change de fournisseur. Condition : on l'interroge
 *     vraiment. GA-125 exige le collecteur sur le disque.
 *
 * **Ce que l'arbitrage ne change PAS** : la règle côté app, mot pour mot, avec
 * son exception unique. Un nom autorisé ici ne l'est pas là-bas, et le dernier
 * test de ce fichier le vérifie en relisant GA-44.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA QUATRIÈME CATÉGORIE — CE QUE LA LOI OBLIGE À NOMMER
 * ─────────────────────────────────────────────────────────────────────────────
 * Les mentions légales nomment l'hébergeur (LCEN art. 6-III), la page cookies
 * nomme chaque traceur déposé (art. 82 LIL), la politique de confidentialité
 * nomme les sous-traitants et l'autorité de contrôle. Ces quatre pages sont
 * exemptées par leur CHEMIN, avec leur base légale écrite — pas par un mot-clé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES DEUX GARDES NE SONT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles n'interdisent aucun nom propre. Une garde qui rougirait sur « France
 * Travail », sur « CNIL », sur « Paris » ou sur le nom d'un membre de l'équipe
 * protégerait une liste de mots, pas une règle. Elles partent d'un CATALOGUE de
 * tiers connus, rangé en trois familles, et posent une question différente à
 * chacune. Un nom hors catalogue n'est pas vu — limite assumée, la même que
 * celle de GA-44, et la raison pour laquelle le catalogue se complète quand une
 * recette trouve une fuite.
 *
 * Elles ne lisent que ce qui est PUBLIÉ. Un commentaire de code qui cite
 * « Stripe » pour expliquer pourquoi on ne met pas de prix dans le JSON-LD
 * (`src/app/[locale]/page.tsx`) n'est pas une publication ; une garde qui ne
 * fait pas cette différence accuse le mauvais fichier. Les commentaires et les
 * chemins d'import sont retirés avant toute recherche, et un test le prouve.
 */

const WEBSITE_SRC = __dirname
const MESSAGES = join(__dirname, '..', 'messages')
const REPO = join(__dirname, '..', '..', '..')

/** Les quatre langues du site. La parité est gardée par `check:i18n` ; ici on
 *  s'en sert pour vérifier qu'une correction n'a pas été faite dans une seule. */
const LOCALES = ['de', 'en', 'fr', 'nl'] as const

/* ─────────────────────────────────────────────────────────────────────────────
 * LE CATALOGUE — trois familles, trois questions différentes.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * L'outil du CLIENT. Nommable sur le site s'il est DÉCLARÉ plus bas.
 *
 * ⚠️ On n'y met que des noms non ambigus hors contexte. « Teams » seul veut dire
 * « équipes » en anglais et en allemand (`"Größe Ihres Teams"`, `"Teams op één
 * lijn brengen"`) : c'est « Microsoft Teams » qui est gardé, et le site a été
 * réécrit pour l'écrire sous cette forme. « Google » et « Microsoft » seuls sont
 * hors catalogue pour la même raison — trop de phrases ordinaires les portent.
 *
 * « Claude » y est malgré son homonymie avec un prénom : le nom est publié comme
 * une intégration (les pastilles « Assistants IA »), donc il doit être DÉCLARÉ.
 * L'ambiguïté se traite par une déclaration, pas par un trou dans le catalogue.
 */
const CLIENT_TOOLS = [
  'HubSpot',
  'Salesforce',
  'Pipedrive',
  'Attio',
  'Microsoft Teams',
  'Google Chat',
  'Slack',
  'Mattermost',
  'Discord',
  'BoondManager',
  'Aircall',
  'Ringover',
  'Notion',
  'LinkedIn',
  'Claude',
  'Cursor',
  'Excel',
] as const

/**
 * NOTRE fournisseur. Interdit partout sur le site, comme dans l'app.
 *
 * ⚠️ La liste ne vit plus ici. Depuis #1912.11 (décision Louis 13/09/2026,
 * batch 11), elle vit à UN seul endroit — `@bellum/contracts`
 * (`schemas/tool-naming.ts`) — que l'app, l'API et le prompt de Laura lisent
 * aussi. Elle y ne peut que GRANDIR : un fournisseur qu'on ajoute au produit
 * s'ajoute là-bas le même jour, et cette garde le voit sans qu'on la touche.
 *
 * Ce site n'en lit que les fournisseurs de DONNÉES (enrichissement, collecte) :
 * c'est le périmètre sur lequel GA-125 a été mesurée. Les modèles et
 * l'hébergement se nomment sur les pages que la loi y oblige (sous-traitants,
 * hébergeur — exemptées par leur chemin, plus bas) ; les étendre au reste du
 * site est une mesure à faire, pas une ligne à ajouter.
 */
const OUR_SUPPLIERS: readonly string[] = CONTRACT_SUPPLIERS.filter(
  supplier => supplier.kind === 'enrichment' || supplier.kind === 'collection',
).map(supplier => supplier.name)

/**
 * Le registre public ou l'autorité. Nommable — mais on doit l'interroger.
 *
 * `collector` est le module qui l'appelle. GA-125 vérifie qu'il existe sur le
 * disque : c'est la mécanique de GA-38, et c'est ce qui empêche cette liste de
 * devenir une brochure. Le chemin est relatif à la racine du dépôt.
 */
const PUBLIC_REGISTRIES: ReadonlyArray<{ name: string; collector: string; why: string }> = [
  {
    name: 'INSEE',
    collector: 'apps/ia/app/services/insee_sirene.py',
    why: "L'API Sirene de l'INSEE — NAF des entités et établissements réels. Appelée depuis `phase1_research.py`, derrière `INSEE_API_KEY`.",
  },
  {
    name: 'INPI',
    collector: 'apps/ia/app/services/data_sources/inpi_rne.py',
    why: 'Le Registre national des entreprises — bénéficiaires effectifs. Appelé depuis `phase1_research.py`.',
  },
  {
    name: 'BODACC',
    collector: 'apps/ia/app/services/data_sources/bodacc.py',
    why: 'Le Bulletin officiel des annonces civiles et commerciales — événements légaux datés. Appelé depuis `phase1_research.py` et `data_gateway.py`.',
  },
  {
    name: 'France Travail',
    collector: 'apps/ia/app/services/data_sources/france_travail.py',
    why: "Les offres d'emploi IT publiées par l'opérateur public — signal de projet daté. Appelé depuis `phase1_research.py`, `data_gateway.py` et `territory_overview.py`.",
  },
  {
    name: 'BOAMP',
    collector: 'apps/ia/app/services/data_sources/public_tenders.py',
    why: 'Le Bulletin officiel des annonces de marchés publics — les consultations en cours. Appelé depuis `phase1_research.py` et `data_gateway.py`.',
  },
  {
    name: 'DECP',
    collector: 'apps/ia/app/services/data_sources/decp.py',
    why: 'Les Données essentielles de la commande publique — les marchés ATTRIBUÉS, donc le concurrent en place. Appelé depuis `phase1_research.py` et `territory_overview.py`.',
  },
]

/* ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST PUBLIÉ — l'extraction, et ce qu'elle refuse de compter.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Les pages que la LOI oblige à nommer un tiers.
 *
 * Exemptées par leur chemin, avec leur base légale. Cette liste ne peut que
 * rétrécir : y ajouter une page demande de citer le texte qui l'impose.
 */
const LEGAL_PAGES: ReadonlyArray<{ path: string; why: string }> = [
  {
    path: 'app/[locale]/legal/page.tsx',
    why: "Mentions légales — LCEN art. 6-III : l'hébergeur se nomme, avec son adresse et son téléphone. Le taire est l'infraction.",
  },
  {
    path: 'app/[locale]/cookies/page.tsx',
    why: "Politique cookies — art. 82 de la loi Informatique et Libertés : chaque traceur déposé se nomme, et ceux qu'on n'utilise PAS se nomment aussi pour que le visiteur sache ce qu'il ne trouvera pas.",
  },
  {
    path: 'app/[locale]/privacy/page.tsx',
    why: "Politique de confidentialité — RGPD art. 13-1-e et 77 : les destinataires des données et l'autorité de contrôle se nomment.",
  },
  {
    path: 'app/[locale]/dpa/page.tsx',
    why: 'Accord de sous-traitance — RGPD art. 28-2 : les sous-traitants ultérieurs se nomment ou se tiennent à disposition.',
  },
]

function siteFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...siteFiles(full))
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

/**
 * Ce qui peut atteindre l'écran d'un visiteur : les littéraux et le texte JSX.
 *
 * Repris de GA-44, qui l'a déjà éprouvé sur `apps/web` : un identifiant
 * (`PlausibleScript`, `linkedinAria`) n'est pas affiché, et un chemin d'import
 * porte le nom d'un composant sans rien publier.
 */
function displayedParts(source: string): string[] {
  const body = source.replace(/^\s*(import|export)\s[^\n]*$/gm, '')
  const parts: string[] = []
  for (const m of body.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g)) {
    parts.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  // Texte nu entre balises JSX. On écarte ce qui n'a aucune espace ET ressemble
  // à un identifiant : un générique TypeScript `<Foo | null>` finit par `>`.
  for (const m of body.matchAll(/>([^<>{}\n]{2,})</g)) {
    const text = (m[1] ?? '').trim()
    if (!text.includes(' ') && /^[A-Za-z][A-Za-z0-9_$.|\s]*$/.test(text)) continue
    parts.push(text)
  }
  return parts
}

type Published = { where: string; text: string; locale: string | null }

function isLegalPage(file: string): boolean {
  return LEGAL_PAGES.some(p => file.endsWith(join('src', p.path)) || file.includes(p.path))
}

/** Le texte publié par le CODE du site — hors pages légales, hors ce fichier. */
function publishedFromCode(): Published[] {
  const out: Published[] = []
  for (const file of siteFiles(WEBSITE_SRC)) {
    if (isLegalPage(file)) continue
    if (file.endsWith('published-third-party-names.test.ts')) continue
    const short = file.slice(REPO.length + 1)
    for (const text of displayedParts(stripComments(readFileSync(file, 'utf8')))) {
      if (text.trim()) out.push({ where: short, text, locale: null })
    }
  }
  return out
}

/** Les feuilles des catalogues i18n, avec leur chemin de clé. */
function i18nLeaves(raw: string): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = []
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      out.push({ key: path, text: node })
      return
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k)
    }
  }
  walk(JSON.parse(raw), '')
  return out
}

function messageFiles(): string[] {
  const out: string[] = []
  for (const locale of readdirSync(MESSAGES)) {
    for (const file of readdirSync(join(MESSAGES, locale))) {
      if (file.endsWith('.json')) out.push(join(MESSAGES, locale, file))
    }
  }
  return out.sort()
}

/**
 * Le texte publié par les CATALOGUES i18n, les quatre langues confondues.
 *
 * `where` est volontairement SANS la langue (`home.json:faq.items[5].a`) : une
 * exemption se raisonne sur la clé, qui dit ce que la phrase FAIT, et jamais sur
 * une langue — sinon on exempterait le français et garderait le néerlandais.
 * La langue voyage à part, pour le test de parité.
 */
function publishedFromMessages(): Published[] {
  const out: Published[] = []
  for (const file of messageFiles()) {
    const short = file.slice(MESSAGES.length + 1)
    const [locale, namespace] = short.split(/[/\\]/)
    for (const leaf of i18nLeaves(readFileSync(file, 'utf8'))) {
      out.push({ where: `${namespace}:${leaf.key}`, text: leaf.text, locale: locale ?? null })
    }
  }
  return out
}

function allPublished(): Published[] {
  return [...publishedFromMessages(), ...publishedFromCode()]
}

/**
 * Le nom est-il DANS ce texte, en tant que nom ?
 *
 * Une inclusion nue attraperait « Railway infrastructure » (la traduction
 * anglaise de « infrastructures ferroviaires ») pour le PaaS Railway, et
 * « geregistreerde » pour un registre. On borne donc aux limites de mot.
 */
function mentions(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u').test(text)
}

function hits(names: readonly string[], corpus: Published[] = allPublished()): Array<Published & { name: string }> {
  const out: Array<Published & { name: string }> = []
  for (const entry of corpus) {
    for (const name of names) if (mentions(entry.text, name)) out.push({ ...entry, name })
  }
  return out
}

/* ─────────────────────────────────────────────────────────────────────────────
 * GA-124 — un outil du client nommé sur le site est un outil qu'on BRANCHE.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Les cinq raisons pour lesquelles le nom d'un outil du client apparaît.
 *
 * Une seule est une PROMESSE. Les quatre autres décrivent la situation du
 * visiteur, pas notre offre — et c'est précisément la distinction qui manquait :
 * une garde qui les confondrait rougirait sur « Vous avez un CRM ou c'est
 * Excel ? », c'est-à-dire sur une question qu'on pose, pas sur une chose qu'on
 * vend.
 */
const MENTION_REASONS = {
  integration:
    "PROMESSE. On annonce qu'on s'y branche. Elle n'est publiable que si le connecteur existe avec un appelant, et elle est publiée avec son ÉTAT RÉEL — la table `PUBLIC_FEATURES` de Laura, pour que la page et le chatbot ne disent pas deux choses au même visiteur.",
  visitor_words:
    "LA PAROLE DU VISITEUR. Le nom est dans une question qu'on lui pose sur SA pile, dans une objection qu'il soulève, ou dans l'exemple d'un champ de formulaire qu'il remplit. On ne promet rien : on lui demande ce qu'il utilise, et lui répondre « votre CRM » serait absurde puisque c'est justement ce qu'on cherche à savoir.",
  action_channel:
    "LE CANAL D'UN GESTE HUMAIN. La maquette montre le plan d'action, et « Contacter la DSI via LinkedIn » décrit ce que LA PERSONNE fera elle-même. C'est la surface d'ACTION que GA-44 distingue déjà côté app : le canal se nomme, parce que « via votre réseau professionnel » est moins actionnable.",
  denial:
    "CE QU'ON NE FAIT PAS. Le nom est cité pour être NIÉ — « nous n'automatisons aucune action sur LinkedIn », « aucun traceur de réseau social ». Retirer le nom retirerait l'engagement : on ne peut pas promettre de ne pas faire une chose sans la nommer.",
  our_presence:
    "NOTRE PROPRE PRÉSENCE. Le lien vers la page de l'entreprise sur ce réseau, dans le pied de page. Ce n'est ni une intégration ni une source : c'est notre adresse, et la masquer ne protégerait personne.",
} as const

type MentionReason = keyof typeof MENTION_REASONS

/**
 * Les intégrations que le site a le droit d'ANNONCER.
 *
 * `feature` est la clé de `PUBLIC_FEATURES` — la table qui porte déjà l'état
 * public de chaque capacité et que Laura récite. La faire porter aussi aux pages
 * applique la loi 1 du tome 7 : un réglage vit à UN seul endroit. Sans ce lien,
 * la page pouvait écrire « Oui : export vers HubSpot et Salesforce » pendant que
 * Laura répondait « disponible sur activation » — mesuré le 30/08/2026, au même
 * visiteur, dans la même visite.
 *
 * `proof` est le chemin qui porte la capacité. GA-124 vérifie qu'il existe sur
 * le disque : c'est la mécanique de GA-38, et c'est ce qui empêche cette liste
 * de devenir une brochure.
 */
const PUBLISHED_INTEGRATIONS: ReadonlyArray<{ name: string; feature: string; proof: string; why: string }> = [
  {
    name: 'HubSpot',
    feature: 'crm_sync',
    proof: 'apps/api/src/modules/crm/hubspot.client.ts',
    why: 'Client REST réel (api.hubapi.com), routes `crm/hubspot/connect` + rappel OAuth + export, carte « Connecter » dans Réglages › Intégrations.',
  },
  {
    name: 'Salesforce',
    feature: 'crm_sync',
    proof: 'apps/api/src/modules/salesforce/salesforce.client.ts',
    why: 'Client REST réel (sobjects/Contact), contrôleur OAuth complet, carte de connexion côté web avec son bouton.',
  },
  {
    name: 'Slack',
    feature: 'notifications',
    proof: 'apps/api/src/modules/integrations/integration-providers.ts',
    why: "Webhook entrant, hôte épinglé sur `hooks.slack.com`, envoi réel par `integrations.outbound.ts`, bouton « message de test » à l'écran.",
  },
  {
    name: 'Microsoft Teams',
    feature: 'notifications',
    proof: 'apps/api/src/modules/integrations/integration-providers.ts',
    why: "Webhook entrant O365 / Power Automate, hôtes épinglés. ⚠️ C'est un webhook, PAS la messagerie via Graph — le site ne promet que la notification, et c'est ce qui est vrai.",
  },
  {
    name: 'Discord',
    feature: 'notifications',
    proof: 'apps/api/src/modules/integrations/integration-providers.ts',
    why: "Règle propre (`bodyKey: 'content'`, hôtes discord/discordapp avec version optionnelle), carte dédiée : ce n'est pas un copié-collé de Slack.",
  },
  {
    name: 'Google Chat',
    feature: 'notifications',
    proof: 'apps/api/src/modules/integrations/integration-providers.ts',
    why: 'Webhook entrant, hôte épinglé, même chaîne de livraison et même garde SSRF que les trois autres canaux.',
  },
  {
    name: 'Mattermost',
    feature: 'notifications',
    proof: 'apps/api/src/modules/integrations/integration-providers.ts',
    why: "Webhook entrant vers l'instance auto-hébergée du client, même chaîne de livraison que les autres canaux.",
  },
  {
    name: 'Claude',
    feature: 'ai_assistant',
    proof: 'apps/mcp/src/main.ts',
    why: "Serveur MCP réel (12 routes, OAuth 2.1, révocation) + guide pas-à-pas dans Réglages › Assistant IA. ⚠️ Aucun code spécifique à cet éditeur : c'est un CLIENT documenté du protocole, et la page ne promet rien d'autre.",
  },
  {
    name: 'Cursor',
    feature: 'ai_assistant',
    proof: 'apps/mcp/src/main.ts',
    why: "Même serveur MCP, même guide pas-à-pas. ⚠️ La seule occurrence de « Cursor » dans le produit est ce guide : la capacité est le protocole, pas l'éditeur, et les deux noms désignent la MÊME chose.",
  },
]

/**
 * Les mentions qui ne sont PAS des promesses, déclarées une par une.
 *
 * ⚠️ Volontairement pénible. Une clé neuve est GARDÉE par défaut, et la liste ne
 * peut que rétrécir — un `if (key.includes('faq')) continue` aurait été plus
 * court et n'aurait rien gardé du tout.
 */
const NON_INTEGRATION_MENTIONS: ReadonlyArray<{ where: string; name: string; why: MentionReason }> = [
  // La parole du visiteur.
  { where: 'beta.json:form.fields.tools.placeholder', name: 'Salesforce', why: 'visitor_words' },
  { where: 'beta.json:form.fields.tools.placeholder', name: 'HubSpot', why: 'visitor_words' },
  { where: 'beta.json:form.fields.tools.placeholder', name: 'LinkedIn', why: 'visitor_words' },
  { where: 'chatbot.json:quickReplies.tooling.excel', name: 'Excel', why: 'visitor_words' },
  { where: 'webinar.json:agenda.segments[3].desc', name: 'LinkedIn', why: 'visitor_words' },
  { where: 'features/chatbot/lib/question-library.ts', name: 'Excel', why: 'visitor_words' },
  { where: 'features/chatbot/lib/objection-library.ts', name: 'LinkedIn', why: 'visitor_words' },
  // Le canal d'un geste humain.
  { where: 'product.json:message.steps.contactDsi', name: 'LinkedIn', why: 'action_channel' },
  { where: 'features/landing/mockups/MessageMockup.tsx', name: 'LinkedIn', why: 'action_channel' },
  // Ce qu'on ne fait pas.
  { where: 'beta.json:faq.items[3].q', name: 'LinkedIn', why: 'denial' },
  { where: 'beta.json:faq.items[3].a', name: 'LinkedIn', why: 'denial' },
  // Notre propre présence.
  { where: 'common.json:team.linkedinAria', name: 'LinkedIn', why: 'our_presence' },
  { where: 'components/Footer.tsx', name: 'LinkedIn', why: 'our_presence' },
]

function isDeclaredMention(entry: Published & { name: string }): boolean {
  if (PUBLISHED_INTEGRATIONS.some(i => i.name === entry.name)) return true
  return NON_INTEGRATION_MENTIONS.some(
    m => m.name === entry.name && (entry.where === m.where || entry.where.endsWith(m.where)),
  )
}

/** Les mentions d'outil client que personne n'a déclarées. */
function undeclaredClientTools(): string[] {
  return [
    ...new Set(
      hits(CLIENT_TOOLS)
        .filter(entry => !isDeclaredMention(entry))
        .map(entry => `${entry.where} → « ${entry.name} » dans « ${entry.text.slice(0, 90)} »`),
    ),
  ].sort()
}

/** Les déclarations qui ne correspondent plus à rien de publié. */
function staleMentions(): string[] {
  const corpus = allPublished()
  const stale: string[] = []
  for (const m of NON_INTEGRATION_MENTIONS) {
    const found = corpus.some(e => (e.where === m.where || e.where.endsWith(m.where)) && mentions(e.text, m.name))
    if (!found) stale.push(`${m.where} → « ${m.name} »`)
  }
  for (const i of PUBLISHED_INTEGRATIONS) {
    if (!corpus.some(e => mentions(e.text, i.name))) stale.push(`intégration déclarée mais jamais publiée : ${i.name}`)
  }
  return stale
}

describe('GA-124 — le site ne nomme un outil du client que s’il le branche', () => {
  it('LIT quelque chose — les quatre langues, tous les espaces de noms, et le code des pages', () => {
    // Un chemin faux rendrait `readdirSync` vide et la garde verte sur du rien.
    const files = messageFiles()
    expect(files.length).toBeGreaterThanOrEqual(48)
    for (const locale of LOCALES) {
      expect(files.filter(f => f.includes(`${locale}/`) || f.includes(`${locale}\\`)).length).toBeGreaterThan(10)
    }
    const fromMessages = publishedFromMessages()
    expect(fromMessages.length).toBeGreaterThan(1500)
    // …et elle voit bien les chemins de clé imbriqués, pas seulement la racine.
    expect(fromMessages.some(e => e.where.split('.').length >= 3)).toBe(true)
    expect(publishedFromCode().length).toBeGreaterThan(500)
    expect(siteFiles(WEBSITE_SRC).length).toBeGreaterThan(100)
  })

  it('trouve bien les noms là où ils SONT — preuve qu’elle sait voir', () => {
    // Si elle ne voyait aucun outil client dans un corpus qui en publie une
    // dizaine, son silence ailleurs ne vaudrait rien.
    expect(hits(CLIENT_TOOLS).length).toBeGreaterThan(20)
    expect(hits(['HubSpot']).length).toBeGreaterThan(3)
    // …y compris dans du TSX codé en dur, pas seulement dans les catalogues.
    expect(hits(CLIENT_TOOLS, publishedFromCode()).length).toBeGreaterThan(0)
  })

  it('chaque outil nommé est DÉCLARÉ — intégration prouvée, ou raison écrite', () => {
    const offenders = undeclaredClientTools()
    if (offenders.length > 0) {
      throw new Error(
        `Le site nomme un outil du client sans le déclarer :\n  ${offenders.join('\n  ')}\n` +
          `S'il est BRANCHÉ : déclare-le dans PUBLISHED_INTEGRATIONS avec sa capacité et le chemin qui la porte.\n` +
          `Si c'est la parole du visiteur, le canal d'un geste, une négation ou notre propre page : ` +
          `déclare la clé dans NON_INTEGRATION_MENTIONS avec sa raison.`,
      )
    }
  })

  it('chaque intégration annoncée a une capacité RÉELLE et un état PUBLIC', () => {
    const featureKeys = new Set(PUBLIC_FEATURES.map(f => f.key))
    expect(featureKeys.size).toBeGreaterThan(10)
    for (const { name, feature, proof, why } of PUBLISHED_INTEGRATIONS) {
      // La capacité existe dans la table que Laura récite : la page et le
      // chatbot ne peuvent plus annoncer deux états différents au même visiteur.
      expect(featureKeys.has(feature), `${name} → capacité « ${feature} » absente de PUBLIC_FEATURES`).toBe(true)
      // Le code qui la porte existe sur le disque.
      expect(existsSync(join(REPO, proof)), `${name} → ${proof} n'existe pas`).toBe(true)
      // Et la raison est écrite, pas recopiée.
      expect(why.length).toBeGreaterThan(60)
    }
  })

  it('les cinq raisons sont ÉCRITES, et chaque exemption en porte une', () => {
    for (const reason of Object.values(MENTION_REASONS)) expect(reason.length).toBeGreaterThan(120)
    for (const { why } of NON_INTEGRATION_MENTIONS) expect(MENTION_REASONS[why]).toBeTruthy()
  })

  it('la liste d’exemptions ne prend pas la poussière', () => {
    // C'est le test qui la fait RÉTRÉCIR : le jour où une clé cesse de nommer un
    // outil, son exemption devient rouge et doit être retirée.
    expect(staleMentions()).toEqual([])
  })

  it('les quatre langues nomment les MÊMES outils — une correction dans une seule est un défaut', () => {
    // Le défaut mesuré ailleurs dans le dépôt : on corrige le français, on livre,
    // et le néerlandais continue d'annoncer ce qu'on vient de retirer.
    const perLocale = new Map<string, Set<string>>()
    for (const locale of LOCALES) perLocale.set(locale, new Set<string>())
    for (const entry of hits(CLIENT_TOOLS, publishedFromMessages())) {
      if (!entry.locale) continue
      perLocale.get(entry.locale)?.add(`${entry.where} → ${entry.name}`)
    }
    const reference = [...(perLocale.get('fr') as Set<string>)].sort()
    expect(reference.length).toBeGreaterThan(5)
    for (const locale of LOCALES) {
      expect([...(perLocale.get(locale) as Set<string>)].sort(), `langue ${locale}`).toEqual(reference)
    }
  })

  it('sait dire NON — un outil non déclaré, et une preuve qui n’existe pas', () => {
    // Un nom neuf n'est PAS exempté par défaut.
    expect(
      isDeclaredMention({
        where: 'home.json:faq.items[5].a',
        text: 'Oui : export vers Zoho et Pipedrive.',
        locale: 'fr',
        name: 'Pipedrive',
      }),
    ).toBe(false)
    // Une exemption vaut pour SA clé, jamais pour le fichier entier — sinon
    // exempter « la parole du visiteur » de `beta.json` exempterait sa FAQ.
    expect(
      isDeclaredMention({
        where: 'beta.json:faq.items[2].a',
        text: 'BellumAI s’intègre à LinkedIn.',
        locale: 'fr',
        name: 'LinkedIn',
      }),
    ).toBe(false)
    // Et une capacité déclarée sur un chemin absent serait refusée. (Zoho ne sert plus d'exemple :
    // il est branché depuis #4187 — un CRM qu'on ne branche pas, si.)
    expect(existsSync(join(REPO, 'apps/api/src/modules/sugarcrm/sugarcrm.client.ts'))).toBe(false)
  })

  it('sait dire NON — mais PAS sur de la prose : un commentaire n’est pas une publication', () => {
    // Le cas réel : `src/app/[locale]/page.tsx` explique en commentaire pourquoi
    // il ne met pas de prix dans le JSON-LD, et cite « Stripe ». Une garde qui
    // compterait les commentaires accuserait ce fichier irréprochable.
    const fichier = [
      '// Un prix deviné serait une promesse que Stripe ne tiendrait pas.',
      "import { HubSpotCard } from './HubSpot'",
      "const promesse = 'export vers HubSpot'",
    ].join('\n')
    const lus = displayedParts(stripComments(fichier))
    expect(lus.filter(p => p.includes('Stripe'))).toEqual([])
    expect(lus.filter(p => p.includes('HubSpot'))).toEqual(['export vers HubSpot'])
    // …et le nom d'un composant importé ne compte pas non plus.
    expect(lus.some(p => p.includes('HubSpotCard'))).toBe(false)
  })

  it('sait dire NON — mais PAS sur un mot ordinaire qui contient un nom', () => {
    // « Railway infrastructure » est la traduction anglaise de « infrastructures
    // ferroviaires » (secteur du compte de démonstration), pas le PaaS. Une
    // inclusion nue aurait accusé `en/home.json`.
    expect(mentions('Größe Ihres Teams', 'Microsoft Teams')).toBe(false)
    expect(mentions('geregistreerde gegevens', 'INSEE')).toBe(false)
    expect(mentions('notifications Microsoft Teams', 'Microsoft Teams')).toBe(true)
    expect(mentions('export vers HubSpot.', 'HubSpot')).toBe(true)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * GA-125 — le site nomme le REGISTRE, jamais le fournisseur.
 * ────────────────────────────────────────────────────────────────────────── */

describe('GA-125 — le site nomme le registre public, jamais notre fournisseur', () => {
  it('LIT quelque chose — le catalogue et le corpus ne sont pas vides', () => {
    expect(OUR_SUPPLIERS.length).toBeGreaterThan(8)
    expect(PUBLIC_REGISTRIES.length).toBeGreaterThan(4)
    expect(allPublished().length).toBeGreaterThan(2000)
  })

  it('trouve bien les registres là où ils SONT — preuve qu’elle sait voir', () => {
    // Elle doit voir les registres autorisés, sinon son silence sur les
    // fournisseurs ne prouverait rien.
    expect(hits(PUBLIC_REGISTRIES.map(r => r.name)).length).toBeGreaterThan(5)
    expect(hits(['BODACC']).length).toBeGreaterThan(2)
  })

  it('aucun de NOS fournisseurs n’est publié par le site', () => {
    const offenders = [
      ...new Set(hits(OUR_SUPPLIERS).map(e => `${e.where} → « ${e.name} » dans « ${e.text.slice(0, 90)} »`)),
    ].sort()
    if (offenders.length > 0) {
      throw new Error(
        `Le site publie le nom d'un fournisseur backend :\n  ${offenders.join('\n  ')}\n` +
          `Un fournisseur est REMPLAÇABLE, son nom ne répond à aucune question du visiteur, ` +
          `et le ranger parmi les « sources officielles » est faux — Apollo est un annuaire commercial, ` +
          `Pappers un rééditeur privé du registre.\n` +
          `Nomme le REGISTRE qu'on interroge (INSEE, INPI, BODACC…) ou la capacité (« registres d'entreprises »).`,
      )
    }
  })

  it('chaque registre nommé est vraiment INTERROGÉ — le collecteur existe', () => {
    // Sans ce test, la liste des registres serait une brochure : on pourrait
    // ajouter « Banque de France » sur la home sans écrire une ligne de code.
    for (const { name, collector, why } of PUBLIC_REGISTRIES) {
      expect(existsSync(join(REPO, collector)), `${name} → ${collector} n'existe pas`).toBe(true)
      expect(why.length).toBeGreaterThan(60)
    }
  })

  it('la liste des registres ne prend pas la poussière — chacun est publié quelque part', () => {
    expect(PUBLIC_REGISTRIES.filter(r => hits([r.name]).length === 0).map(r => r.name)).toEqual([])
  })

  it('sait dire NON — un fournisseur remis dans une page est refusé', () => {
    const fautif: Published[] = [
      { where: 'home.json:metrics.items[1].sub', text: 'INSEE, Pappers, BODACC, France Travail…', locale: 'fr' },
    ]
    const sain: Published[] = [
      { where: 'home.json:metrics.items[1].sub', text: 'INSEE, INPI, BODACC, France Travail…', locale: 'fr' },
    ]
    expect(hits(OUR_SUPPLIERS, fautif).map(e => e.name)).toEqual(['Pappers'])
    expect(hits(OUR_SUPPLIERS, sain)).toEqual([])
    // Et une chip « Apollo » rangée parmi les sources est vue, elle aussi.
    const chips: Published[] = [{ where: 'features/landing/Integrations.tsx', text: 'Apollo', locale: null }]
    expect(hits(OUR_SUPPLIERS, chips).map(e => e.name)).toEqual(['Apollo'])
  })

  it('sait dire NON — un registre déclaré sans collecteur est refusé', () => {
    expect(existsSync(join(REPO, 'apps/ia/app/services/data_sources/banque_de_france.py'))).toBe(false)
    // …et le collecteur d'un registre réellement publié, lui, existe.
    expect(existsSync(join(REPO, PUBLIC_REGISTRIES.find(r => r.name === 'BODACC')?.collector as string))).toBe(true)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * LA FRONTIÈRE — ce que cet arbitrage ne déplace PAS.
 * ────────────────────────────────────────────────────────────────────────── */

describe('GA-124 / GA-125 — la frontière avec l’app ne bouge pas', () => {
  it('les pages que la LOI oblige à nommer un tiers sont exemptées par leur chemin, avec leur base légale', () => {
    for (const { path, why } of LEGAL_PAGES) {
      expect(existsSync(join(WEBSITE_SRC, path)), `${path} — page légale déclarée qui n'existe plus`).toBe(true)
      // La base légale est CITÉE, pas sous-entendue.
      expect(why).toMatch(/LCEN|art\. 82|RGPD/)
    }
    // Et elles nomment bien des tiers : si elles n'en nommaient aucun, leur
    // exemption ne servirait à rien et masquerait peut-être autre chose.
    const legalText = LEGAL_PAGES.map(p => readFileSync(join(WEBSITE_SRC, p.path), 'utf8')).join('\n')
    expect(legalText).toContain('Vercel')
    // …et elles sont bien HORS du corpus balayé.
    expect(allPublished().some(e => e.where.includes('legal/page.tsx'))).toBe(false)
  })

  it('l’exception du SITE ne descend pas dans l’app — GA-44 garde toujours les mêmes noms', () => {
    // Le risque de cet arbitrage : « le site peut nommer HubSpot » devienne
    // « on peut écrire HubSpot en dur dans l'app ». Depuis #1912.11 (décision
    // Louis 13/09/2026, batch 11), l'app nomme l'outil que l'espace a BRANCHÉ,
    // par injection — mais un littéral y reste refusé. Ce test relit la garde
    // d'en face : elle doit lire les listes du contrat, et ces listes doivent
    // toujours porter les noms qu'elle gardait.
    const ga44 = join(REPO, 'apps/web/src/architecture/no-vendor-names-in-app.test.ts')
    expect(existsSync(ga44)).toBe(true)
    const source = readFileSync(ga44, 'utf8')
    expect(source).toContain('CLIENT_TOOLS')
    expect(source).toContain('OUR_SUPPLIERS')
    const guarded = [...CONTRACT_CLIENT_TOOLS.flatMap(tool => tool.names), ...CONTRACT_SUPPLIERS.map(s => s.name)]
    for (const name of ['HubSpot', 'Salesforce', 'Slack', 'Apollo', 'Pappers']) {
      expect(guarded.includes(name), `${name} — retiré de la liste gardée côté app`).toBe(true)
    }
  })
})
