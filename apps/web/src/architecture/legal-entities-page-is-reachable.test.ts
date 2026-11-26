import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'
import { pageTitleKeys } from '@/lib/page-titles'
import fr from '@/i18n/locales/fr/nav.json'
import en from '@/i18n/locales/en/nav.json'
import frRoutes from '@/i18n/locales/fr/routes.json'
import enRoutes from '@/i18n/locales/en/routes.json'

/**
 * LES SOCIÉTÉS DE L'ESN S'ATTEIGNENT EN CLIQUANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI L'A RENDUE NÉCESSAIRE — MESURÉ, PAS SUPPOSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `legal_entities` était livré ENTIER côté serveur : la migration, l'entité
 * TypeORM, un module NestJS autonome, quatre routes gardées par
 * `billing:manage`, `missions.legal_entity_id` pour rattacher, et un service
 * testé. Le 31/08/2026, `grep -rn "legal_entit" apps/web/src` rendait **une
 * seule ligne, et c'était un commentaire**. Trois autres formes (`legalEntit`,
 * `legal-entities`, `LegalEntity`) rendaient ZÉRO.
 *
 * Une ESN multi-société n'avait donc aucun moyen de déclarer ses structures. La
 * seule réponse restait « un espace par société » — perdre l'équipe partagée,
 * le vivier commun et le cockpit du responsable pour régler une question de
 * facturation. C'est le défaut n°1 du dépôt : du code juste, calculé, testé,
 * que personne n'appelle.
 *
 * Le mode d'échec est silencieux par construction : rien ne casse, aucun test
 * ne rougit, la capacité se réécrit trois mois plus tard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Elle LIT un corpus non vide — la barre de Réglages a bien des entrées.
 * 2. La route EXISTE et l'arbre GÉNÉRÉ la connaît (une route ajoutée sans
 *    régénération est un fichier que le routeur n'a jamais vu).
 * 3. L'entrée est dans la barre de Réglages, section **Espace de travail** — une
 *    société qui facture est un registre d'ESPACE, pas un réglage de personne.
 * 4. Les titres d'onglet et de page existent — sinon l'écran hérite du titre
 *    précédent.
 * 5. Le libellé de l'entrée existe en FR ET en EN.
 *
 * ⚠️ Ce qu'elle ne prétend PAS savoir : si l'entrée est VISIBLE à l'écran. Une
 * garde qui prétendrait le savoir accuserait du code correct. Ce que l'écran
 * REND est prouvé par `LegalEntitiesView.test.tsx`, qui le monte pour de vrai.
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = join(SRC, 'routeTree.gen.ts')
const ROUTE_FILE = join(SRC, 'routes', 'settings', 'legal-entities.tsx')

/** L'adresse, écrite UNE fois : la recopier la ferait dériver. */
const PAGE_PATH = '/settings/legal-entities'

/** La section où l'entrée doit vivre, au sens de `items.settings.ts`. */
const WORKSPACE_SECTION = 'sections.space'

/** Résout `items.legalEntities` dans un catalogue i18n, ou rend `undefined`. */
function lookup(catalog: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, catalog)
}

describe('les sociétés de l’ESN s’atteignent en cliquant', () => {
  it('LIT quelque chose — la barre de Réglages n’est pas vide', () => {
    // Sans cette assertion, une barre vidée par erreur rendrait les suivantes
    // muettes plutôt que rouges : le faux zéro silencieux, la cause racine la
    // plus chère du dépôt.
    expect(SETTINGS_SECTIONS.length).toBeGreaterThanOrEqual(2)
    expect(SETTINGS_SECTIONS.flatMap(section => section.items).length).toBeGreaterThanOrEqual(10)
  })

  it('la route existe, et l’arbre GÉNÉRÉ la connaît', () => {
    expect(existsSync(ROUTE_FILE), `${ROUTE_FILE} absent`).toBe(true)
    expect(readFileSync(ROUTE_FILE, 'utf8')).toContain(`createFileRoute('${PAGE_PATH}')`)
    expect(readFileSync(ROUTE_TREE, 'utf8')).toContain(`'${PAGE_PATH}'`)
  })

  it('une ENTRÉE de la barre de Réglages y mène, dans la section Espace de travail', () => {
    const workspace = SETTINGS_SECTIONS.find(section => section.labelKey === WORKSPACE_SECTION)
    expect(workspace, `section ${WORKSPACE_SECTION} introuvable`).toBeDefined()
    const entry = workspace?.items.find(item => item.to === PAGE_PATH)
    // Le message porte l'inventaire : un rouge qui dit seulement « undefined »
    // envoie chercher, un rouge qui liste ce qu'il a vu envoie corriger.
    expect(entry, `entrées vues : ${workspace?.items.map(item => String(item.to)).join(', ')}`).toBeDefined()
    expect(entry?.labelKey).toBe('items.legalEntities')
    // Maquette `settings-espace` (Théo V22, Louis 22/10/2026, R2) : les sociétés sont un ONGLET de Périmètres & sociétés.
    // L'entrée reste déclarée (recherche des Réglages, catalogue de Laura) mais ne s'affiche plus dans la barre.
    expect(entry?.aliasOf).toBe('/settings/business-units')
    // ⚠️ PAS `managerOnly` : la LECTURE est ouverte à tous les membres côté
    // serveur — « un commercial doit pouvoir voir quelle société porte la
    // mission dont il parle au client ». Masquer l'entrée aux non-gestionnaires
    // fermerait une porte que l'API laisse ouverte.
    expect(entry?.managerOnly).toBeUndefined()
  })

  it('l’écran a son titre d’onglet et son titre de page', () => {
    const routeTitles = readFileSync(join(SRC, 'lib', 'route-titles.ts'), 'utf8')
    expect(routeTitles).toContain(`'${PAGE_PATH}'`)
    // ⚠️ Sans entrée EXPLICITE, `resolveTitle` retombe sur le préfixe
    // `/settings` et titre la page « Préférences » — un écran qui hérite du
    // titre d'un autre.
    expect(pageTitleKeys[PAGE_PATH]).toBe('items.legalEntities')
  })

  it('le libellé et le titre existent en FR et en EN', () => {
    const missing: string[] = []
    for (const [name, catalog] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      if (typeof lookup(catalog, 'items.legalEntities') !== 'string') missing.push(`${name}:nav.items.legalEntities`)
    }
    for (const [name, catalog] of [
      ['fr', frRoutes],
      ['en', enRoutes],
    ] as const) {
      if (typeof lookup(catalog, 'settingsLegalEntities.title') !== 'string') {
        missing.push(`${name}:routes.settingsLegalEntities.title`)
      }
    }
    expect(missing).toEqual([])
  })
})
