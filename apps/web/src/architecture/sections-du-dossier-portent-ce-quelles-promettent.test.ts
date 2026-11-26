import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SECTIONS,
  sectionOfTab,
  TAB_KEYS,
  tabsOfSection,
  type SectionId,
  type TabId,
} from '@/features/accounts/view/account-detail/components/AccountDetailTabsBar'

/**
 * GA-334 — LES QUATRE OBJETS QUE LES SECTIONS PROMETTENT SONT DANS LEUR SECTION,
 * ET À UN SEUL ENDROIT (#2115.22/.23/.26/.27).
 *
 * Numéro vérifié le 14/09/2026 : GA-331 (`dossier-compte-migration-doc.test.ts`)
 * était le plus haut existant.
 * Renumérotée GA-334 à l’intégration R :
 * trois lots parallèles avaient pris GA-332 le même jour — GA-332 : actions facturées
 * (`credited-actions-announce-their-cost.test.ts`), GA-333 : conteneur rigide
 * (`un-conteneur-rigide-ne-porte-pas-de-texte-libre.test.ts`), GA-334 : sections du dossier
 * (`sections-du-dossier-portent-ce-quelles-promettent.test.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE REFUSE, MESURÉ À L'ÉCRAN EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Les sept sections ont été nommées par ce qu'elles CONTIENNENT : « Périmètres :
 * sites · entités · filiales · programmes », « Opportunités : signaux · veille ·
 * projets plausibles · besoins confirmés », « Plan d'action : le plan · les
 * prochaines actions · la préparation des messages », « Historique & preuves :
 * missions · preuves · REX · timeline · mémoire relationnelle ». Sur THALES, le
 * 14/09/2026, quatre de ces mots ne correspondaient à RIEN dans leur section :
 * le mot « programmes » n'apparaissait nulle part dans Périmètres, les besoins
 * confirmés disparaissaient avec l'onglet Projets dès qu'un compte n'avait aucun
 * projet, « messages » n'était un onglet de rien, et la mémoire relationnelle
 * était restée une carte de la Synthèse.
 *
 * Aucun des quatre n'était à écrire : les quatre EXISTAIENT — il manquait le
 * MONTAGE. C'est le défaut n°1 du dépôt (« du code juste que personne
 * n'appelle »), vu ici depuis l'autre bout : non pas une fonction sans appelant,
 * mais une PROMESSE d'écran sans contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI ÇA SE PERDRAIT SANS ELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Chacun des quatre est rangé dans la section qui le promet.
 * 2. Aucun n'est rendu DEUX fois : quand on rapatrie un objet, on le retire de
 *    là où il était (loi 4 du tome 7 — rien n'apparaît deux fois sous la même
 *    forme avec le même contenu). C'est le point que `sectionOfTab` seul ne peut
 *    pas voir : une carte peut très bien être remontée dans sa section ET
 *    laissée dans son ancien onglet, et les deux écrans passeraient leurs tests.
 *    La garde relit donc les fichiers d'où les objets sont PARTIS.
 */

const WEB_SRC = join(__dirname, '..')
const ACCOUNT_DETAIL = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail')

function source(...parts: string[]): string {
  return readFileSync(join(ACCOUNT_DETAIL, ...parts), 'utf8')
}

/** Ce que chaque section PROMET par son libellé, et l'objet qui le tient. */
const PROMESSES: readonly { readonly objet: string; readonly tab: TabId; readonly section: SectionId }[] = [
  { objet: 'besoins confirmés', tab: 'veille', section: 'opportunities' },
  { objet: 'préparation des messages', tab: 'messages', section: 'actionPlan' },
  { objet: 'mémoire relationnelle', tab: 'memory', section: 'historyProofs' },
]

describe('GA-334 — la garde LIT quelque chose', () => {
  it('trouve les sections et les fichiers d’où les objets sont partis', () => {
    expect(ACCOUNT_SECTIONS.length).toBeGreaterThanOrEqual(7)
    expect(PROMESSES.length).toBe(3)
    // Les deux fichiers relus plus bas existent et ne sont pas vides : une garde
    // qui lit un fichier absent serait verte pour toujours.
    expect(source('tabs', 'TabOverview.tsx').length).toBeGreaterThan(1000)
    expect(source('tabs', 'TabProjects.tsx').length).toBeGreaterThan(1000)
  })
})

describe('GA-334 — chaque objet promis est dans SA section', () => {
  it.each(PROMESSES)('« $objet » est atteignable dans $section', ({ tab, section }) => {
    expect(sectionOfTab(tab), `${tab} n'est pas rangé dans ${section}`).toBe(section)
    expect(tabsOfSection(section), `${section} ne l'empile pas`).toContain(tab)
  })
})

