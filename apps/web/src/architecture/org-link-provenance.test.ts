/**
 * GA-50 — un trait de l'organigramme dit d'où il vient.
 *
 * ⚠️ Numéro à vérifier à l'intégration : cinq chantiers écrivaient en parallèle
 * ⚠️ Numéro RÉSOLU à l'intégration le 28/08 : cette garde est née « GA-49 »,
 * comme celle de l'annonce de coût (`enrich-debit-announced.test.ts`), écrite
 * en parallèle dans un autre worktree. Deux gardes portaient le même numéro
 * pendant une heure. Celle-ci devient GA-50 ; l'autre garde GA-49, parce
 * qu'elle a été mergée la première.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * La carte d'influence est le rendu PRINCIPAL de l'organigramme dès que le
 * dossier porte une structure d'entités. Elle dessinait ses rattachements avec
 * un seul signal : `border-dashed` contre `border-solid`, sur un `<span
 * aria-hidden>`. Trois conséquences mesurées :
 *
 *   · un rattachement DEVINÉ et un rattachement PROUVÉ n'étaient distingués que
 *     par un motif de bordure — rien pour un lecteur d'écran, rien sur une
 *     impression en niveaux de gris ;
 *   · le trait ne citait JAMAIS sa source, même quand le graphe en portait une
 *     (le modèle du trait n'avait tout simplement pas de champ pour ça) ;
 *   · le trait qui descendait vers une zone blanche était PLEIN, donc lu comme
 *     un rattachement établi sous un poste que personne n'a encore trouvé.
 *
 * Ce que cette garde tient : chaque trait DÉCLARE son origine explicitement, et
 * les mots de cette déclaration existent dans les DEUX langues. Elle ne vérifie
 * pas le rendu — c'est le travail de `OrgInfluenceMap.test.tsx` ; elle vérifie
 * qu'on ne peut pas rajouter un trait muet sans que la CI le voie.
 *
 * ⚠️ Elle retire les commentaires avant de lire. Un docblock qui EXPLIQUE la
 * règle en citant `<Rail height={18} />` la ferait tomber, et la seule façon de
 * documenter le choix deviendrait de ne pas le documenter (défaut payé sur
 * GA-08, GA-19 et GA-25).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const ORG_DIR = join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'organigramme')
const MAP_FILE = join(ORG_DIR, 'OrgInfluenceMap.tsx')
const MODEL_FILE = join(ORG_DIR, 'orgInfluenceMapData.ts')
const FR = join(WEB_SRC, 'i18n', 'locales', 'fr', 'accountOrg.json')
const EN = join(WEB_SRC, 'i18n', 'locales', 'en', 'accountOrg.json')

/** Les états qu'un trait a le droit de déclarer. Le pendant en code est
 *  `OrgLinkOrigin` + les deux replis explicites de `<Rail>`. */
const LINK_KEYS = ['sourced', 'structure', 'assumedUnsourced', 'assumedSupported', 'gap'] as const

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les balises `<Rail …>` d'un source, commentaires retirés.
 *
 * ⚠️ Le découpage s'arrête au premier `>` de PREMIER NIVEAU : `origin="gap"` et
 * `link={linkTo.get(person.id)}` contiennent l'un des caractères qu'un
 * découpage naïf prend pour la fin de balise (`=>` dans une flèche). On lit donc
 * jusqu'au `/>` — c'est la forme que prennent les quatre appels réels.
 */
function railTags(source: string): string[] {
  return [...stripComments(source).matchAll(/<Rail\b[\s\S]*?\/>/g)].map(match => match[0])
}

/** Un appel qui ne déclare pas son origine : ni `origin=`, ni `link=`. */
function isMute(tag: string): boolean {
  return !/\borigin=/.test(tag)
}

