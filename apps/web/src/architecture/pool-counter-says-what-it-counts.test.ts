/**
 * GA-121 — un compteur isolé DIT ce qu'il compte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08, écran Vivier, en PRODUCTION : une pastille « 1 », nue,
 * en haut à gauche de l'écran. Sans un mot. Personne ne peut savoir ce qu'elle
 * compte — des profils ? des CV en attente ? des alertes ?
 *
 * Le reste du produit fait déjà bien : `/pilotage` écrit « 3 alertes »
 * (`ChainAlertsBadge`), `/pilotage/qualite` « 4 contrôles à traiter ». La forme
 * existait, cet écran ne l'avait pas reprise.
 *
 * ⚠️ Ce que la garde surveille est la pastille d'ENTÊTE (`pageTitleBadge`),
 * c'est-à-dire un compteur qui vit SEUL. Un compteur collé à son libellé — le
 * « 3 » dans le bouton « Bientôt disponibles 3 » du pool de réactivation — dit
 * déjà ce qu'il compte : son voisin le nomme. Confondre les deux ferait de
 * cette garde une opinion sur les onglets, ce qu'elle n'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EXIGE
 * ─────────────────────────────────────────────────────────────────────────
 *  1. l'expression de la pastille passe par le dictionnaire (`t(`) — un libellé
 *     écrit en dur manquerait une langue sur deux ;
 *  2. elle ne contient AUCUN nombre interpolé nu (`{total}`, `{count}`,
 *     `{x.length}`) : c'est la forme exacte du défaut.
 *
 * ⚠️ Elle retire les commentaires avant de lire — un docblock qui cite
 * `{total}` la ferait tomber (défaut payé sur GA-08, GA-19, GA-25).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const FEATURE_DIR = join(WEB_SRC, 'features', 'consultants')
const FR = join(WEB_SRC, 'i18n', 'locales', 'fr', 'consultants.json')
const EN = join(WEB_SRC, 'i18n', 'locales', 'en', 'consultants.json')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function tsxFiles(dir: string = FEATURE_DIR): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...tsxFiles(path))
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) found.push(path)
  }
  return found
}

/**
 * L'expression passée à `pageTitleBadge={…}`, accolades ÉQUILIBRÉES.
 *
 * ⚠️ Un découpage à la première `}` s'arrêterait au milieu de
 * `<Badge>{total}</Badge>` — c'est-à-dire exactement sur la partie qu'on
 * cherche à juger.
 */
