import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SECTIONS,
  SECTION_KEYS,
  TAB_KEYS,
  sectionOfTab,
  subSectionAnchorId,
  tabsOfSection,
  type SectionId,
  type TabId,
} from '@/features/accounts/view/account-detail/components/AccountDetailTabsBar'

/**
 * GA-261 — UN ONGLET DU DOSSIER APPARTIENT À EXACTEMENT UNE SECTION.
 *
 * Numéro vérifié à l'intégration le 08/09/2026 : GA-260
 * (`raison-de-ressemblance.test.ts`) était le plus haut existant.
 *
 * ⚠️ **Le dossier est passé de quatre FAMILLES à sept SECTIONS le 14/09/2026**
 * (#2115, décision D8). La règle n'a pas bougé d'un mot — c'est son vocabulaire
 * qui a changé, et le fichier avec lui. Ce que la garde vérifiait de la barre en
 * familles, elle le vérifie de la barre en sections.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI ÇA SE PERDRAIT SANS ELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `TAB_KEYS` est le contrat du paramètre d'URL : y ajouter un onglet suffit à
 * rendre la page atteignable par `?tab=…`. La BARRE, elle, ne montre plus que
 * les onglets rangés dans une section — le quinzième onglet ajouté à `TAB_KEYS`
 * sans sa section répondrait donc à son URL sans être nommé nulle part, et son
 * CONTENU ne serait empilé nulle part non plus (`AccountDetailTabContent` rend
 * les sous-parties de la section active, pas l'onglet actif).
 *
 * Ce n'est pas une hypothèse : ce dépôt a déjà gardé pendant des mois un écran
 * complet, testé, atteignable par AUCUN chemin, parce que la garde de navigation
 * comparait à une liste écrite à la main. Une garde qui compare à une liste ne
 * voit jamais ce qui n'y est pas — celle-ci compare les deux listes DANS LES
 * DEUX SENS.
 *
 * ⚠️ Elle garde aussi le sens inverse : une section qui nommerait un onglet
 * inexistant (une faute de frappe, un onglet retiré) rendrait une entrée de
 * barre qui n'ouvre rien.
 */
describe('GA-261 — la garde LIT quelque chose', () => {
  it('trouve les deux listes, et elles ne sont pas vides', () => {
    expect(TAB_KEYS.length).toBeGreaterThanOrEqual(14)
    expect(ACCOUNT_SECTIONS.length).toBe(SECTION_KEYS.length)
    expect(ACCOUNT_SECTIONS.every(entry => entry.tabs.length > 0)).toBe(true)
  })
})

describe('GA-261 — chaque onglet a UNE section', () => {
  const flattened = ACCOUNT_SECTIONS.flatMap(entry => entry.tabs)

  it('aucun onglet du contrat d’URL n’est orphelin', () => {
    const ranged = new Set<TabId>(flattened)
    const orphans = TAB_KEYS.filter(tab => !ranged.has(tab))
    expect(orphans, `onglets sans section — ils répondraient à leur URL sans être nommés : ${orphans}`).toEqual([])
  })

  it('aucun onglet n’apparaît dans deux sections', () => {
    const seen = new Map<TabId, number>()
    for (const tab of flattened) seen.set(tab, (seen.get(tab) ?? 0) + 1)
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([tab]) => tab)
    expect(duplicates, `onglets rangés deux fois : ${duplicates}`).toEqual([])
  })

  it('aucune section ne nomme un onglet qui n’existe pas', () => {
    const known = new Set<string>(TAB_KEYS)
    const ghosts = flattened.filter(tab => !known.has(tab))
    expect(ghosts, `onglets inconnus de TAB_KEYS — l'entrée n'ouvrirait rien : ${ghosts}`).toEqual([])
  })

  it('`sectionOfTab` rend une section DÉCLARÉE pour chaque onglet, et `tabsOfSection` l’y retrouve', () => {
    const declared = new Set<SectionId>(SECTION_KEYS)
    for (const tab of TAB_KEYS) {
      const section: SectionId = sectionOfTab(tab)
      expect(declared.has(section), `${tab} tombe sur une section inconnue : ${section}`).toBe(true)
      // #2115 — l'aller ET le retour : c'est `tabsOfSection` qui décide de ce
      // qui est EMPILÉ à l'écran. Une dérivation qui rendrait une section juste
      // et une liste vide donnerait une section nommée qui n'affiche rien.
      expect(tabsOfSection(section), `${tab} n'est pas dans les sous-parties de ${section}`).toContain(tab)
    }
  })

  it('#2115.44 — deux sous-parties ne partagent jamais la même ANCRE', () => {
    // Deux `id` identiques dans le document : le second est inatteignable, en
    // silence — un lien d'ancre qui ne trouve rien ne lève aucune erreur.
    const anchors = TAB_KEYS.map(subSectionAnchorId)
    expect(new Set(anchors).size, `ancres en double : ${anchors}`).toBe(anchors.length)
  })
})

describe('GA-261 — le témoin : elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('ne dit rien de l’ORDRE, qui est un choix d’affichage libre', () => {
    // La garde vérifie l'APPARTENANCE, pas la place. Réordonner une section ou
    // les sections entre elles doit rester possible sans la faire rougir.
    const reordered = [...ACCOUNT_SECTIONS].reverse().flatMap(entry => [...entry.tabs].reverse())
    expect(new Set(reordered)).toEqual(new Set(ACCOUNT_SECTIONS.flatMap(entry => entry.tabs)))
  })

  it('sait dire NON : un onglet retiré de sa section serait vu comme orphelin', () => {
    // On casse volontairement la table pour prouver que la garde mesure quelque
    // chose — sans ce témoin, une table VIDE la rendrait verte pour toujours.
    const amputée = ACCOUNT_SECTIONS.map(entry => ({ ...entry, tabs: entry.tabs.filter(tab => tab !== 'access') }))
    const ranged = new Set<TabId>(amputée.flatMap(entry => entry.tabs))
    expect(TAB_KEYS.filter(tab => !ranged.has(tab))).toEqual(['access'])
  })
})
