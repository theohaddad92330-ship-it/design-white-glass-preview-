import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from '@bellum/contracts'

/**
 * Le prix annoncé sur le site est celui qui est DÉBITÉ (BEL-FIX-002, dossier du 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE RÉPARE, ET SON COÛT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le site a annoncé « 1 crédit » pour une analyse de compte pendant que le code
 * en débitait **8** — dans les quatre langues, sur la page qu'on lit AVANT
 * d'acheter. L'arithmétique du malentendu : l'offre d'entrée annonce 80 crédits
 * par mois, le prospect comprend 80 analyses, le produit en délivre 10.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE SITE A DÉRIVÉ ET PAS L'APP
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/web` porte cette garde depuis des mois (`src/i18n/lexicon.test.ts`,
 * « le coût annoncé ne contredit jamais la grille »). `apps/website` n'avait
 * que `check-i18n-parity.mjs`, qui vérifie la PARITÉ des clés — quatre
 * traductions d'un même mensonge la passent au vert.
 *
 * C'est le défaut de famille n°8 du socle sous une autre forme : une
 * déclaration en langage naturel qu'aucune garde ne confronte au code. Le
 * remède n'est pas de relire le site, c'est de lui donner la même garde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE LIT LA GRILLE, ELLE NE LA RECOPIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `CREDIT_WEIGHTS` est importé. Le jour où le poids d'une analyse change, la
 * garde suit — un nombre recopié ici serait exactement le mensonge qu'elle
 * prétend empêcher, avec un cran de retard.
 */

const MESSAGES = join(__dirname, '..', 'messages')

/** Les langues servies par le site. Lues, jamais listées à la main. */
function locales(): string[] {
  return readdirSync(MESSAGES).filter(entry => !entry.startsWith('.'))
}

/** Toutes les chaînes de tous les fichiers d'une langue, avec leur chemin. */
function stringsOf(locale: string): Map<string, string> {
  const out = new Map<string, string>()
  const dir = join(MESSAGES, locale)
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json'))) {
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        out.set(path, node)
        return
      }
      if (Array.isArray(node)) {
        node.forEach((child, index) => walk(child, `${path}[${index}]`))
        return
      }
      if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
      }
    }
    walk(JSON.parse(readFileSync(join(dir, file), 'utf8')), `${locale}/${file}`)
  }
  return out
}

/**
 * Les formulations qui affirment qu'une action vaut UN crédit.
 *
 * Volontairement écrites dans les quatre langues : le défaut n'était pas
 * français, il était traduit. Une garde qui ne lirait que le français
 * laisserait passer trois quarts du site — c'est la garde borgne du socle.
 */
const ONE_CREDIT_CLAIMS: readonly RegExp[] = [
  // Une analyse / un dossier qui coûterait un crédit.
  /\banalyse[^.!?]{0,60}\b1\s+cr[ée]dit\b/i,
  /\banalysis[^.!?]{0,60}\b1\s+credit\b/i,
  /\banalyse[^.!?]{0,60}\b1\s+Guthaben\b/i,
  /\banalyse[^.!?]{0,60}\b1\s+credit\b/i,
  /\bdossier\s+complet[^.!?]{0,60}\b1\s+cr[ée]dit\b/i,
  // L'équivalence générale « une action = un crédit », sous ses formes.
  /\bune?\s+action\s*(=|vaut|co[ûu]te)\s*un\s+cr[ée]dit\b/i,
  /\bune\s+action\s*,\s*un\s+cr[ée]dit\b/i,
  /\bone\s+action\s*(=|costs|is)\s*one\s+credit\b/i,
  /\bone\s+action\s*,\s*one\s+credit\b/i,
  /\beine\s+Aktion\s*(=|kostet|ist)\s*ein\s+Guthaben\b/i,
  /\beine\s+Aktion\s*,\s*ein\s+Guthaben\b/i,
  /\b[ée]{2}n\s+actie\s*(=|kost|is)\s*[ée]{2}n\s+credit\b/i,
  /\b[ée]{2}n\s+actie\s*,\s*[ée]{2}n\s+credit\b/i,
]

