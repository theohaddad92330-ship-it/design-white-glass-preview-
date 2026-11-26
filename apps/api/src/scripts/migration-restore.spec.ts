import { buildRestoreCommand, parseRestoreArgs } from './migration-restore'

describe('parseRestoreArgs', () => {
  it('lit le fichier passé en premier argument', () => {
    expect(parseRestoreArgs(['/backups/x.sql'])).toEqual({ file: '/backups/x.sql' })
  })

  it('refuse sans fichier — jamais un restore silencieux « du dernier backup deviné »', () => {
    expect(() => parseRestoreArgs([])).toThrow('Usage: migration:restore <fichier.sql>')
  })
})

describe('buildRestoreCommand', () => {
  it('construit pg_restore avec les MÊMES variables que data-source.ts, --clean --if-exists', () => {
    const env = {
      POSTGRES_HOST: 'db.internal',
      POSTGRES_PORT: '5440',
      POSTGRES_USER: 'bellum',
      POSTGRES_DB: 'bellum_prod',
    }
    const { command, args } = buildRestoreCommand(env, '/backups/x.sql')
    expect(command).toBe('pg_restore')
    expect(args).toEqual([
      '--host=db.internal',
      '--port=5440',
      '--username=bellum',
      '--dbname=bellum_prod',
      '--no-password',
      '--clean',
      '--if-exists',
      '/backups/x.sql',
    ])
  })

  it('retombe sur les mêmes défauts que data-source.ts quand une variable manque', () => {
    const { args } = buildRestoreCommand({}, '/backups/x.sql')
    expect(args).toContain('--host=localhost')
    expect(args).toContain('--port=5432')
    expect(args).toContain('--username=postgres')
    expect(args).toContain('--dbname=postgres')
  })
})
