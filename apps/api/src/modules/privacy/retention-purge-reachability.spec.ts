import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-72 — la purge des résumés archivés est ATTEINTE par le balayage
 * quotidien, et sa requête ne peut pas toucher une ligne vivante.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE DE TEXTE ET PAS SEULEMENT DES TESTS DE COMPORTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les tests unitaires de `privacy-retention.service.spec.ts` appellent la
 * méthode DIRECTEMENT. Ils resteraient tous verts si quelqu'un retirait
 * l'appel du corps du cron : la purge serait juste, calculée, testée — et plus
 * jamais exécutée. C'est le défaut n°1 de ce dépôt (« du code juste que
 * personne n'appelle »), et il ne se voit que sur l'APPELANT.
 *
 * La seconde chose gardée ici est la portée de l'effacement. `superseded_at IS
 * NOT NULL` est la seule frontière entre « on efface une archive que personne
 * ne lit » et « on efface la mémoire vivante d'un utilisateur ». Elle doit être
 * écrite, et elle doit être écrite DANS la requête.
 */
const SERVICE = join(__dirname, 'privacy-retention.service.ts')

/** Le fichier sans ses commentaires : on garde du CODE, pas des intentions. */
const source = readFileSync(SERVICE, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')

/**
 * Le corps de `retentionSweepCron`, de sa signature à la fin du fichier.
 *
 * Découpage volontairement grossier : la méthode est la DERNIÈRE du service.
 * Si elle cesse de l'être, l'assertion de corpus ci-dessous le dira (le corps
 * contiendrait alors d'autres méthodes, pas moins) — ce qui est le bon sens de
 * l'erreur : une garde trop large signale à tort, une garde trop étroite ne
 * signale rien.
 */
const cronBody = source.slice(source.indexOf('async retentionSweepCron('))

describe('GA-72 — la purge des résumés archivés est branchée, et bornée aux archives', () => {
  it('lit un corpus NON VIDE — sinon la garde ne garde rien', () => {
    // Un chemin faux ou un découpage trop gourmand rendrait des chaînes quasi
    // vides, et toutes les assertions passeraient en cherchant « rien » dans
    // « rien ».
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain('export class PrivacyRetentionService')
    expect(cronBody.length).toBeGreaterThan(100)
    expect(cronBody).toContain('withSingletonLock(')
  })

  it('le passage quotidien APPELLE la purge — sinon elle n’existe que sur le papier', () => {
    expect(source).toContain('async sweepArchivedConversationSummaries(')
    // Le point que cette garde tient vraiment : l'appel, dans le corps du cron.
    expect(cronBody).toContain('this.sweepArchivedConversationSummaries(')
  })

  it('elle reste sur le balayage EXISTANT — pas un planificateur de plus', () => {
    // Un second `@Cron` dans ce service voudrait dire qu'on a ajouté une heure
    // à surveiller plutôt que d'utiliser celle qui passait déjà.
    expect(source.match(/@Cron\(/g)?.length ?? 0).toBe(1)
    expect(source).toContain("@Cron('17 4 * * *'")
  })

  it('la requête ne peut pas atteindre une ligne VIVANTE', () => {
    expect(source).toContain('superseded_at IS NOT NULL')
    expect(source).toContain('conversation_summaries')
    // Bornée : jamais une suppression de masse en une seule instruction.
    expect(source).toContain('LIMIT $2')
    // Paramétrée : une date concaténée dans le SQL est le chemin le plus court
    // vers un `WHERE` qui ne filtre plus rien.
    expect(source).toContain('superseded_at < $1')
    const sqlBlock = source.slice(source.indexOf('DELETE FROM conversation_summaries'))
    expect(sqlBlock.slice(0, 400)).not.toContain('${')
  })

  it('« non mesuré » n’est pas « 0 » — la méthode sait rendre null', () => {
    const method = source.slice(
      source.indexOf('async sweepArchivedConversationSummaries('),
      source.indexOf('async retentionSweepCron('),
    )
    expect(method.length).toBeGreaterThan(200)
    expect(method).toContain('Promise<number | null>')
    // Gelée, en échec, ou illisible : trois chemins, aucun ne rend 0.
    expect(method.match(/return null/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    // Le résultat brut est contrôlé AVANT d'être compté : `returnedCount` rend
    // 0 sur une réponse illisible, et 0 est une phrase qu'on ne veut dire que
    // si la requête a vraiment tourné.
    expect(method).toContain('Array.isArray(raw)')
    // Et le comptage passe par l'aide partagée : TypeORM rend `[lignes,
    // nombre]` sur un DELETE, donc `.length` sur le brut vaudrait toujours 2.
    expect(method).toContain('returnedCount(')
    expect(method).not.toMatch(/raw\.length/)
  })

  it('chaque fenêtre de rétention vit à UN seul endroit (GA-26)', () => {
    // La variable n'est nommée QUE dans la politique. Un balayage qui relirait
    // `process.env` pour son propre délai ferait diverger ce que l'API PUBLIE
    // (`GET /privacy/retention`) de ce qu'elle EFFACE — et c'est la publication
    // qu'un client lit dans le DPA.
    for (const key of [
      'RETENTION_DAYS_ARCHIVED_SUMMARIES',
      'RETENTION_DAYS_REVOKED_SESSIONS',
      'RETENTION_DAYS_ANONYMIZED',
      'RETENTION_DAYS_INACTIVE_ACCOUNT',
      'RETENTION_DAYS_LEDGER',
      'RETENTION_DAYS_INVOICES',
    ]) {
      expect(source.match(new RegExp(key, 'g'))?.length ?? 0).toBe(1)
    }
    // Et les balayages passent bien par la politique, pas par l'env.
    expect(source).toContain('private windowDays(')
    expect(source.match(/this\.windowDays\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('rien du CONTENU ne peut entrer dans le journal', () => {
    const method = source.slice(
      source.indexOf('async sweepArchivedConversationSummaries('),
      source.indexOf('async retentionSweepCron('),
    )
    // Le journal ne porte que des comptes. `rows` (les identifiants effacés) et
    // la colonne `summary` ne doivent apparaître dans aucun message.
    for (const line of method.split('\n')) {
      if (!line.includes('logger.')) continue
      expect(line).not.toContain('summary')
      expect(line).not.toContain('rows[')
    }
    expect(method).toContain('${purged}')
  })
})

/**
 * GA — le scrub des corps de messages (finding pentest #7) est ATTEINT par le
 * balayage quotidien, borné, paramétré, et ne touche que du contenu personnel.
 * Même raison qu'au-dessus : les tests unitaires appellent la méthode
 * directement ; seul l'appelant prouve qu'elle tourne pour de vrai.
 */
describe('GA — le scrub des corps de messages est branché et borné (finding #7)', () => {
  it('le passage quotidien APPELLE le scrub', () => {
    expect(source).toContain('async sweepActivityBodies(')
    expect(cronBody).toContain('this.sweepActivityBodies(')
  })

  it('scrube le CONTENU (UPDATE), ne SUPPRIME pas la ligne — « on archive, on ne supprime pas »', () => {
    const sqlBlock = source.slice(source.indexOf('UPDATE activities'))
    expect(sqlBlock.slice(0, 300)).toContain('SET body = NULL')
    expect(sqlBlock.slice(0, 300)).toContain('subject = NULL')
    // Un DELETE FROM activities emporterait la métadonnée non nominative — interdit.
    expect(source).not.toContain('DELETE FROM activities')
  })

  it('la requête est bornée, paramétrée, et ne re-balaye pas ce qui est déjà vide', () => {
    // On borne au SQL lui-même : au-delà vivent les logs, dont les `${...}`
    // feraient échouer à tort le contrôle d'interpolation.
    const sql = source.slice(
      source.indexOf('UPDATE activities'),
      source.indexOf('RETURNING id', source.indexOf('UPDATE activities')) + 20,
    )
    expect(sql).toContain('body IS NOT NULL') // ne re-touche pas un corps déjà effacé
    expect(sql).toContain('occurred_at < $1') // paramétré, jamais concaténé
    expect(sql).toContain('LIMIT $2') // jamais une purge de masse d'un coup
    expect(sql).not.toContain('${') // aucune date/valeur concaténée dans le SQL
  })

  it('« non mesuré » n’est pas « 0 » — le scrub sait rendre null', () => {
    const method = source.slice(
      source.indexOf('async sweepActivityBodies('),
      source.indexOf('async retentionSweepCron('),
    )
    expect(method).toContain('return null')
    // Et il lit sa fenêtre dans la POLITIQUE, jamais l'env directement.
    expect(method).toContain("this.windowDays('message_bodies')")
  })
})
