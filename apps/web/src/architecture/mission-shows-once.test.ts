import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-83 — LE TIROIR ET LE DOSSIER D'UNE MISSION RENDENT LE MÊME COMPOSANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Loi 4 du tome 7 : « rien n'apparaît deux fois sous la même forme avec le même
 * contenu ». Une mission a maintenant DEUX formes légitimes — un tiroir, qu'on
 * ferme pour retrouver la liste qu'on lisait, et un dossier, qui se garde, se
 * partage par lien et se met en favori. Les deux formes coexistent dans la
 * matrice objet × forme ; ce qu'elles ne font pas, c'est porter deux fois le
 * même contenu.
 *
 * Le mode d'échec est lent et sûr : on ajoute une saisie dans le dossier, pas
 * dans le tiroir, et six semaines plus tard deux écrans ne disent plus la même
 * chose de la même mission. C'est exactement le défaut que `replacedFields`
 * avait déjà payé — « la recopie existait, écrite trois fois à la main ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI CE N'EST PAS UNE APPROXIMATION
 * ─────────────────────────────────────────────────────────────────────────────
 * La loi 4 en général n'est PAS gardable : reconnaître un objet métier dans du
 * JSX demanderait de deviner, et une garde qui devine accuse du code correct.
 * Celle-ci ne devine rien. Elle nomme DEUX hôtes et UN contenu, et vérifie deux
 * faits mécaniques :
 *
 *  1. les deux hôtes montent `MissionDetailTabs` ;
 *  2. AUCUN des deux n'appelle lui-même les lectures du contenu — les quatre
 *     routes d'API de la mission. Un hôte qui se remettrait à lire les scores
 *     ou les conditions serait en train de refaire un onglet chez lui.
 *
 * ⚠️ Les COMMENTAIRES sont retirés : les deux fichiers citent les quatre routes
 * dans leurs docblocks. Sans ce nettoyage la garde serait rouge sur du code
 * juste — et une garde qui crie sur du comportement correct se désactive dans
 * la semaine.
 */

const VIEWS = join(__dirname, '..', 'features', 'missions', 'view')

/** LE contenu — une mission, ses cinq onglets, à un seul endroit. */
const CONTENT = 'MissionDetailTabs'

/** Les DEUX hôtes. Ajouter une troisième forme, c'est ajouter une ligne ici. */
const HOSTS = ['MissionDetailSheet.tsx', 'MissionDossierPage.tsx'] as const

/**
 * Les lectures qui APPARTIENNENT au contenu.
 *
 * Elles sont nommées une par une plutôt que devinées : ce sont les quatre
 * routes que les onglets interrogent. Un hôte qui en appelle une refait un
 * onglet chez lui, et c'est précisément le moment où les deux formes commencent
 * à diverger.
 */
const CONTENT_READS = [
  'useMissionAssignments',
  'useMissionTerms',
  'useSetMissionTerms',
  'useMissionScores',
  'TimelinePanel',
] as const

/** ⚠️ Un docblock cite ; il ne rend rien. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function code(file: string): string {
  return stripComments(readFileSync(join(VIEWS, file), 'utf8'))
}

describe('GA-83 — une mission ne se rend qu’à un endroit', () => {
  it('LIT quelque chose — les trois fichiers existent et portent du code', () => {
    // Un chemin faux rendrait `readFileSync` bruyant, mais un fichier VIDE
    // rendrait la garde verte sur rien.
    for (const file of [...HOSTS, `${CONTENT}.tsx`]) {
      expect(code(file).length).toBeGreaterThan(500)
    }
  })

  it('le contenu LIT bien les quatre routes — preuve qu’on cherche au bon endroit', () => {
    // Si le contenu ne les portait pas, l'absence chez les hôtes ne prouverait
    // rien : on chercherait quelque chose qui n'existe nulle part.
    const content = code(`${CONTENT}.tsx`)
    for (const read of CONTENT_READS) {
      expect(content).toContain(read)
    }
  })

  it('les DEUX formes montent le même composant de contenu', () => {
    // ⚠️ `[\s/>]` et non un espace en dur : un attribut passé à la ligne suivante
    // rendrait la garde muette, et `<MissionDetailTabsAutreChose` la rendrait
    // verte sur un composant homonyme. Les deux défauts ont déjà été trouvés
    // dans ce dépôt, le second par un contrôle négatif.
    const mounted = new RegExp(`<${CONTENT}[\\s/>]`)
    for (const host of HOSTS) {
      expect(mounted.test(code(host))).toBe(true)
    }
  })

  it('aucun hôte ne refait un onglet chez lui', () => {
    const offenders = HOSTS.flatMap(host =>
      CONTENT_READS.filter(read => code(host).includes(read)).map(read => `${host} → ${read}`),
    )
    expect(offenders).toEqual([])
  })
})