function pageTitleBadges(source: string): string[] {
  const clean = stripComments(source)
  const found: string[] = []
  const marker = 'pageTitleBadge={'
  let from = clean.indexOf(marker)
  while (from !== -1) {
    let depth = 0
    let index = from + marker.length - 1
    for (; index < clean.length; index += 1) {
      if (clean[index] === '{') depth += 1
      else if (clean[index] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    found.push(clean.slice(from + marker.length, index))
    from = clean.indexOf(marker, index)
  }
  return found
}

/** Un nombre interpolé sans un mot autour : `{total}`, `{rows.length}`. */
function bareCounts(expression: string): string[] {
  return [...expression.matchAll(/\{\s*(?:total|count|[A-Za-z_$][\w$.]*\.length)\s*\}/g)].map(match => match[0])
}

/** La pastille dit-elle quelque chose, ou seulement un nombre ? */
function isMute(expression: string): boolean {
  return !/\bt\(/.test(expression) || bareCounts(expression).length > 0
}

describe('GA-121 — la garde lit bien quelque chose', () => {
  it('le corpus existe et porte des pastilles d’entête', () => {
    for (const file of [FR, EN]) expect(existsSync(file), `corpus introuvable : ${file}`).toBe(true)
    const badges = tsxFiles().flatMap(file => pageTitleBadges(readFileSync(file, 'utf8')))
    // Deux au 30/08 : le compteur du vivier et la nature de la fiche. Sans cette
    // borne, un extracteur cassé rendrait « 0 pastille muette » et passerait au
    // vert pour toujours.
    //
    // ⚠️ 2 → 1 le 26/10/2026 (vague IX, #4576, maquette Théo) : la puce de NATURE
    // (« Consultant » / « Candidat ») a été RETIRÉE de la coque de la fiche talent
    // à dessein — la nature se dit une seule fois, dans la ligne d'identité de
    // l'en-tête, et `TalentDetailPage.theo-layout.test.ts` garde ce retrait (avec
    // son test « sait dire NON »). Il ne reste donc qu'une pastille d'entête dans
    // le corpus, celle du vivier. La borne garde son rôle — prouver que
    // l'extracteur lit quelque chose — et les trois tests « sait dire NON »
    // ci-dessous prouvent qu'il reconnaît la forme du défaut sans dépendre du
    // corpus. On ne la remonte pas : on ne remet pas une puce retirée exprès.
    expect(badges.length, 'aucune pastille d’entête trouvée dans le vivier').toBeGreaterThanOrEqual(1)
  })
})

describe('GA-121 — la garde sait dire NON', () => {
  it('repère la forme EXACTE qui posait le défaut', () => {
    const faulty = 'pageTitleBadge={total > 0 ? <Badge variant="outline">{total}</Badge> : undefined}'
    // L'extraction ne s'arrête pas au premier `}` : elle voit bien le `{total}`.
    expect(pageTitleBadges(faulty)).toEqual(['total > 0 ? <Badge variant="outline">{total}</Badge> : undefined'])
    expect(bareCounts(pageTitleBadges(faulty)[0] ?? '')).toEqual(['{total}'])
    expect(isMute(pageTitleBadges(faulty)[0] ?? '')).toBe(true)
    // Les autres formes du même défaut.
    expect(isMute('<Badge>{rows.length}</Badge>')).toBe(true)
    expect(isMute('<Badge>{count}</Badge>')).toBe(true)
    // Un libellé écrit en dur passe le compteur mais manque une langue.
    expect(isMute('<Badge>3 profils</Badge>')).toBe(true)
  })

  it('laisse passer la forme corrigée, et lit les commentaires comme des commentaires', () => {
    expect(isMute('<Badge variant="outline">{t(\'count.all\', { count: total })}</Badge>')).toBe(false)
    expect(isMute('<Badge variant="info">{t(`kind.${talent.kind}`)}</Badge>')).toBe(false)
    // Un exemple fautif CITÉ dans un commentaire n'est pas une pastille rendue.
    expect(pageTitleBadges('/* avant : pageTitleBadge={<Badge>{total}</Badge>} */')).toEqual([])
  })
})

describe('GA-121 — aucune pastille d’entête ne compte en silence', () => {
  it('chaque pastille du vivier dit ce qu’elle porte', () => {
    // Si ce test tombe : ta pastille affiche un nombre que personne ne peut
    // interpréter. La forme du produit est « 3 alertes » / « 4 contrôles à
    // traiter » — un nombre ET le nom de ce qu'il compte, par le dictionnaire.
    const mute = tsxFiles().flatMap(file =>
      pageTitleBadges(readFileSync(file, 'utf8'))
        .filter(isMute)
        .map(expression => `${file} → ${expression}`),
    )
    expect(mute, `pastilles muettes :\n${mute.join('\n')}`).toEqual([])
  })
})

describe('GA-121 — le compteur nomme sa population dans les deux langues', () => {
  it.each(['fr', 'en'])('%s distingue « au vivier » de « trouvés »', lang => {
    // `total` est le compte de la RECHERCHE COURANTE : sous un filtre, écrire
    // « au vivier » serait un compteur qui ment sur sa population.
    const dict = JSON.parse(readFileSync(lang === 'fr' ? FR : EN, 'utf8')) as {
      count?: Record<string, string>
    }
    const count = dict.count ?? {}
    for (const key of ['all', 'all_other', 'filtered', 'filtered_other']) {
      expect(count[key] ?? '', `count.${key} manquant en ${lang}`).toContain('{{count}}')
    }
    expect(count['all']).not.toBe(count['filtered'])
  })
})
