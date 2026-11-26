import { CLIENT_TOOLS, OUR_SUPPLIERS, supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { resources } from './resources'

/**
 * Aucun nom d'outil ÉCRIT EN DUR hors Réglages › Intégrations.
 *
 * ⚠️ Règle refaite le 13/09/2026 (décision Louis, batch 11, #1912.11) : l'outil
 * que l'espace a BRANCHÉ se nomme désormais — par interpolation, sa valeur venant
 * des connexions de l'espace —, et NOS fournisseurs jamais. Ce que ce fichier
 * tient ne change pas : un libellé qui écrit le nom en dur. Le récit ci-dessous
 * est celui de l'arbitrage du 02/08, gardé pour la trace.
 *
 * Arbitrage Louis 02/08 : aucun nom d'éditeur hors Réglages › Intégrations.
 *
 * L'application nomme la CAPACITÉ — « ta messagerie », « ton agenda », « ton
 * CRM », « ton espace documentaire » — jamais l'éditeur qui la fournit. Deux
 * raisons, et la seconde compte plus que la première :
 *
 * 1. la même fonctionnalité marche avec plusieurs fournisseurs, et un libellé
 *    « Envoyer via Outlook » sur le poste d'un commercial sous Google se lit
 *    comme un bug ;
 * 2. le produit vend une capacité, pas un connecteur. « Rédiger via Gmail »
 *    place l'éditeur au centre de l'écran, à la place de ce que Bellum fait.
 *
 * **La seule exception est Réglages › Intégrations**, où l'utilisateur autorise
 * lui-même l'accès : un bouton « Connecter » doit dire ce qu'il connecte. Le
 * registre des outils affiché sur ce même écran suit la même exception.
 *
 * Deux gardes existaient déjà — côté prompt (`test_copilote_prompt_blocks.py`)
 * et côté digest d'outils (`tool-capability-digest.spec.ts`). Il manquait celle
 * de l'INTERFACE : quatorze libellés la violaient encore le 03/08, dont
 * « Exporter vers Google Sheets » sur l'écran Contacts et tout le dialogue
 * Outlook d'une fiche contact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE COUVRE PAS — ET QUI S'EN CHARGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce fichier lit UN corpus : `resources`, c'est-à-dire les catalogues de
 * traduction (y compris le namespace `changelog`, servi par `@bellum/contracts`
 * — d'où la dérogation datée ci-dessous, qu'aucune autre garde ne porte).
 *
 * Il ne voit donc PAS un nom d'éditeur écrit ailleurs et rendu à l'écran. Deux
 * chemins existent, tenus par **GA-44** (`architecture/no-vendor-names-in-app.test.ts`) :
 *
 *   1. le littéral écrit dans un composant ou un JSON d'écran — corpus `apps/web/src` ;
 *   2. le libellé écrit dans un CONTRAT partagé et rendu brut par un composant
 *      — corpus `packages/contracts/src/schemas`. C'est par là que
 *      « Apollo (annuaire vérifié) » a tenu des mois sur la fiche contact, sous
 *      le score : ni ce fichier ni GA-44 ne regardaient ce paquet.
 *
 * ⚠️ N'écris pas une QUATRIÈME garde sur ce sujet — un réglage vit à un seul
 * endroit (GA-26). Élargis le corpus de celle dont le périmètre correspond.
 */

/** Aplatissement `locale.namespace.chemin` → texte, pour nommer le coupable. */
function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === 'string') {
    out.set(path, value)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, path ? `${path}.${key}` : key, out)
    }
  }
}

const ALL_STRINGS: Map<string, string> = (() => {
  const out = new Map<string, string>()
  for (const [locale, namespaces] of Object.entries(resources)) {
    flatten(namespaces, locale, out)
  }
  return out
})()

/**
 * Les espaces de noms où nommer l'éditeur est LÉGITIME.
 *
 * `integrations` et `settings` portent l'écran Réglages › Intégrations. Rien
 * d'autre : si un futur écran a besoin d'une dérogation, elle se discute, elle
 * ne s'ajoute pas en passant.
 */
const ALLOWED_NAMESPACES = ['integrations', 'settings']

/**
 * Le jour de l'arbitrage. Les entrées de changelog ANTÉRIEURES gardent leur
 * texte d'origine.
 *
 * Le changelog est un registre daté : il dit ce qui a été annoncé tel jour.
 * Réécrire une entrée du 23 juillet pour la mettre en conformité avec une règle
 * du 2 août lui ferait dire ce qui n'a jamais été annoncé — et un registre qu'on
 * réécrit ne vaut plus rien. Sept entrées de juillet nomment donc encore leur
 * connecteur, et c'est voulu.
 *
 * Ce n'est PAS une dérogation ouverte : toute entrée postérieure est tenue par
 * la règle comme le reste de l'interface. L'identifiant d'une entrée porte sa
 * date, ce qui rend la frontière mécanique plutôt que déclarative.
 */
