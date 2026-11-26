import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #1328.5 · #1322 · #1332 · #1335 — « Empty states : toujours expliquer ce qui
 * manque ET proposer le geste suivant. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────
 * Recette live du 02/09/2026 sur `/accounts/sprints` : les quatre files sont
 * vides, et chacune affiche « Aucun compte ici. » — une phrase nue, quatre
 * fois, sans un geste. L'écran ne dit ni pourquoi la file est vide, ni comment
 * y mettre quelque chose.
 *
 * C'est la cause racine « une réponse juste sans chemin » : l'information est
 * exacte et l'utilisateur reste bloqué devant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────
 * Que chaque file vide dise CE QUI lui manque — le mot « Focus » ne suffit pas,
 * il faut ce qu'un compte y fait — et porte un chemin vers l'endroit où l'on
 * en met. Elle ne juge pas la formulation ; elle refuse le cul-de-sac.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const locales = join(racineWeb, 'src', 'i18n', 'locales')

/** Les quatre files du tableau des priorités. */
const FILES = ['focus', 'extension', 'volume', 'no_go'] as const

describe('une file vide du tableau des priorités', () => {
  const langues = readdirSync(locales)

  it('a un corpus à lire', () => {
    expect(langues.length).toBeGreaterThanOrEqual(2)
  })

  it.each(langues)('explique ce qui manque, file par file (%s)', langue => {
    const sprints = JSON.parse(readFileSync(join(locales, langue, 'sprints.json'), 'utf8')) as {
      empty?: Record<string, string>
    }

    for (const file of FILES) {
      const phrase = sprints.empty?.[file]
      expect(phrase, `${langue} → empty.${file}`).toBeTruthy()
      // Une phrase qui dit ce qu'un compte fait dans cette file, pas « vide ».
      expect(phrase!.length, `${langue} → empty.${file} trop court`).toBeGreaterThan(30)
    }
  })

  it.each(langues)('propose un geste, le même dans chaque langue (%s)', langue => {
    const sprints = JSON.parse(readFileSync(join(locales, langue, 'sprints.json'), 'utf8')) as {
      empty?: Record<string, string>
    }

    expect(sprints.empty?.action).toBeTruthy()
  })

  it('l’écran REND ce geste — une clé sans lecteur ne sort personne du cul-de-sac', () => {
    const source = readFileSync(join(racineWeb, 'src', 'features', 'sprints', 'view', 'SprintBoard.tsx'), 'utf8')

    expect(source).toContain('empty.action')
    expect(source).toMatch(/empty\.\$\{level\}|empty\.`|`empty\./)
    // Le geste est un LIEN : ça se tabule, ça s'ouvre dans un onglet, ça
    // s'annonce (GA-35). Un `<div onClick>` ne fait aucun des trois.
    expect(source).toMatch(/<Link[\s\n]/)
  })

  it('sait dire NON — la phrase nue d’avant serait refusée', () => {
    const avant = 'Aucun compte ici.'

    expect(avant.length).toBeLessThan(30)
  })
})

/**
 * ET LA MÊME RÈGLE, PARTOUT — pas seulement sur l'écran signalé.
 *
 * Corriger la file signalée et laisser les autres, c'est se préparer le même
 * retour la semaine suivante. La règle porte sur TOUS les états vides.
 */
describe('un état vide du produit', () => {
  /**
   * L'exception, NOMMÉE et motivée. Le journal d'activité se remplit tout seul
   * — « dès qu'une analyse part, qu'un contact est enrichi ou qu'un membre
   * rejoint l'équipe, ça s'écrit ici ». Il n'existe aucun geste à proposer
   * autre que « se servir du produit », et son message le dit déjà. Un bouton
   * y serait du remplissage.
   */
  const SANS_GESTE_A_DESSEIN = [
    join('features', 'team', 'view', 'ActivityLogView.tsx'),
    // #2005.5 — la CRÉATION d'un périmètre (BU/agence/équipe) n'a aucun
    // appelant web : `POST /business-units` existe côté API, mais ce lot a
    // scopé la SAISIE d'une fiche déjà là (`update`), pas la création d'une
    // neuve. Proposer un geste ici inventerait un écran de création hors du
    // périmètre livré — à ouvrir dans un lot dédié, pas glissé en aparté d'un
    // état vide.
    join('features', 'business-units', 'view', 'BusinessUnitAdminView.tsx'),
  ]

  function fichiersSous(dir: string): string[] {
    const sortie: string[] = []
    for (const entree of readdirSync(dir, { withFileTypes: true })) {
      if (entree.name === 'node_modules' || entree.name === 'dist') continue
      const chemin = join(dir, entree.name)
      if (entree.isDirectory()) sortie.push(...fichiersSous(chemin))
      else if (entree.name.endsWith('.tsx') && !entree.name.includes('.test.')) sortie.push(chemin)
    }
    return sortie
  }

  const sources = fichiersSous(join(racineWeb, 'src'))

  it('a un corpus à lire', () => {
    expect(sources.length).toBeGreaterThan(400)
  })

  it('porte un geste, ou figure dans la liste des exceptions motivées', () => {
    const culsDeSac: string[] = []

    for (const fichier of sources) {
      const relatif = fichier.slice(racineWeb.length + 1)
      if (SANS_GESTE_A_DESSEIN.some(exception => relatif.endsWith(exception))) continue

      const source = readFileSync(fichier, 'utf8')
      for (const bloc of source.match(/<ScreenState\b[\s\S]{0,700}?\/>/g) ?? []) {
        const etat = /state=[{"]([\w"_]+)/.exec(bloc)?.[1]?.replace(/"/g, '') ?? ''
        if (etat.startsWith('empty') && !bloc.includes('action')) culsDeSac.push(`${relatif} → ${etat}`)
      }
    }

    expect(culsDeSac).toEqual([])
  })

  it('sait dire NON — un état vide sans geste est bien reconnu', () => {
    const fautif = '<ScreenState state="empty_never" title="x" message="y" />'
    const etat = /state=[{"]([\w"_]+)/.exec(fautif)?.[1]?.replace(/"/g, '') ?? ''

    expect(etat.startsWith('empty') && !fautif.includes('action')).toBe(true)
  })
})