describe('GA-50 — la garde lit bien quelque chose', () => {
  it('les fichiers gardés existent', () => {
    // Un chemin devenu faux rendrait « 0 trait muet » et passerait au vert pour
    // toujours — c'est le faux zéro silencieux, pas une preuve.
    for (const file of [MAP_FILE, MODEL_FILE, FR, EN]) {
      expect(existsSync(file), `corpus introuvable : ${file}`).toBe(true)
    }
  })

  it('elle trouve les traits réellement dessinés', () => {
    // Quatre appels au 28/08 : la rangée racine, la colonne d'une entité, une
    // personne, une zone blanche. La borne basse est là pour qu'un extracteur
    // cassé ne se lise pas « rien à garder ».
    expect(railTags(readFileSync(MAP_FILE, 'utf8')).length).toBeGreaterThanOrEqual(4)
  })
})

describe('GA-50 — la garde sait dire NON', () => {
  it('repère le trait muet que la carte dessinait, et laisse passer celui qui parle', () => {
    // La forme EXACTE qui posait le défaut : le trait d'une zone blanche.
    expect(isMute('<Rail height={18} />')).toBe(true)
    expect(isMute('<Rail height={18} origin="gap" />')).toBe(false)
    expect(isMute('<Rail height={18} link={linkTo.get(person.id)} origin="assumed" />')).toBe(false)
  })

  it('ne se laisse pas couper par la flèche d’un accesseur, ni tromper par un commentaire', () => {
    const withArrow = '<Rail height={14} link={view.links.find(l => l.toId === id)} origin="layout" />'
    expect(railTags(withArrow)).toEqual([withArrow])
    // Un exemple cité dans un docblock ne compte pas comme un trait dessiné.
    expect(railTags('/* exemple fautif : <Rail height={18} /> */')).toEqual([])
    expect(railTags('// avant : <Rail height={18} />')).toEqual([])
  })
})

describe('GA-50 — un trait déclare son origine', () => {
  it('aucun trait de la carte n’est dessiné sans dire ce qu’il affirme', () => {
    // Si ce test tombe : ton `<Rail>` ne dit pas s'il matérialise un
    // rattachement PROUVÉ, une HYPOTHÈSE, la structure du groupe, ou rien du
    // tout. Le repli « plein » n'existe pas — un trait qu'on ne sait pas
    // justifier ne se dessine pas comme un fait.
    const mute = railTags(readFileSync(MAP_FILE, 'utf8')).filter(isMute)
    expect(mute, `traits muets dans ${MAP_FILE} :\n${mute.join('\n')}`).toEqual([])
  })

  it('le modèle du trait porte ses preuves — sans champ, l’écran n’a rien à montrer', () => {
    // La cause racine tenait ici : `OrgMapLink` n'avait aucun champ de source,
    // si bien que l'écran ne POUVAIT pas citer la sienne, même en le voulant.
    const model = stripComments(readFileSync(MODEL_FILE, 'utf8'))
    expect(model).toMatch(/sources:\s*OrgSource\[\]/)
    expect(model).toMatch(/export function orgLinkOrigin\b/)
  })
})

describe('GA-50 — les mots du trait existent dans les deux langues', () => {
  it.each(['fr', 'en'])('%s porte les cinq états', lang => {
    // Une distinction annoncée dans une seule langue redevient un pointillé
    // dans l'autre.
    const dict = JSON.parse(readFileSync(lang === 'fr' ? FR : EN, 'utf8')) as {
      orgMap?: { link?: Record<string, string> }
    }
    const link = dict.orgMap?.link ?? {}
    for (const key of LINK_KEYS) {
      expect(typeof link[key], `orgMap.link.${key} manquant en ${lang}`).toBe('string')
      expect(link[key]?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })

  it('les trois états d’un rattachement portent trois textes DIFFÉRENTS', () => {
    // Le fond de l'affaire : si « sourcé » et « hypothèse » s'écrivent pareil,
    // on a rendu la couleur obligatoire à nouveau.
    for (const file of [FR, EN]) {
      const link = (JSON.parse(readFileSync(file, 'utf8')) as { orgMap: { link: Record<string, string> } }).orgMap.link
      const words = [link.sourced, link.structure, link.assumedUnsourced]
      expect(new Set(words).size, `états indistinguables dans ${file}`).toBe(3)
    }
  })
})
