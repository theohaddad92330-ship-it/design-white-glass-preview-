import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-96 — **aucun chemin de rafraîchissement ne peut réécrire l'identité d'un
 * dossier existant.**
 *
 * ## Le défaut que cette garde empêche de revenir
 *
 * Mesuré en production le 30/08/2026. Le compte `6c8f4edc-…`, nommé **ROCHE**,
 * portait le SIREN `552012031` — « Commerce de gros de produits
 * pharmaceutiques », le laboratoire. Un clic sur « Actualiser l'analyse » l'a
 * renvoyé sur `/search?accountId=…&company=ROCHE`, qui a relancé une résolution
 * **par nom**. Le registre a rendu `493229280` — **ROCHE BOBOIS**, `70.10Z`, un
 * distributeur de meubles — et la phase 1 l'a estampillé sur le MÊME dossier.
 * Les contacts, les angles et les corrections manuelles du laboratoire se sont
 * retrouvés fusionnés dans la fiche d'une autre société, en silence.
 *
 * Le dépôt refuse depuis toujours d'analyser une société qu'il n'a pas
 * identifiée — c'est toute la raison de la levée d'homonymie par SIREN. La
 * garantie tombait **exactement au moment où elle était déjà acquise**.
 *
 * ## Ce que la garde vérifie, et pourquoi CES trois choses
 *
 * Le défaut avait trois complices, et une garde qui n'en couvrirait qu'un
 * laisserait les deux autres le reproduire :
 *
 *  1. **`applyResearch` doit refuser** — c'est le dernier point de passage
 *     commun à TOUS les chemins de rafraîchissement (relance depuis la fiche,
 *     depuis la liste, reprise d'un run interrompu, rafraîchissement par
 *     dimension, MCP, `force` opérateur). C'est là que le SIREN étranger
 *     s'écrivait.
 *  2. **La relance doit HÉRITER de l'identité du dossier** — sinon le run part
 *     du nom, et le refus du point 1 se déclenche à chaque rafraîchissement
 *     légitime d'homonyme, ce qui reviendrait à casser la fonction plutôt qu'à
 *     la réparer.
 *  3. **`reuseForRelaunch` ne doit POSER une identité que sur un dossier qui
 *     n'en a pas** — la serrure qui tient même si un appelant futur oublie les
 *     deux premières.
 *
 * ## Ce qu'elle ne prétend PAS faire
 *
 * Elle ne lit pas le comportement — c'est le rôle des tests de
 * `accounts.service.spec.ts` et `analysis.service.spec.ts`, qui exécutent le
 * refus. Elle garde la STRUCTURE : que les trois pièces existent et restent
 * branchées. Une garde structurelle et un test de comportement gardent deux
 * choses différentes ; supprimer l'une parce que l'autre existe est ce qui
 * fabrique les gardes borgnes du dépôt.
 *
 * ⚠️ Chaque assertion ci-dessous est précédée d'une vérification que son corpus
 * n'est PAS VIDE. Un `readFileSync` sur un chemin renommé rendrait une chaîne
 * vide, toutes les recherches échoueraient à trouver un interdit, et la garde
 * serait verte en ne lisant rien — le défaut de garde le plus fréquent du
 * dépôt.
 */

const MODULES = join(__dirname, '..', 'modules')
const ACCOUNTS_SERVICE = join(MODULES, 'accounts', 'accounts.service.ts')
const ANALYSIS_SERVICE = join(MODULES, 'analysis', 'analysis.service.ts')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Le corps d'une méthode, de sa signature à la fermeture de même indentation. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) return ''
  // On borne au prochain `\n  }` (fin de méthode à l'indentation de la classe),
  // ce qui suffit ici et évite d'écrire un parseur.
  const end = source.indexOf('\n  }', start)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