/**
 * Les formulations qui affirment qu'une analyse est GRATUITE.
 *
 * ⚠️ C'est l'autre moitié du même défaut, et elle a survécu deux mois de plus.
 * La garde interdisait « une analyse = 1 crédit » ; la page produit écrivait
 * « L'analyse est incluse — sans consommer de crédit », dans les quatre
 * langues. Zéro n'est pas un, donc rien ne se déclenchait. Le contrat que
 * signe le client dit pourtant l'inverse : « chaque analyse consomme un nombre
 * déterminé de crédits » (CGV, § Système de crédits) — et le code en débite 8.
 *
 * Trouvé par la passe B (archive 07, item 15) : « Les CGV contredisent la page
 * de vente, sur le point le plus cher. »
 *
 * Ne PAS confondre avec trois voisins qui sont VRAIS :
 *   — « Inclus · 0 crédit » du copilote, des exports et de la veille
 *     (`CREDIT_WEIGHTS` les met bien à 0) ;
 *   — « Crédits d'analyse et d'enrichissement inclus », qui parle du QUOTA
 *     compris dans l'abonnement, pas du prix de l'analyse ;
 *   — « Une analyse de compte coûte 8 crédits, tout le reste est inclus »,
 *     où le « inclus » porte sur le reste.
 *
 * D'où la forme des motifs : l'analyse doit être le SUJET de la gratuité —
 * « l'analyse EST incluse » — dans une fenêtre courte, et non « analyse »
 * suivie n'importe où d'un « inclus ». Les trois voisins ci-dessus sont
 * vérifiés en test : une garde qui les casserait forcerait à réécrire du texte
 * juste, et finirait désactivée.
 *
 * `analys\w*` sans limite de mot à gauche : le néerlandais écrit
 * « accountanalyse » en un seul mot, et `\banalyse\b` ne l'aurait jamais vu.
 */
const FREE_ANALYSIS_CLAIMS: readonly RegExp[] = [
  /analys\w*[^.!?]{0,20}\b(?:est|sont)\b[^.!?]{0,20}\b(?:incluses?|comprises?|gratuites?|offertes?)\b/i,
  /analys\w*[^.!?]{0,20}\bis\b[^.!?]{0,20}\b(?:included|free)\b/i,
  /analys\w*[^.!?]{0,20}\bist\b[^.!?]{0,20}\b(?:inklusive|inbegriffen|enthalten|kostenlos|gratis)\b/i,
  /analys\w*[^.!?]{0,20}\bis\b[^.!?]{0,20}\b(?:inbegrepen|gratis)\b/i,
  /analys\w*[^.!?]{0,60}\bsans\s+(?:consommer|utiliser|d[ée]penser)\b/i,
  /analys\w*[^.!?]{0,60}\bwithout\s+(?:using|spending|consuming)\b/i,
  /analys\w*[^.!?]{0,60}\bohne\s+(?:Credit|Guthaben)/i,
  /analys\w*[^.!?]{0,60}\bzonder\s+credits?\b/i,
  /analys\w*[^.!?]{0,40}\b0\s*(?:cr[ée]dits?|credits?|Guthaben)\b/i,
  /analyse\s+de\s+compte\s*[—:–-]\s*incluse/i,
]

const FORBIDDEN = [...ONE_CREDIT_CLAIMS, ...FREE_ANALYSIS_CLAIMS]

function offenders(): string[] {
  const found: string[] = []
  for (const locale of locales()) {
    for (const [path, text] of stringsOf(locale)) {
      if (FORBIDDEN.some(rx => rx.test(text))) found.push(`${path} → « ${text.slice(0, 140)} »`)
    }
  }
  return found
}

