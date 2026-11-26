import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-329 — #1946.17 / #1946.18 / #1946.19 : « NE PAS OPTIMISER UNIQUEMENT le
 * nombre de messages, le temps passé, le nombre de notifications. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RÈGLE DIT, ET CE QU'ELLE NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit PAS « n'affiche jamais un volume ». Un volume d'envois est une
 * information opérationnelle légitime — il explique une facture, il situe une
 * équipe. Elle dit « uniquement » : un volume laissé SEUL devient la cible, et
 * une cible de volume se tient toujours, en envoyant plus. C'est la mécanique
 * de Goodhart, et elle se joue à l'endroit précis où l'opérateur regarde :
 * la rangée de tuiles en haut d'un écran.
 *
 * La garde encode donc l'accompagnement : **partout où le back-office montre
 * un volume d'ACTIVITÉ, il montre aussi, dans le même écran, ce que cette
 * activité a PRODUIT.** Aujourd'hui « Messages envoyés » voisine « Taux
 * réponse » sur les deux écrans qui l'affichent ; retirer le second ferait du
 * premier un objectif, et c'est exactement ce que #1946 refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN REGISTRE PLUTÔT QU'UN DÉCOUPAGE DE JSX
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le volume et son résultat sont dans la MÊME rangée de tuiles » ne se lit
 * pas dans du JSX sans reconnaître une rangée — et ce dépôt a déjà payé six
 * gardes borgnes à des extracteurs de balises trop confiants. Le registre
 * ci-dessous nomme donc, pour chaque volume, le fichier qui le REND et le
 * résultat qui doit y figurer. Deux assertions le tiennent : aucun volume
 * non déclaré n'apparaît dans le back-office (le balayage), et chaque volume
 * déclaré a son résultat dans son fichier (la lecture).
 *
 * ⚠️ Le vocabulaire vit dans `teams/strings.ts`, pas dans les pages : un
 * balayage limité aux `.tsx` aurait été VERT en ne voyant rien. Le corpus
 * couvre les `.ts` et les `.tsx`, et le test « LIT quelque chose » le prouve
 * en exigeant l'occurrence connue.
 */

const APP = join(__dirname, '..', 'app')

/**
 * Les trois volumes que #1946 nomme, écrits comme un écran français les écrit.
 * Le nombre de notifications et le temps passé n'apparaissent nulle part
 * aujourd'hui : les motifs sont là pour le jour où ils apparaîtront.
 */
