import { buildDumpCommand, formatBackupFilename, parseCliArgs } from './migration-backup'

/**
 * #2446.5 — chaque migration réversible, avec backup, transaction, idempotence,
 * dry run. La transaction est déjà couverte par le défaut TypeORM
 * (`migration:run` sans `-t none` enveloppe les migrations en attente dans une
 * transaction). L'idempotence est une propriété PAR migration (578 fichiers,
 * hors de portée d'un script). Ce qui manquait entièrement : un backup pris
 * AVANT de migrer, et un mode dry-run qui ne touche rien.
 *
 * Ce fichier teste les deux fonctions PURES du script (construction de
 * commande, lecture des arguments) — jamais un vrai `pg_dump` ni une vraie
 * connexion, comme les autres scripts de ce dossier.
 */
describe('parseCliArgs', () => {
  it('sans --dry-run, le run est réel', () => {
    expect(parseCliArgs([])).toEqual({ dryRun: false })
  })

  it('--dry-run passe le drapeau, sans prendre de backup ni migrer', () => {
    expect(parseCliArgs(['--dry-run'])).toEqual({ dryRun: true })
  })
})

describe('formatBackupFilename', () => {
  it('un horodatage NON round, lisible, sans deux-points (invalides dans un nom de fichier)', () => {
    const name = formatBackupFilename(new Date('2026-09-25T22:41:07.000Z'))
    expect(name).toBe('2026-09-25T22-41-07.sql')
    expect(name).not.toContain(':')
  })
})

describe('buildDumpCommand', () => {
  const env = {
    POSTGRES_HOST: 'db.internal',
    POSTGRES_PORT: '5440',
    POSTGRES_USER: 'bellum',
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'bellum_prod',
  }

  it('construit pg_dump avec les MÊMES variables que data-source.ts, jamais DATABASE_URL', () => {
    const { command, args, outputFile } = buildDumpCommand(env, new Date('2026-09-25T22:41:07.000Z'), '/backups')
    expect(command).toBe('pg_dump')
    expect(args).toEqual([
      '--host=db.internal',
      '--port=5440',
      '--username=bellum',
      '--dbname=bellum_prod',
      '--no-password',
      '--format=custom',
      `--file=/backups/2026-09-25T22-41-07.sql`,
    ])
    expect(outputFile).toBe('/backups/2026-09-25T22-41-07.sql')
  })

  it('retombe sur les mêmes défauts que data-source.ts quand une variable manque', () => {
    const { args } = buildDumpCommand({}, new Date('2026-09-25T22:41:07.000Z'), '/backups')
    expect(args).toContain('--host=localhost')
    expect(args).toContain('--port=5432')
    expect(args).toContain('--username=postgres')
    expect(args).toContain('--dbname=postgres')
  })

  it('jamais le mot de passe en clair dans args (PGPASSWORD passe par l’environnement du process enfant)', () => {
    const { args } = buildDumpCommand(env, new Date('2026-09-25T22:41:07.000Z'), '/backups')
    expect(args.join(' ')).not.toContain('secret')
  })
})