const RULE_DAY = '2026-08-02'

/**
 * #1912.11 — le jour où la liste s'est ÉLARGIE. En la lisant dans
 * `@bellum/contracts` le 13/09/2026, cette garde a gagné des noms d'outils du
 * CLIENT qu'elle ne connaissait pas, dont Odoo, écrit dans des entrées datées du
 * 01/09 et du 04/09. Pour un outil du client, la raison de `RULE_DAY` vaut : un
 * registre qu'on réécrit ne vaut plus rien, et annoncer un connecteur livré n'est
 * pas nommer notre chaîne d'outillage.
 *
 * ⚠️ AUCUNE exemption pour NOS fournisseurs, quelle que soit la date (application
 * de la règle, 13/09/2026) : « Nouveautés » est un écran client, lu aujourd'hui,
 * et une entrée de juillet qui cite Apollo le montre aujourd'hui. Les six entrées
 * qui les nommaient (16/07, 19/07, 21/07, 23/07 × 2, 03/08) ont été réécrites en
 * capacités, sens et nombre de points conservés.
 */
const LIST_WIDENED_DAY = '2026-09-13'

/** NOS fournisseurs, sous leur forme longue — jamais exemptés, jamais datés. */
const SUPPLIER_NAMES: readonly string[] = OUR_SUPPLIERS.map(supplier => supplier.name)

/*
 * #1912 — la recherche de NOS fournisseurs ignore la casse. « Non appliqué par
 * pappers » a traversé cette garde parce qu'elle cherchait « Pappers » avec sa
 * majuscule. Le détecteur vit dans le contrat (`supplierNamesIn`, `tool-naming.ts`),
 * le même pour l'écran, l'i18n, le changelog et le digest de Laura.
 */

/** Les noms que cette garde lisait déjà le 02/08 — tenus depuis `RULE_DAY`. */
const GUARDED_SINCE_RULE_DAY: readonly string[] = [
  'Gmail',
  'Outlook',
  'Google Drive',
  'Google Sheets',
  'Google Agenda',
  'Google Calendar',
  'Google Workspace',
  'Microsoft 365',
  'HubSpot',
  'Salesforce',
  'Pipedrive',
  'Attio',
  'Notion',
  'Aircall',
  'Ringover',
  'Yousign',
  'Qonto',
  'DocuSign',
  'BoondManager',
  'Dropcontact',
]

/** Une entrée de changelog écrite avant que la garde ne tienne CE nom d'outil du client. */
function isHistoricalChangelogEntry(path: string, vendor?: string): boolean {
  const [, namespace, section, entryId] = path.split('.')
  if (namespace !== 'changelog' || section !== 'entries' || !entryId) return false
  if (vendor !== undefined && SUPPLIER_NAMES.includes(vendor)) return false
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(entryId)?.[1]
  const since = vendor === undefined || GUARDED_SINCE_RULE_DAY.includes(vendor) ? RULE_DAY : LIST_WIDENED_DAY
  return date !== undefined && date < since
}

/**
 * Les noms qu'un libellé ne doit pas écrire EN DUR — lus dans `@bellum/contracts`
 * (`tool-naming.ts`), plus recopiés ici.
 *
 * #1912.11 — décision Louis 13/09/2026, batch 11 : l'outil que l'espace a BRANCHÉ
 * se nomme, mais par INTERPOLATION (« Brouillon déposé dans {{mailbox}} »), la
 * valeur venant de ses connexions. Un libellé qui l'écrit en dur le promettrait
 * à qui ne l'a pas branché ; un fournisseur de Bellum ne s'écrit jamais.
 *
 * Écarté, raison écrite : « LinkedIn » — GA-44 le tient clé par clé : le CANAL
 * d'un geste que l'humain exécute se nomme (« Voir sur LinkedIn »), une
 * provenance non. Tous nos fournisseurs y sont, hébergement compris : le pied de
 * page du tableau de bord d'équipe citait l'hébergeur, il dit désormais
 * « hébergées dans l'Union européenne » (13/09/2026).
 */
const VENDORS: string[] = [
  ...new Set([...CLIENT_TOOLS.flatMap(tool => tool.names).filter(name => name !== 'LinkedIn'), ...SUPPLIER_NAMES]),
]

