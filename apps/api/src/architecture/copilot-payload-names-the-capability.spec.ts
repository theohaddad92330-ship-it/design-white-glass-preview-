import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-69 — la charge utile que Laura reçoit nomme la CAPACITÉ, pas l'éditeur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET POURQUOI TROIS GARDES L'ONT LAISSÉ PASSER
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette live du 29/08/2026, espace RÉEL, question posée mot pour mot : « Qui
 * je n'ai pas relancé depuis 6 mois ? ». Laura répond, sur `search_dormant_
 * network` :
 *
 *     « Jean-Sébastien B. — Group CIO — LinkedIn disponible, email absent »
 *
 * Personne n'a écrit cette phrase. Le pont copilote renvoyait
 * `has_linkedin: true`, et le modèle a fait ce qu'un modèle fait : il a
 * reformulé le nom du champ. Trois gardes existaient, et aucune ne pouvait
 * voir ça :
 *
 *   - `test_copilote_prompt_blocks.py` lit le PROMPT système. Le prompt était
 *     juste : « tu nommes les capacités […], jamais les produits derrière »
 *     (`bellum_advisor.py:145`). Un prompt juste ne survit pas à une donnée qui
 *     le contredit — le modèle lit les deux, et la donnée est plus concrète.
 *   - `tool-capability-digest.spec.ts` lit le DIGEST des outils connectés. Le
 *     réseau dormant n'est pas un outil connecté, c'est une lecture de la base.
 *   - `GA-44` (`apps/web/src/architecture/no-vendor-names-in-app.test.ts`) lit
 *     `apps/web/src` et `packages/contracts`. Le pont vit dans `apps/api`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REGARDE QUE LES AUTRES NE REGARDENT PAS : LES NOMS DE CHAMPS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-44 ne compte QUE les littéraux affichés — et elle a raison de le faire :
 * renommer `apolloEnrichment` ne change rien pour un utilisateur, et une garde
 * qui exige du travail sans effet finit désactivée.
 *
 * Pour un MODÈLE, la distinction n'existe pas. `{"has_linkedin": true}` est du
 * texte, au même titre qu'un libellé. C'est la raison d'être de cette garde :
 * sur le chemin du copilote, un nom de champ EST une chaîne affichée.
 *
 * Elle balaie donc le fichier entier, commentaires retirés — identifiants
 * compris.
 */

const BRIDGE_DIR = join(__dirname, '../modules/copilot-bridge')

/**
 * Les éditeurs, tels qu'ils s'écrivent — et tels qu'un nom de champ les écrit.
 *
 * ⚠️ Chaque entrée porte ses formes : un champ s'appelle `has_linkedin`, pas
 * `has_LinkedIn`. Chercher la seule forme d'affichage aurait produit une garde
 * verte sur le défaut qu'elle est née pour attraper.
 */
const VENDOR_FORMS: ReadonlyArray<{ vendor: string; forms: readonly string[] }> = [
  { vendor: 'LinkedIn', forms: ['linkedin'] },
  { vendor: 'HubSpot', forms: ['hubspot'] },
  { vendor: 'Salesforce', forms: ['salesforce'] },
  { vendor: 'Pipedrive', forms: ['pipedrive'] },
  { vendor: 'Attio', forms: ['attio'] },
  { vendor: 'Apollo', forms: ['apollo'] },
  { vendor: 'Dropcontact', forms: ['dropcontact'] },
  { vendor: 'SalesQL', forms: ['salesql'] },
  { vendor: 'Hunter.io', forms: ['hunter.io', 'hunter_io'] },
  { vendor: 'Lusha', forms: ['lusha'] },
  { vendor: 'Kaspr', forms: ['kaspr'] },
  { vendor: 'FullEnrich', forms: ['fullenrich'] },
  { vendor: 'Pappers', forms: ['pappers'] },
  { vendor: 'Firecrawl', forms: ['firecrawl'] },
  { vendor: 'Serper', forms: ['serper'] },
  { vendor: 'Tavily', forms: ['tavily'] },
  { vendor: 'Slack', forms: ['slack'] },
  { vendor: 'BoondManager', forms: ['boondmanager'] },
  { vendor: 'Aircall', forms: ['aircall'] },
  { vendor: 'Ringover', forms: ['ringover'] },
  { vendor: 'Yousign', forms: ['yousign'] },
  { vendor: 'DocuSign', forms: ['docusign'] },
]

/**
 * Ce qui, dans le pont, a le droit de nommer un éditeur.
 *
 * ⚠️ Ces exceptions ne sont PAS des surfaces d'action au sens de GA-44 : rien
 * ici n'atteint un humain. Ce sont des lectures de COLONNE — le pont doit bien
 * lire `contact.linkedin_url` quelque part pour savoir si la personne est
 * joignable. Ce qui compte est que le nom de colonne ne RESSORTE pas dans la
 * charge utile.
 *
 * Cette liste ne peut que RÉTRÉCIR, et chaque entrée dit ce qui a été vérifié.
 */
const READS_A_COLUMN: ReadonlyArray<{ fragment: string; why: string }> = [
  {
    fragment: 'contact.linkedin_url !== null',
    why: "Lecture de la colonne `contacts.linkedin_url` pour répondre « cette personne est-elle joignable ». Le résultat sort sous `has_network_profile` : la colonne est lue, son nom ne voyage pas. Mesuré le 29/08/2026 — c'est la ligne exacte qui produisait « LinkedIn disponible » dans la bouche de Laura quand elle s'appelait `has_linkedin`.",
  },
  {
    fragment: "row.linkedin_url ? 'professional_network' : null",
    why: "Même lecture, même colonne, sur l'endpoint `account/contacts` de #2623.1 (les contacts d'un compte rendus à la conversation) : `contacts.linkedin_url` sert à dire QUEL canal est connu pour ce contact. La valeur qui part au modèle est `professional_network` — la capacité, jamais l'éditeur — et c'est déjà le mot employé par la description de l'outil `get_account_contacts` (« email, réseau professionnel, téléphone »). Mesuré le 20/09/2026 à la fusion de la vague AB : la branche écrivait `'linkedin'` en clair, ce que GA-69 a attrapé.",
  },
]

function bridgeFiles(): string[] {
  const out: string[] = []
  for (const entry of readdirSync(BRIDGE_DIR)) {
    const full = join(BRIDGE_DIR, entry)
    if (statSync(full).isDirectory()) {
      for (const nested of readdirSync(full)) {
        if (/\.ts$/.test(nested) && !/\.spec\.ts$/.test(nested)) out.push(join(full, nested))
      }
      continue
    }
    if (/\.ts$/.test(entry) && !/\.spec\.ts$/.test(entry)) out.push(full)
  }
  return out.sort()
}

/**
 * Retire les commentaires — un docblock qui EXPLIQUE la règle la cite.
 *
 * ⚠️ Le `[^:]` du commentaire de ligne évite de couper une URL (`https://…`).
 * C'est le même découpage que GA-44, volontairement : deux découpages
 * différents pour le même besoin divergent, et l'un des deux devient faux.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Ce qui reste une fois retirées les lectures de colonne déclarées. */
