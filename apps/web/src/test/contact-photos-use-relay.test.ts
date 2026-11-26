import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { contactPhotoSrc } from '@/lib/company-logo'

/**
 * Une photo de contact passe par NOTRE origine, jamais en direct.
 *
 * Signalé en bêta : « il manque les photos de profil systématiquement, même
 * quand je clique sur Enrichir ». Les photos partaient en direct vers le
 * stockage du fournisseur depuis dix écrans, alors que les logos d'entreprise
 * passaient par le relais de l'API depuis le jour où le problème a été compris
 * — même fournisseur, même hôte, même absence de `Cache-Control`, et l'avatar
 * qui reconstruit son image à chaque montage.
 *
 * Ce défaut est muet par construction : quand la requête d'image échoue,
 * l'avatar retombe sur l'initiale, ce qui est EXACTEMENT ce qu'il affiche quand
 * il n'y a pas de photo. Rien dans l'écran ne distingue les deux, et rien dans
 * les tests non plus tant qu'on regarde le rendu.
 *
 * Le garde lit donc les sources : plus aucun écran ne doit poser un
 * `photo_url` brut dans la prop `src` d'un avatar.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * Les portes par lesquelles une photo a le droit d'atteindre un `src`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX PORTES, PARCE QUE DEUX PROBLÈMES — 01/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette garde n'en connaissait qu'une, et c'était juste tant qu'une seule
 * sorte de photo existait. Le dépôt de photo de talent en a créé une seconde,
 * et la garde a rougi sur du code correct :
 *
 *  · `contactPhotoSrc` — une photo TIERCE (fournisseur d'enrichissement,
 *    réseau professionnel). Elle est RELAYÉE par notre origine, pour que
 *    l'hôte du fournisseur n'apprenne pas qui nos utilisateurs regardent, et
 *    tout `data:` y est bloqué : on ne relaie qu'un `http(s)`.
 *
 *  · `talentPhotoSrc` — une photo déposée PAR l'utilisateur, sur SON compte,
 *    déjà validée côté serveur (`talentPhotoSchema`). Il n'y a personne à qui
 *    la cacher, donc rien à relayer ; la faire passer par le relais l'aurait
 *    fait DISPARAÎTRE en silence (il bloque les `data:`), et la fiche aurait
 *    affiché des initiales sans qu'aucune erreur ne le dise.
 *
 * ⚠️ L'invariant n'a pas bougé d'un pouce : **un `photoUrl` BRUT n'atteint
 * jamais un `src`.** Ce qui change est le nombre de portes reconnues, chacune
 * NOMMÉE avec la raison de son existence. Cette liste ne s'allonge pas sans
 * qu'on écrive pourquoi une troisième sorte de photo ne peut emprunter aucune
 * des deux premières.
 */
const VALIDATED_DOORS = ['contactPhotoSrc', 'talentPhotoSrc'] as const

/** Les lignes qui passent une photo brute en `src` d'un avatar. */
function directPhotoSources(): string[] {
  const offences: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx$/.test(entry) || /\.(test|spec)\.tsx$/.test(entry)) continue
      const source = readFileSync(full, 'utf8')
      for (const line of source.split('\n')) {
        // `src={…photo_url}` / `src={…photoUrl}` sur un avatar : la forme
        // exacte qui repartait chez le fournisseur. Une ligne qui appelle le
        // relais est la seule à avoir le droit de poser un `src` : c'est le
        // point de passage unique, pas une exception.
        if (!/src=\{[^}]*photo_?[Uu]rl/.test(line)) continue
        if (VALIDATED_DOORS.some(door => line.includes(door))) continue
        offences.push(`${full.replace(WEB_SRC, '')}: ${line.trim()}`)
      }
    }
  }
  walk(WEB_SRC)
  return offences
}

describe('les photos de contact passent par le relais', () => {
  it('aucun écran ne demande la photo en direct au fournisseur', () => {
    expect(directPhotoSources()).toEqual([])
  })

  it('le relais construit une URL sur notre origine', () => {
    const src = contactPhotoSrc('https://zenprospect-production.s3.amazonaws.com/uploads/a/photo.png')
    expect(src).toBeTruthy()
    // Ce qui compte : l'hôte du fournisseur n'est plus celui que le navigateur
    // contacte — il est devenu un paramètre de NOTRE URL.
    expect(new URL(src!).hostname).not.toBe('zenprospect-production.s3.amazonaws.com')
    expect(new URL(src!).searchParams.get('src')).toContain('photo.png')
  })

  it('la silhouette générique ne devient pas une photo — l’avatar montre l’initiale', () => {
    // L'URL EXACTE du retour bêta. Elle CHARGE : sans ce filtre, l'écran
    // affichait une image (la silhouette grise du réseau professionnel), donc
    // l'avatar ne retombait jamais sur l'initiale, et « cette personne n'a pas
    // de photo » ressemblait à « les photos sont cassées ».
    expect(contactPhotoSrc('https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2')).toBeNull()
  })

  it('une vraie photo du réseau professionnel est relayée', () => {
    const src = contactPhotoSrc('https://media.licdn.com/dms/image/v2/D4E03AQ/photo?e=1')
    expect(src).toBeTruthy()
    expect(new URL(src!).hostname).not.toBe('media.licdn.com')
    expect(new URL(src!).searchParams.get('src')).toContain('media.licdn.com')
  })

  it('la garde LIT quelque chose — le corpus d’écrans n’est pas vide', () => {
    // Un chemin faux rendrait zéro fichier, donc zéro faute, donc du vert en ne
    // regardant rien. Mesuré à plus de 400 `.tsx` le 01/09/2026.
    let count = 0
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.tsx$/.test(entry)) count += 1
      }
    }
    walk(WEB_SRC)
    expect(count).toBeGreaterThan(200)
  })

  it('la garde sait dire NON — un `photoUrl` nu dans un `src` est reconnu', () => {
    const nu = '<EntityAvatar name={n} src={row.photoUrl} />'
    const parLaPorte = '<EntityAvatar name={n} src={talentPhotoSrc(row.photoUrl)} />'
    expect(/src=\{[^}]*photo_?[Uu]rl/.test(nu)).toBe(true)
    expect(VALIDATED_DOORS.some(door => nu.includes(door))).toBe(false)
    expect(VALIDATED_DOORS.some(door => parLaPorte.includes(door))).toBe(true)
  })

  it('une photo absente ne fabrique aucune URL', () => {
    // Le garde doit distinguer « pas de photo » de « photo relayée » : sans
    // cela, l'avatar demanderait une image vide à chaque ligne sans photo.
    expect(contactPhotoSrc(null)).toBeNull()
    expect(contactPhotoSrc('')).toBeNull()
  })
})
