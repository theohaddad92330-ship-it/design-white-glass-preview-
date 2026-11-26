import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1642 — « Les couleurs viennent EXCLUSIVEMENT des tokens existants », et
 * « une couleur qui ne soit pas un token » est un INTERDIT, pas une préférence.
 *
 * La règle est déjà tenue à 96 % : 462 `var(--token)` dans les `.tsx` contre
 * 20 littéraux hexadécimaux, dont un faux positif. Ce n'est donc pas un
 * chantier de nettoyage, c'est un CLIQUET — on empêche le 21e.
 *
 * POURQUOI UNE LISTE NOMMÉE ET PAS UN COMPTE
 * Un compte plafonné laisse passer l'échange : retirer une couleur ici et en
 * ajouter une là garde le total, et la garde reste verte pendant que le défaut
 * entre. Une liste par FICHIER et par VALEUR dit non aux deux, et elle survit
 * au déplacement d'une ligne — ce qu'un `fichier:ligne` ne fait pas.
 *
 * POURQUOI CHAQUE ENTRÉE PORTE SA RAISON
 * Sans elle, une exception se recopie. Le dépôt a déjà payé une garde qui
 * s'attrapait sur sa propre justification (GA-255) : ce qui est écrit ici est
 * lu par un humain, pas par la garde.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url))

/**
 * Les 15 littéraux hexadécimaux qui existaient au moment de poser la garde.
 * Chacun est une DETTE, sauf celui qui est marqué faux positif.
 */
const HERITAGE: Record<string, Record<string, number>> = {
  // La palette des graphiques SVG. #1643 la reprend : ces six valeurs
  // deviendront des tokens quand les graphiques passeront au design system.
  'app/_components/charts.tsx': {
    '#7c6cf6': 2,
    '#34d399': 1,
    '#fbbf24': 1,
    '#f87171': 1,
    '#60a5fa': 1,
    '#f0abfc': 1,
  },
  // Repli d'un token : `var(--danger, #c0392b)`. Le token gagne partout où il
  // est défini ; le repli ne sert que si quelqu'un le retire.
  'app/clients/_components/user-row-actions.tsx': { '#c0392b': 1 },
  'app/facturation/_components/billing-health-badge.tsx': { '#d97706': 1 },
  // Le cockpit rejoue la palette des graphiques à la main — c'est exactement
  // ce que #1642 veut supprimer en donnant un nom à ces six couleurs.
  'app/monitoring/_components/cockpit-panel.tsx': {
    '#34d399': 2,
    '#60a5fa': 1,
    '#f87171': 2,
    '#fbbf24': 2,
  },
  'app/monitoring/_components/lancer-panel.tsx': { '#6366f1': 2 },
  // ⚠️ RETIRÉ le 07/09/2026 (bis) — `app/queues/page.tsx` portait
  // `{ '#2a3040': 1 }`, le repli d'un token dans `border: 1px solid
  // var(--border, #2a3040)`. Ce repli disait quelque chose de faux : il ne
  // vaut QUE si `--border` disparaît, et `--border` est défini dans les DEUX
  // thèmes de `globals.css` — donc la valeur en dur ne se voyait jamais, sauf
  // le jour où elle se serait vue, en clair, où elle est illisible. Le lot
  // #1662 a refait cet écran au design system : les bordures passent par
  // `var(--border)` nu, dans `queues.module.css`. La dette est PAYÉE, donc
  // l'entrée part avec elle — c'est le sens de cette liste, un CONSTAT, pas
  // une dispense.
  //
  // ⚠️ RETIRÉ le 07/09/2026, et le retrait s'écrit plutôt qu'il ne se fait.
  // `app/users/[userId]/_components/impersonate.tsx` portait `{ '#1234': 1 }` —
  // un FAUX POSITIF assumé : le numéro de ticket du placeholder « reproduire
  // ticket #1234 », qu'un `#` suivi de quatre chiffres rend indiscernable d'un
  // hexadécimal. Le placeholder n'existe plus : #1670 a remplacé le champ de
  // texte libre par un `<select>` de catalogue fermé, et un `<option>` ne porte
  // pas de texte d'exemple. Il n'y a donc plus rien à excepter.
  //
  // C'est le sens de cette liste : elle est un CONSTAT, pas une dispense. Une
  // entrée dont la cause a disparu doit disparaître avec elle — la garder
  // ferait un trou par lequel une vraie couleur passerait un jour.
}

/**
 * `#` + quatre chiffres DÉCIMAUX exactement = un numéro d'issue de ce dépôt
 * (`#2130.69`, `#2154`), pas une couleur : deux intégrations rouges le
 * 28/09/2026 sur des libellés d'opérateur. Décision Louis 28/09/2026.
 * L'exemption est étroite — une lettre, ou 3/6/8 caractères, et c'est une
 * couleur (`#0af8`, `#123`, `#123456` restent attrapés).
 */
const HEX = /#(?![0-9]{4}\b)[0-9a-fA-F]{3,8}\b/g