function scannable(source: string): string {
  let out = stripComments(source)
  for (const { fragment } of READS_A_COLUMN) out = out.split(fragment).join('')
  return out
}

/** Ce que le pont enverrait aujourd'hui au modèle en nommant un éditeur. */
function vendorNamesOnTheBridge(): string[] {
  const found: string[] = []
  for (const file of bridgeFiles()) {
    const haystack = scannable(readFileSync(file, 'utf8')).toLowerCase()
    for (const { vendor, forms } of VENDOR_FORMS) {
      for (const form of forms) {
        if (haystack.includes(form)) found.push(`${file.slice(file.indexOf('/src'))} → ${vendor} (« ${form} »)`)
      }
    }
  }
  return [...new Set(found)].sort()
}

describe('GA-69 — le pont copilote nomme la capacité, pas l’éditeur', () => {
  it('LIT quelque chose — le corpus du pont n’est pas vide', () => {
    // Un chemin renommé rendrait la garde verte sur du vide. Elle est née d'un
    // défaut ; elle doit prouver qu'elle regarde encore là où il était.
    const files = bridgeFiles()
    expect(files.length).toBeGreaterThanOrEqual(2)
    const controller = files.find(f => f.endsWith('copilot-bridge.controller.ts'))
    expect(controller).toBeTruthy()
    const source = readFileSync(controller as string, 'utf8')
    expect(source.length).toBeGreaterThan(10_000)
    // …et elle lit bien l'endpoint où le défaut vivait.
    expect(source).toContain("@Post('contacts/dormant')")
  })

  it('chaque lecture de colonne dérogée porte sa raison ÉCRITE, et existe encore', () => {
    const corpus = bridgeFiles()
      .map(f => readFileSync(f, 'utf8'))
      .join('\n')
    for (const { fragment, why } of READS_A_COLUMN) {
      expect(why.length).toBeGreaterThan(80)
      // Une dérogation à un code qui n'existe plus est une dérogation qui
      // s'élargit toute seule. (`expect` de Jest ne prend qu'un argument — le
      // fragment est donc nommé dans le message, pas passé en second.)
      if (!corpus.includes(fragment)) {
        throw new Error(`READS_A_COLUMN déroge à un code absent du pont : « ${fragment} ». Retire la dérogation.`)
      }
    }
  })

  it('aucun nom d’éditeur ne part vers le modèle', () => {
    const offenders = vendorNamesOnTheBridge()
    if (offenders.length > 0) {
      throw new Error(
        `Le pont copilote envoie un nom d'éditeur au modèle :\n  ${offenders.join('\n  ')}\n` +
          `Un NOM DE CHAMP compte : le modèle reformule « has_linkedin » en « LinkedIn disponible ».\n` +
          `Nomme la capacité (« has_network_profile », « réseau professionnel »).\n` +
          `Une lecture de colonne qui ne ressort pas dans la charge utile se déclare dans READS_A_COLUMN.`,
      )
    }
    expect(offenders).toEqual([])
  })

  it('sait dire NON — sur un LITTÉRAL comme sur un NOM DE CHAMP', () => {
    // Les deux moitiés, parce que c'est la seconde qui manquait : GA-44 ne
    // compte que les littéraux affichés, et `has_linkedin` n'en est pas un.
    const champ = `return { has_linkedin: contact.linkedin_url !== null }`
    const litteral = `return { source: 'LinkedIn' }`
    const sain = `return { has_network_profile: contact.linkedin_url !== null }`

    const scan = (src: string) => {
      const haystack = scannable(src).toLowerCase()
      return VENDOR_FORMS.filter(v => v.forms.some(f => haystack.includes(f))).map(v => v.vendor)
    }
    expect(scan(champ)).toEqual(['LinkedIn'])
    expect(scan(litteral)).toEqual(['LinkedIn'])
    // Le sain ne passe QUE parce que sa lecture de colonne est déclarée : la
    // dérogation est le seul chemin vert, et elle est nommée.
    expect(scan(sain)).toEqual([])
    // …et sans la dérogation, la même ligne serait rouge — preuve que le vert
    // ci-dessus vient de la liste, pas d'un trou du détecteur.
    expect(stripComments(sain).toLowerCase()).toContain('linkedin')
  })
})