describe('aucun nom d’outil écrit en dur hors Réglages › Intégrations', () => {
  it('lit la liste du contrat, pas une copie locale', () => {
    expect(VENDORS).toEqual(expect.arrayContaining(['Gmail', 'Outlook', 'HubSpot', 'Dropcontact', 'Apollo']))
    expect(VENDORS).not.toContain('LinkedIn')
  })

  it('lit bien tous les libellés', () => {
    // Filet du filet : si l'aplatissement casse, le test passerait en ne
    // regardant rien.
    expect(ALL_STRINGS.size).toBeGreaterThan(2000)
  })

  it('la dérogation du changelog ne couvre QUE le passé', () => {
    // Sans cette vérification, il suffirait qu'un identifiant d'entrée perde sa
    // date pour que la dérogation s'étende à tout le changelog.
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-07-23-besoin-crm.item1')).toBe(true)
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-08-03-nouvelle-entree.item1')).toBe(false)
    expect(isHistoricalChangelogEntry('fr.changelog.entries.sans-date.item1')).toBe(false)
    expect(isHistoricalChangelogEntry('fr.contacts.actions.exportSheet')).toBe(false)
    // #1912.11 — un nom gagné le 13/09 ne rend pas l'historique rouge…
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-09-01-odoo-rejoint-les-crm.title', 'Odoo')).toBe(true)
    // …mais un nom gardé depuis le 02/08 reste tenu sur la même entrée, et une
    // entrée écrite À PARTIR du 13/09 est tenue pour tous.
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-09-01-odoo-rejoint-les-crm.title', 'HubSpot')).toBe(
      false,
    )
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-09-13-nouvelle-entree.item1', 'Odoo')).toBe(false)
    // …et NOTRE fournisseur n'est historique à AUCUNE date, même avant le 02/08.
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-07-16-briefs.item1', 'Apollo')).toBe(false)
    expect(isHistoricalChangelogEntry('fr.changelog.entries.2026-08-03-enrichisseurs.item1', 'Kaspr')).toBe(false)
  })

  it('aucune entrée de changelog, à AUCUNE date, ne nomme un de NOS fournisseurs', () => {
    const entries = [...ALL_STRINGS].filter(([path]) => path.split('.').slice(1, 3).join('.') === 'changelog.entries')
    // LIT — le changelog est bien dans le corpus, dans les deux langues.
    expect(entries.length).toBeGreaterThan(500)
    expect(entries.some(([path]) => path.startsWith('en.'))).toBe(true)
    const offenders = entries.flatMap(([path, text]) => supplierNamesIn(text).map(name => `${path} → ${name}`))
    expect(offenders).toEqual([])
  })

  it('sait dire NON sur un fournisseur remis dans une entrée — et n’attrape pas les mots voisins', () => {
    expect(supplierNamesIn("Kaspr et FullEnrich s'ajoutent derrière les sources existantes")).toEqual([
      'Kaspr',
      'FullEnrich',
    ])
    // L'ordre rendu est celui du contrat (`OUR_SUPPLIERS`), pas celui de la phrase.
    expect(supplierNamesIn('les sources — Apollo, Pappers, France Travail, Brave…')).toEqual([
      'Apollo',
      'Brave Search',
      'Pappers',
    ])
    // #1912 — la phrase exacte qui avait échappé : le nom en minuscules.
    expect(supplierNamesIn('« Non appliqué par pappers — les résultats sont plus larges que demandé »')).toEqual([
      'Pappers',
    ])
    // Voisins légitimes : un registre public, et des mots ordinaires dont une marque est le préfixe.
    expect(supplierNamesIn('France Travail, INSEE, la bravoure, un brave commercial, les apollons')).toEqual([])
  })

  it.each(VENDORS)('« %s » n’apparaît pas dans l’interface', vendor => {
    const offenders: string[] = []
    for (const [path, text] of ALL_STRINGS) {
      const namespace = path.split('.')[1] ?? ''
      if (ALLOWED_NAMESPACES.includes(namespace)) continue
      if (isHistoricalChangelogEntry(path, vendor)) continue
      // #1912 — NOTRE fournisseur se cherche sans la casse ; l'outil du client garde sa graphie.
      const named = SUPPLIER_NAMES.includes(vendor) ? supplierNamesIn(text).includes(vendor) : text.includes(vendor)
      if (named) offenders.push(`${path} → « ${text} »`)
    }
    if (offenders.length > 0) {
      throw new Error(
        `« ${vendor} » est nommé hors de Réglages › Intégrations :\n  ${offenders.join('\n  ')}\n` +
          `Nomme la CAPACITÉ (« ta messagerie », « ton agenda », « ton CRM », « ton espace documentaire »), ` +
          `ou interpole le nom de l'outil que l'espace a BRANCHÉ (« dans {{mailbox}} », #1912.11).`,
      )
    }
  })
})