const MOTIFS_DE_VOLUME: ReadonlyArray<readonly [string, RegExp]> = [
  ['nombre de messages', /(?:nombre|volume|total)\s+(?:de\s+|d['’]\s*)?messages|messages?\s+envoy/i],
  ['temps passé', /temps\s+pass|dur[ée]e?\s+(?:de\s+)?session|temps\s+d['’]utilisation/i],
  ['nombre de notifications', /(?:nombre|volume|total)\s+(?:de\s+|d['’]\s*)?notifications|notifications?\s+envoy/i],
] as const

/**
 * Le registre : un volume, le fichier qui le montre, et le RÉSULTAT qui doit s'y
 * lire aussi. Un ajout ici est une décision — on déclare ce qui accompagne.
 */
const VOLUMES_DECLARES: ReadonlyArray<{
  readonly volume: string
  readonly source: string
  readonly renduDans: readonly string[]
  readonly resultat: string
}> = [
  {
    volume: 'Messages envoyés',
    source: 'teams/strings.ts',
    renduDans: ['teams/[id]/page.tsx', 'clients/_components/teams-panel.tsx'],
    // `STR.table.responseRate` = « Taux réponse » : ce que les envois ont produit.
    resultat: 'STR.table.responseRate',
  },
] as const

/** Tous les fichiers de source des écrans — tests exclus, ils PARLENT du sujet. */
function fichiersDEcran(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      fichiersDEcran(full, acc)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

/** Ce que la garde reproche à un texte. Isolée pour qu'on puisse lui donner un
 *  texte FABRIQUÉ et vérifier qu'elle sait dire non. */
function volumesDans(source: string): string[] {
  // `RegExp.test` sur une expression régulière RÉUTILISÉE est stateful dès que
  // le drapeau `g` traîne : on n'en met pas, et on passe par `match`.
  return MOTIFS_DE_VOLUME.filter(([, motif]) => motif.test(source)).map(([nom]) => nom)
}

describe('GA-329 — un indicateur de volume ne se lit jamais seul (#1946.17-19)', () => {
  const fichiers = fichiersDEcran(APP)

  it('LIT quelque chose — le corpus n’est pas vide, et il contient l’occurrence connue', () => {
    // Sans ces lignes, un dossier déplacé rendrait la garde verte en ne lisant
    // rien. Le témoin le plus parlant : le vocabulaire vit dans un `.ts` de
    // libellés, pas dans un `.tsx` — un corpus limité aux pages serait aveugle.
    expect(fichiers.length).toBeGreaterThan(40)
    const avecVolume = fichiers.filter(f => volumesDans(readFileSync(f, 'utf8')).length > 0)
    expect(avecVolume.map(f => f.slice(APP.length + 1).replace(/\\/g, '/'))).toContain('teams/strings.ts')
  })

  it('aucun volume d’activité n’apparaît dans le back-office sans être DÉCLARÉ ici', () => {
    const declares = new Set(VOLUMES_DECLARES.map(v => v.source))
    const nonDeclares = fichiers
      .map(f => ({
        chemin: f.slice(APP.length + 1).replace(/\\/g, '/'),
        volumes: volumesDans(readFileSync(f, 'utf8')),
      }))
      .filter(({ chemin, volumes }) => volumes.length > 0 && !declares.has(chemin))
      .map(({ chemin, volumes }) => `${chemin} → ${volumes.join(', ')}`)
    expect(nonDeclares).toEqual([])
  })

  it('chaque volume déclaré montre, dans le MÊME écran, ce que l’activité a produit', () => {
    const seuls: string[] = []
    for (const entree of VOLUMES_DECLARES) {
      for (const ecran of entree.renduDans) {
        const source = readFileSync(join(APP, ecran), 'utf8')
        if (!source.includes(entree.resultat)) {
          seuls.push(`${ecran} montre « ${entree.volume} » sans ${entree.resultat}`)
        }
      }
    }
    expect(seuls).toEqual([])
  })

  it('SAIT DIRE NON — un « nombre de messages » ajouté ailleurs est REPROCHÉ', () => {
    expect(volumesDans('<KpiTile label="Nombre de messages" value={n} />')).toEqual(['nombre de messages'])
    expect(volumesDans("cards: { volume: 'Messages envoyés' }")).toEqual(['nombre de messages'])
  })

  it('SAIT DIRE NON — le temps passé et les notifications aussi', () => {
    expect(volumesDans('<KpiTile label="Temps passé par session" value={t} />')).toEqual(['temps passé'])
    expect(volumesDans("label: 'Notifications envoyées'")).toEqual(['nombre de notifications'])
    expect(volumesDans("label: 'Nombre de notifications'")).toEqual(['nombre de notifications'])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un volume de TRAVAIL LIVRÉ reste permis', () => {
    // Le témoin des voisins légitimes : ce que #1946 vise est le volume d'une
    // SOLLICITATION (messages, notifications) ou d'une PRÉSENCE (temps passé),
    // jamais le volume de ce que le produit a livré ni ce qu'il a coûté.
    for (const permis of [
      "cards: { analyses: 'Analyses lancées' }",
      "cards: { credits: 'Crédits consommés' }",
      "table: { enriched: 'Contacts enrichis' }",
      "charts: { pipeline: 'Pipeline — comptes par statut commercial' }",
      "label: 'Réponses reçues'",
      "label: 'Espaces distincts'",
    ]) {
      expect(volumesDans(permis)).toEqual([])
    }
  })
})