describe('GA-96 — l’identité d’un dossier ne se réécrit jamais', () => {
  const accountsSource = read(ACCOUNTS_SERVICE)
  const analysisSource = read(ANALYSIS_SERVICE)

  /* ------------------------------------------------------------------ */
  /*  0. La garde LIT quelque chose                                      */
  /* ------------------------------------------------------------------ */

  it('lit un corpus non vide — les deux services existent et sont substantiels', () => {
    expect(accountsSource.length).toBeGreaterThan(10_000)
    expect(analysisSource.length).toBeGreaterThan(10_000)
    // …et ce sont bien les fichiers qu'on croit lire.
    expect(accountsSource).toContain('class AccountsService')
    expect(analysisSource).toContain('class AnalysisService')
  })

  it('le module `accounts` contient bien des fichiers à surveiller', () => {
    const files = readdirSync(join(MODULES, 'accounts')).filter(name => name.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(1)
    expect(files).toContain('accounts.service.ts')
  })

  /* ------------------------------------------------------------------ */
  /*  1. `applyResearch` refuse une identité différente                  */
  /* ------------------------------------------------------------------ */

  it('`applyResearch` appelle le refus AVANT toute écriture', () => {
    const body = methodBody(accountsSource, 'async applyResearch(')
    expect(body.length).toBeGreaterThan(200)

    expect(body).toContain('refuseIdentityRewrite')

    // L'ORDRE est la moitié de la règle : refuser après avoir semé les
    // partenaires détectés ou fusionné le blob laisserait passer les faits
    // d'une autre société. Le refus doit précéder le premier `await` d'écriture.
    const refusalAt = body.indexOf('refuseIdentityRewrite')
    const firstWriteAt = Math.min(
      ...['seedDetectedPartners', 'seedAccessFacts', 'repo.update', 'mergeRawAnalysis']
        .map(marker => body.indexOf(marker))
        .filter(index => index !== -1),
    )
    expect(refusalAt).toBeGreaterThan(-1)
    expect(firstWriteAt).toBeGreaterThan(-1)
    expect(refusalAt).toBeLessThan(firstWriteAt)
  })

  it('le refus compare les identités et LÈVE — il ne se contente pas de journaliser', () => {
    const body = methodBody(accountsSource, 'private async refuseIdentityRewrite(')
    expect(body.length).toBeGreaterThan(200)

    // Il lit l'identité STOCKÉE (sans quoi il n'a rien à comparer)…
    expect(body).toContain('repo.findOne')
    // …compare par la dérivation partagée (jamais un `===` maison, qui
    // refuserait « 552 012 031 » contre « 552012031 »)…
    expect(body).toContain('isSameRegistryIdentity')
    // …et REFUSE. Un `logger.warn` laisserait l'écriture passer.
    expect(body).toContain('throw new Error')
    expect(body).toContain('buildIdentityMismatchMessage')
  })

  /* ------------------------------------------------------------------ */
  /*  2. La relance hérite de l'identité du dossier                      */
  /* ------------------------------------------------------------------ */

  it('le lancement dérive une identité qui retombe sur celle du dossier relancé', () => {
    // C'est CETTE ligne qui manquait : sans elle le run repart du seul nom.
    expect(analysisSource).toMatch(/const siren = dto\.siren \?\? reuseTarget\?\.siren/)
  })

  it('la file, l’historique de run et le recyclage reçoivent l’identité DÉRIVÉE, pas `dto.siren`', () => {
    // Le défaut se rejouerait à l'identique si un seul de ces trois consommateurs
    // relisait `dto.siren` : la collecte repartirait du nom (file), ou
    // l'historique mentirait sur la société analysée (run).
    const start = analysisSource.indexOf('const siren = dto.siren ?? reuseTarget?.siren')
    expect(start).toBeGreaterThan(-1)
    const after = analysisSource.slice(start)
    expect(after.length).toBeGreaterThan(1_000)

    // Aucun `siren: dto.siren` ne doit subsister APRÈS la dérivation.
    expect(after).not.toMatch(/siren: dto\.siren\b/)
  })

  it('une relance qui demande une AUTRE société est refusée AVANT le débit', () => {
    const refusalAt = analysisSource.indexOf("code: 'identity_mismatch'")
    // ⚠️ On cherche l'APPEL, pas le nom : la première occurrence textuelle de
    // `consumeAnalysisSlot` est le COMMENTAIRE qui explique ce refus, situé
    // juste au-dessus de lui. Une garde qui lit son propre commentaire se croit
    // rouge (ou verte) pour une raison qui n'existe pas — mesuré ici même.
    const debitAt = analysisSource.indexOf('await this.credits.consumeAnalysisSlot')
    expect(refusalAt).toBeGreaterThan(-1)
    expect(debitAt).toBeGreaterThan(-1)
    // Un refus qui coûte un crédit est une punition : l'utilisateur paierait
    // pour apprendre qu'on n'a rien fait.
    expect(refusalAt).toBeLessThan(debitAt)
  })

  /* ------------------------------------------------------------------ */
  /*  3. `reuseForRelaunch` POSE une identité, il n'en REMPLACE jamais   */
  /* ------------------------------------------------------------------ */

  it('`reuseForRelaunch` n’écrit l’identité que sur un dossier qui n’en a pas', () => {
    const body = methodBody(accountsSource, 'async reuseForRelaunch(')
    expect(body.length).toBeGreaterThan(150)

    // La serrure est dans le WHERE, pas dans un `if` : elle rend le
    // remplacement structurellement impossible plutôt que simplement interdit.
    expect(body).toContain('siren: IsNull()')
    // …et l'ancienne écriture inconditionnelle ne doit pas revenir.
    expect(body).not.toMatch(/update\.siren = patch\.siren/)
  })

  /* ------------------------------------------------------------------ */
  /*  4. Le contrat du refus est partagé, jamais recopié                 */
  /* ------------------------------------------------------------------ */

  it('les deux camps lisent le MÊME contrat de refus', () => {
    // Les deux sentinelles d'erreur qui existaient avant celle-ci sont des
    // phrases françaises recopiées à la main dans le front pour être reconnues.
    // Une phrase recopiée ne se traduit pas sans casser la reconnaissance : le
    // marqueur et son lecteur vivent donc dans `@bellum/contracts`.
    expect(accountsSource).toContain('buildIdentityMismatchMessage')
    expect(analysisSource).toContain('buildIdentityMismatchMessage')

    const banner = read(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'web',
        'src',
        'features',
        'accounts',
        'view',
        'account-detail',
        'components',
        'AccountDetailStatusBanners.tsx',
      ),
    )
    expect(banner.length).toBeGreaterThan(1_000)
    expect(banner).toContain('parseIdentityMismatchMessage')
    // L'écran ne doit JAMAIS reconstruire le format à la main.
    expect(banner).not.toContain('bellum:identity_mismatch')
  })

  /* ------------------------------------------------------------------ */
  /*  5. Aucun autre writer ne s'ajoute sans passer par le refus         */
  /* ------------------------------------------------------------------ */

  it('aucun service du dépôt n’écrit `siren` sur un compte hors des chemins connus', () => {
    // Les écrivains LITTÉRAUX de la colonne, et la raison de chacun. Chaque
    // raison est une façon différente de respecter la même règle — l'identité
    // se POSE, elle ne se REMPLACE pas.
    //
    // ⚠️ `crm-core/record-edit.service.ts` n'est PAS dans cette liste, et ce
    // n'est pas un oubli : il écrit `await this.accounts.update({ id }, accepted)`,
    // où `accepted` est construit depuis `ACCOUNT_FIELD_COLUMNS`. Le littéral
    // `siren` n'y apparaît jamais, donc ce détecteur ne peut pas le voir — et
    // ne DOIT pas prétendre le voir. C'est la porte de la correction humaine ;
    // elle est gardée séparément, juste en dessous.
    const allowed = new Set([
      // 1. Le refus vit dedans (`applyResearch`), et la pose conditionnelle
      //    de `reuseForRelaunch` aussi (`WHERE siren IS NULL`).
      join(MODULES, 'accounts', 'accounts.service.ts'),
      // 2. L'import de fichier, qui ne remplit QUE LES TROUS —
      //    `if (!match.siren && …)`. Il ne peut donc pas réécrire une identité
      //    connue : c'est la même règle que GA-96, obtenue autrement. (Vérifié
      //    à l'écriture de cette garde, `import-writer.service.ts:135`.)
      join(MODULES, 'import', 'import-writer.service.ts'),
    ])

    const offenders: string[] = []
    let scanned = 0
    let accountWriters = 0
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
        if (!name.endsWith('.ts') || name.includes('.spec.')) continue
        scanned += 1
        const source = readFileSync(path, 'utf8')
        // ⚠️ La table compte autant que la colonne. `siren` existe AUSSI sur
        // `esn_directory` et sur les tables DataForge, qui ne sont pas des
        // dossiers : une garde qui ne regarde que le nom de colonne accuse
        // `esn-directory.service.ts` d'un défaut qu'il n'a pas (mesuré à
        // l'écriture de cette garde). Le signal de table est `AccountEntity`.
        //
        // ⚠️⚠️ …et il se lit avec une FRONTIÈRE DE MOT. `DataforgeAccountEntity`
        // CONTIENT `AccountEntity` : un `includes` naïf faisait passer la table
        // de préparation DataForge pour un dossier client, et la garde accusait
        // un second innocent. Mesuré ici aussi — deux faux positifs pour un même
        // détecteur trop pressé.
        if (!/(^|[^A-Za-z])AccountEntity\b/.test(source)) continue
        // ⚠️ `[^)]*` avec le drapeau `s` traverse allègrement une parenthèse
        // fermante suivie d'un autre appel : on borne la fenêtre au patch qui
        // suit IMMÉDIATEMENT l'`update`, sur une seule expression.
        if (!/\.update\(\s*[^;]{0,400}?\bsiren\b/s.test(source)) continue
        accountWriters += 1
        if (!allowed.has(path)) offenders.push(path)
      }
    }
    walk(MODULES)

    // ⚠️ Le corpus doit être réel : sans ces deux assertions, un `MODULES` mal
    // résolu (ou un détecteur devenu trop étroit) rendrait zéro fichier et la
    // garde serait verte en ne lisant RIEN. La seconde est la plus importante :
    // elle prouve que le détecteur voit encore les écritures qu'il autorise —
    // s'il cesse de les voir, il a cessé de voir tout le reste aussi.
    expect(scanned).toBeGreaterThan(50)
    expect(accountWriters).toBe(allowed.size)
    expect(offenders).toEqual([])
  })

  it('la correction HUMAINE reste la seule porte qui peut CHANGER une identité', () => {
    // Elle n'écrit pas de littéral (voir la note de l'allowlist ci-dessus), donc
    // elle se garde par ce qui la rend sûre : elle passe par l'arbitre de
    // provenance, qui stampe `human` — et c'est cette provenance que
    // `AccountsService.arbitrate` fait ensuite respecter par le pipeline, quelle
    // que soit la date. « Une correction humaine gagne toujours. »
    const source = read(join(MODULES, 'crm-core', 'record-edit.service.ts'))
    expect(source.length).toBeGreaterThan(1_000)

    expect(source).toContain('ACCOUNT_FIELD_COLUMNS')
    expect(source).toContain('applyFieldUpdates')
    // Elle n'écrit QUE le patch arbitré — jamais un littéral qui court-circuite
    // la carte de colonnes partagée.
    expect(source).toMatch(/this\.accounts\.update\(\s*\{\s*id[^}]*\}\s*,\s*accepted\s*\)/)
  })
})