/**
 * Les COMMENTAIRES sortent du corpus avant la mesure.
 *
 * POURQUOI — la garde attrapait ce qu'elle ne vise pas. Ce dépôt référence ses
 * décisions par leur numéro d'issue (`#1642`, `#1704`), et `#1644` est un
 * hexadécimal parfaitement valide à quatre chiffres : chaque commentaire qui
 * cite une issue rendait la garde rouge. Une garde qu'on désamorce en ajoutant
 * une exception à chaque citation cesse de garder quoi que ce soit — c'est le
 * défaut « garde borgne par exception » déjà payé ici. On corrige donc la
 * LECTURE : une couleur écrite dans un commentaire n'est servie à personne et
 * ne suit aucun thème, elle n'a jamais été le sujet.
 *
 * ⚠️ Seules les lignes qui COMMENCENT par `//` sont retirées, pas celles où
 * `//` apparaît en cours de ligne : `https://github.com/…` en contient un, et
 * couper là masquerait tout ce qui suit sur la même ligne — une vraie couleur y
 * passerait inaperçue. Les blocs `/* … *\/`, eux, se retirent entiers.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

function fichiersTsx(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersTsx(chemin, out)
    else if (entree.endsWith('.tsx')) out.push(chemin)
  }
  return out
}

function releve(): Record<string, Record<string, number>> {
  const trouve: Record<string, Record<string, number>> = {}
  for (const chemin of fichiersTsx(SRC)) {
    const contenu = sansCommentaires(readFileSync(chemin, 'utf8'))
    // ⚠️ `HEX` porte le drapeau `g`, donc `.test()` serait STATEFUL d'un appel
    // à l'autre. `match` rend un tableau et ne garde aucun curseur.
    const trouvailles = contenu.match(HEX)
    if (!trouvailles) continue
    const cle = relative(SRC, chemin)
    trouve[cle] = {}
    for (const valeur of trouvailles) {
      const normalise = valeur.toLowerCase()
      trouve[cle][normalise] = (trouve[cle][normalise] ?? 0) + 1
    }
  }
  return trouve
}

describe('les couleurs du back-office passent par un token (#1642)', () => {
  it('LIT quelque chose — le corpus de .tsx n’est pas vide', () => {
    // Le contrôle positif. Sans lui, un `SRC` faux rendrait une garde verte
    // qui n'a jamais ouvert un fichier — le faux zéro qui ressemble à une
    // réponse. 71 fichiers mesurés le 06/09/2026 ; le seuil est bas exprès,
    // il attrape « zéro fichier », pas une variation normale.
    expect(fichiersTsx(SRC).length).toBeGreaterThan(50)
  })

  it('LIT vraiment les couleurs — l’héritage mesuré est retrouvé', () => {
    // Deuxième contrôle positif : la garde doit RETROUVER ce qu'on sait être
    // là. Une lecture cassée rendrait un relevé vide, qui serait un
    // sous-ensemble de l'héritage et passerait le test suivant sans rien lire.
    const trouve = releve()
    expect(Object.keys(trouve).length).toBeGreaterThanOrEqual(Object.keys(HERITAGE).length)
    expect(trouve['app/_components/charts.tsx']?.['#7c6cf6']).toBe(2)
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un numéro d’issue en commentaire', () => {
    // Troisième preuve. `#1644` est un hexadécimal valide ; en commentaire,
    // c'est une référence de décision, et rien n'est peint avec.
    const enCommentaire = ['/** Le rail à 6 sections (#1644). */', '// suite de #1675', 'const a = 1']
    expect(sansCommentaires(enCommentaire.join('\n')).match(HEX)).toBeNull()
  })

  it('n’attrape PAS un numéro d’issue écrit dans un texte affiché', () => {
    // 28/09/2026 — deux intégrations rouges le même soir sur `#2154.31` et
    // `(#2130.69, …)` : des libellés d'opérateur, pas des couleurs. Quatre
    // chiffres DÉCIMAUX derrière `#` sont un numéro d'issue dans ce dépôt.
    const libelles = [
      'titre="Ouverture → compréhension (#2130.69, délai)"',
      '<p>Vocabulaire distinct de #2154.31/.32 ci-dessus</p>',
      '<h3>Conditions propres à #2208 (n° 2958.94)</h3>',
    ]
    expect(sansCommentaires(libelles.join('\n')).match(HEX)).toBeNull()
  })

  it('dit NON à une couleur à quatre caractères dès qu’elle porte une lettre ou n’a pas quatre chiffres', () => {
    // L'exemption ne couvre QUE quatre chiffres décimaux : `#fff`, `#0af8`,
    // `#123` et `#123456` restent des couleurs.
    const couleurs = "const a = '#fff'; const b = '#0af8'; const c = '#123'; const d = '#123456'"
    expect(sansCommentaires(couleurs).match(HEX)).toEqual(['#fff', '#0af8', '#123', '#123456'])
  })

  it('dit NON à une vraie couleur, commentaires retirés ou non', () => {
    // Deuxième preuve, celle qui compte : la garde sait toujours dire NON.
    const enCode = "const style = { color: '#8071f6' } // teinte d’accent"
    expect(sansCommentaires(enCode).match(HEX)).toEqual(['#8071f6'])
    // Et un `//` en cours de ligne ne fait pas disparaître ce qui le suit.
    const avecUrl = 'const u = "https://x.test"; const c = "#abcdef"'
    expect(sansCommentaires(avecUrl).match(HEX)).toEqual(['#abcdef'])
  })

  it('dit NON à toute couleur hexadécimale nouvelle', () => {
    const trouve = releve()
    const nouvelles: string[] = []

    for (const [fichier, valeurs] of Object.entries(trouve)) {
      for (const [valeur, compte] of Object.entries(valeurs)) {
        const permis = HERITAGE[fichier]?.[valeur] ?? 0
        if (compte > permis) {
          nouvelles.push(`${fichier} — ${valeur} × ${compte} (héritage : ${permis})`)
        }
      }
    }

    expect(
      nouvelles,
      [
        'Une couleur écrite en dur ne suit pas le thème.',
        'Elle passe par un token de globals.css — les tokens existants sont BONS,',
        'ils restent (#1642). Si la couleur manque, on lui donne un nom là-bas.',
        '',
        ...nouvelles,
      ].join('\n'),
    ).toEqual([])
  })
})