describe('le prix annoncé par le site est celui qui est débité', () => {
  it('lit vraiment les messages du site — sinon la garde serait verte sur du vide', () => {
    // Sans cette assertion, un chemin cassé ferait passer tous les tests
    // suivants sur zéro fichier lu, et le cliquet ne garderait plus rien.
    const found = locales()
    expect(found.length).toBeGreaterThanOrEqual(2)
    for (const locale of found) {
      expect(stringsOf(locale).size).toBeGreaterThan(50)
    }
  })

  it('aucun libellé n’affirme qu’une analyse — ou « une action » — coûte un crédit, ni qu’elle est gratuite', () => {
    expect(
      offenders(),
      `\nUne analyse de compte complète coûte ${CREDIT_WEIGHTS.account_analysis} crédits ` +
        `(CREDIT_WEIGHTS.account_analysis), une actualisation ${CREDIT_WEIGHTS.account_refresh}, ` +
        `un enrichissement de contact ${CREDIT_WEIGHTS.contact_enrichment}.\n` +
        'Le site est la page qu’on lit AVANT d’acheter : un écart s’y découvre au débit.\n' +
        `\nLibellés fautifs :\n${offenders().join('\n')}\n`,
    ).toEqual([])
  })

  it('la grille du site cite le poids RÉEL d’une analyse', () => {
    // L'inverse du test précédent : interdire le faux ne suffit pas, encore
    // faut-il que le vrai soit écrit quelque part. Sans ça, retirer la ligne
    // entière ferait passer la garde au vert sur une page muette.
    const weight = CREDIT_WEIGHTS.account_analysis
    for (const locale of locales()) {
      const texts = [...stringsOf(locale).values()]
      const statesTheWeight = texts.some(text =>
        new RegExp(`\\b${weight}\\s+(cr[ée]dits?|credits?|Guthaben)\\b`).test(text),
      )
      expect(statesTheWeight, `La grille ${locale} n’écrit nulle part « ${weight} crédits ».`).toBe(true)
    }
  })

  it('sait dire NON — une phrase fautive réintroduite est détectée', () => {
    // Preuve qu'elle mesure : on lui soumet exactement la phrase qui était en
    // ligne dans les quatre langues, et elle doit la reconnaître.
    const wasOnline = [
      'Analyse de compte complète — 1 crédit',
      'Une action vaut un crédit, tout le reste est inclus.',
      'One action costs one credit — everything else is included.',
      'Eine Aktion kostet ein Guthaben — alles andere ist inklusive.',
      'Eén actie kost één credit — al het andere zit erbij.',
    ]
    for (const phrase of wasOnline) {
      expect(
        FORBIDDEN.some(rx => rx.test(phrase)),
        `Non détecté : « ${phrase} »`,
      ).toBe(true)
    }
  })

  it('sait dire NON — « l’analyse est incluse », qui était en ligne en quatre langues, est détectée', () => {
    // Les quatre `product.analysis.desc` tels qu'ils étaient publiés, verbatim.
    const wasOnline = [
      "Obtenez une vue claire du potentiel, des enjeux et des signaux utiles avant de mobiliser votre temps. L'analyse est incluse - sans consommer de crédit.",
      'Get a clear view of the potential, the stakes and the useful signals before committing your time. The analysis is included - without using a credit.',
      'Verschaffen Sie sich ein klares Bild von Potenzial, Herausforderungen und relevanten Signalen, bevor Sie Ihre Zeit investieren. Die Analyse ist inklusive - ohne Credit-Verbrauch.',
      'Krijg een helder beeld van het potentieel, de uitdagingen en de nuttige signalen vóór je je tijd investeert. De analyse is inbegrepen - zonder credits te verbruiken.',
      'Analyse de compte — Incluse · 0 crédit',
    ]
    for (const phrase of wasOnline) {
      expect(
        FREE_ANALYSIS_CLAIMS.some(rx => rx.test(phrase)),
        `Non détecté : « ${phrase} »`,
      ).toBe(true)
    }

    // …et elle ne crie pas sur ce qui est VRAI. Sans ces cas, la garde
    // forcerait à réécrire du texte juste — et finirait désactivée.
    const trueClaims = [
      'Copilote IA & messages — Inclus · 0 crédit',
      'Poser une question sur un compte ou préparer un message ne coûte aucun crédit.',
      'AI copilot & messages — Included · 0 credits',
      'Une analyse de compte complète coûte 8 crédits, annoncés avant le clic.',
      'A full account analysis costs 8 credits — everything else is included.',
      'One unit: the credit. A full account analysis costs 8, an enrichment 1, the copilot is included.',
      "Crédits d'analyse et d'enrichissement inclus",
      'Analysis and enrichment credits included',
      'Analyse- und Anreicherungs-Credits inklusive',
      'Analyse- en verrijkingscredits inbegrepen',
    ]
    for (const phrase of trueClaims) {
      expect(
        FORBIDDEN.some(rx => rx.test(phrase)),
        `Faux positif : « ${phrase} »`,
      ).toBe(false)
    }
  })
})