describe('#3677 — les programmes se lisent avec les signaux, plus dans Périmètres', () => {
  it('« programs » n’est plus un onglet : Périmètres ne porte que les sites', () => {
    expect((TAB_KEYS as readonly string[]).includes('programs')).toBe(false)
    expect(tabsOfSection('perimeters')).toEqual(['sites'])
  })

  // #3624 / #3676 — Signaux est rendu par l'écran unique `AccountOpportunityScreen`,
  // que `AccountDetailTabContent` monte pour `veille` : la garde lit les deux.
  // #4755 (lot 761, réécrite, pas supprimée) — l'écran est désormais UN tableau (`AccountSignalTable`) : une ligne
  // par fait DATÉ. Les programmes publics (`program_names`, sans date) n'y font aucune ligne (doctrine « on
  // n'affiche pas ce qu'on n'a pas ») : ils vivent dans la colonne latérale du tableau, avec l'ancre que vise le
  // lien « détail » de la carte Stratégie 5P. Ce que la garde tient toujours : ni Signaux ni Périmètres ne
  // remontent `TabPrograms`.
  it('Signaux monte le tableau unique, qui porte les programmes, et jamais Périmètres', () => {
    const content = source('components', 'AccountDetailTabContent.tsx')
    const screen = source('tabs', 'opportunities', 'AccountOpportunityScreen.tsx')
    const table = source('tabs', 'opportunities', 'AccountSignalTable.tsx')
    expect(content).toMatch(/<AccountOpportunityScreen[\s/>]/)
    expect(screen).toMatch(/<AccountSignalTable[\s/>]/)
    expect(table).toMatch(/<SignalPrograms[\s/>]/)
    expect(content).not.toMatch(/<TabPrograms[\s/>]/)
    expect(screen).not.toMatch(/<TabPrograms[\s/>]/)
  })
})

describe('GA-334 — et à un SEUL endroit : ce qui est rapatrié est retiré', () => {
  it('la Synthèse ne rend plus les programmes ni la mémoire de relation', () => {
    const overview = source('tabs', 'TabOverview.tsx')
    expect(overview, '`ItProgramsCard` est rendue deux fois — Synthèse ET Périmètres').not.toMatch(
      /<ItProgramsCard[\s/>]/,
    )
    expect(overview, '`RelationshipMemoryCard` est rendue deux fois — Synthèse ET Historique & preuves').not.toMatch(
      /<RelationshipMemoryCard[\s/>]/,
    )
  })

  it('l’onglet Projets ne construit plus le seau « Besoins confirmés »', () => {
    const projects = source('tabs', 'TabProjects.tsx')
    expect(projects, 'le seau des besoins confirmés est construit deux fois').not.toMatch(
      /key:\s*'confirmed'|accountTab\.summary\.confirmed/,
    )
  })
})

describe('GA-334 — le témoin : elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('ne dit rien de l’ORDRE des sous-parties dans une section', () => {
    // Remonter les programmes au-dessus des sites est un choix d'affichage
    // libre : la garde protège l'APPARTENANCE, pas la place.
    const inversée = [...tabsOfSection('perimeters')].reverse()
    expect(new Set(inversée)).toEqual(new Set(tabsOfSection('perimeters')))
  })

  it('ne confond pas une MENTION avec un RENDU — un commentaire qui nomme la carte reste permis', () => {
    // La Synthèse explique en commentaire où les programmes sont partis. Un
    // corpus lu au mot-clé ferait rougir la garde sur cette phrase ; le motif
    // vise une BALISE JSX, et cette distinction est la règle « une garde ne
    // doit pas attraper ce qu'elle ne vise pas ».
    const overview = source('tabs', 'TabOverview.tsx')
    expect(overview).toContain('ItProgramsCard')
    expect(overview).not.toMatch(/<ItProgramsCard[\s/>]/)
  })

  it('sait dire NON : la carte remise dans la Synthèse serait vue comme un doublon', () => {
    const cassé = `${source('tabs', 'TabOverview.tsx')}\n<ItProgramsCard programs={[]} analyzedAt={null} />\n`
    expect(cassé).toMatch(/<ItProgramsCard[\s/>]/)
  })

  it('sait dire NON : un objet sorti de sa section serait vu comme absent', () => {
    const amputées = ACCOUNT_SECTIONS.map(entry => ({
      ...entry,
      tabs: entry.tabs.filter(tab => tab !== 'memory'),
    }))
    const rangés = new Set<TabId>(amputées.flatMap(entry => entry.tabs))
    expect(PROMESSES.filter(promesse => !rangés.has(promesse.tab)).map(p => p.tab)).toEqual(['memory'])
  })
})
