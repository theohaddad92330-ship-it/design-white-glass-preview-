import type { ArgumentsHost } from '@nestjs/common'
import { ZodValidationException } from 'nestjs-zod'
import { z } from 'zod'
import { ZodValidationExceptionFilter } from './zod-validation-exception.filter'

function run(schema: z.ZodTypeAny, input: unknown): { status: number; body: Record<string, unknown> } {
  const parsed = schema.safeParse(input)
  if (parsed.success) throw new Error('le jeu d’essai devait être refusé')
  let status = 0
  let body: Record<string, unknown> = {}
  const response = {
    status(code: number) {
      status = code
      return this
    },
    json(payload: Record<string, unknown>) {
      body = payload
    },
  }
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost
  new ZodValidationExceptionFilter().catch(new ZodValidationException(parsed.error), host)
  return { status, body }
}

describe('ZodValidationExceptionFilter (#4833)', () => {
  const schema = z.object({
    full_name: z.string().min(1),
    email: z.string().email().nullable(),
    nested: z.object({ zone: z.string() }),
  })

  it('le message NOMME chaque champ refusé et sa règle — plus de « Validation failed » nu', () => {
    const { status, body } = run(schema, { full_name: 'Ada', email: 'pas-un-mail', nested: {} })
    expect(status).toBe(400)
    expect(body.message).toContain('email')
    expect(body.message).toContain('nested.zone')
    expect(body.message).not.toContain('full_name')
    // le détail structuré reste servi tel quel
    expect(Array.isArray(body.errors)).toBe(true)
  })

  it('garde un message lisible quand il n’y a aucun détail de champ', () => {
    const { body } = run(z.string(), 3)
    expect(body.message).toBe('Validation failed')
  })

  it('borne la liste (5 champs au plus) et dit combien d’autres sont refusés', () => {
    const wide = z.object(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`f${i}`, z.string()])))
    const { body } = run(wide, {})
    expect(String(body.message)).toContain('f0')
    expect(String(body.message)).not.toContain('f7')
    expect(String(body.message)).toContain('3')
  })
})
