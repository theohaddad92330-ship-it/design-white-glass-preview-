// Tests des heuristiques de tools/tests/inventory.mjs — une fixture par classe + des cas qui doivent dire NON.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, extractTests, sample, candidates } from './inventory.mjs'

const c = (path, source, app = 'api') => classify({ path, app, source })

test('integration : supertest', () => {
  const r = c('apps/api/src/x/x.controller.spec.ts', `import request from 'supertest';\nit('ok', () => {})`)
  assert.equal(r.cls, 'integration')
})

test('integration : client FastAPI réel côté ia', () => {
  const r = c(
    'apps/ia/tests/test_api.py',
    'from fastapi.testclient import TestClient\nclient = TestClient(app)\ndef test_a():\n    pass',
    'ia',
  )
  assert.equal(r.cls, 'integration')
})

test('integration NON : AsyncMock(spec=httpx.AsyncClient) est un mock, pas un client réel', () => {
  const r = c(
    'apps/ia/tests/test_x.py',
    'client = AsyncMock(spec=httpx.AsyncClient)\ndef test_a():\n    assert 1',
    'ia',
  )
  assert.equal(r.cls, 'behavior')
})

test('integration : *.db.spec contre un vrai Postgres', () => {
  assert.equal(c('apps/api/src/n/a.db.spec.ts', `it('x', () => {})`).cls, 'integration')
})

test('guard-text : python, assertions « phrase in prompt »', () => {
  const src =
    'from app.prompts import p\ndef test_a():\n    assert "a" in p.SYS\n    assert "b" in p.SYS\n    assert "c" in p.SYS'
  assert.equal(c('apps/ia/tests/test_p.py', src, 'ia').cls, 'guard-text')
})

test('guard-text NON : prompt importé mais assertions de valeur', () => {
  const src =
    'from app.prompts import p\ndef test_a():\n    assert f(p) == 1\n    assert g(p) == 2\n    assert "a" in p.SYS'
  assert.equal(c('apps/ia/tests/test_p.py', src, 'ia').cls, 'behavior')
})

test('mirror : SQL littéral attendu', () => {
  const r = c('apps/api/src/db/a.spec.ts', `expect(sql).toContain('ALTER TABLE accounts ADD COLUMN x')`)
  assert.equal(r.cls, 'mirror')
})

test('mirror : majorité de toHaveBeenCalledWith exacts', () => {
  const src = `expect(a).toHaveBeenCalledWith(1);expect(b).toHaveBeenCalledWith(2);expect(c).toHaveBeenCalledWith(3);expect(x).toBe(1)`
  assert.equal(c('apps/api/src/y.spec.ts', src).cls, 'mirror')
})

test('mirror NON : calledWith minoritaires', () => {
  const src =
    `expect(a).toHaveBeenCalledWith(1);expect(b).toHaveBeenCalledWith(2);expect(c).toHaveBeenCalledWith(3);` +
    'expect(x).toBe(1);'.repeat(5)
  assert.notEqual(c('apps/api/src/y.spec.ts', src).cls, 'mirror')
})

test('guard-text : lit le source et fait toContain', () => {
  const src = `import { readFileSync } from 'node:fs';\nconst s = readFileSync('src/a.ts','utf8');\nexpect(s).toContain('foo');`
  assert.equal(c('apps/web/src/architecture/GA-1.test.ts', src, 'web').cls, 'guard-text')
})

test('guard-text : lit un controller et compare des indexOf', () => {
  const src = `const s = readFileSync(join(__dirname, 'a.controller.ts'), 'utf8');\nexpect(s.indexOf('@Get')).toBeGreaterThan(-1)`
  assert.equal(c('apps/api/src/a.spec.ts', src).cls, 'guard-text')
})

test('guard-text NON : readFileSync sur une fixture json sans assertion texte', () => {
  const src = `import { readFileSync } from 'node:fs';\nconst j = JSON.parse(readFileSync('fixtures/a.json','utf8'));\nexpect(j.n).toBe(3);`
  assert.equal(c('apps/web/src/a.test.ts', src, 'web').cls, 'behavior')
})

test('issue-proof : numéro dans le nom du fichier', () => {
  assert.equal(
    c('apps/ia/tests/test_current_position_4465.py', 'def test_a():\n    assert f() == 1', 'ia').cls,
    'issue-proof',
  )
})

test('issue-proof : titres qui citent #N', () => {
  const src = `it('corrige #1234 le cas A', () => {});\nit('corrige #1235 le cas B', () => {});\nit('autre', () => {});`
  assert.equal(c('apps/api/src/z.spec.ts', src).cls, 'issue-proof')
})

test('issue-proof NON : une seule citation sur quatre titres', () => {
  const src = `it('a #1234', () => {});it('b', () => {});it('c', () => {});it('d', () => {});`
  assert.equal(c('apps/api/src/z.spec.ts', src).cls, 'behavior')
})

test('behavior : test ordinaire', () => {
  const r = c('apps/api/src/credits/calc.spec.ts', `it('additionne', () => { expect(add(1,2)).toBe(3); });`)
  assert.equal(r.cls, 'behavior')
  assert.equal(r.tests, 1)
})

test('sensitive : drapeau posé par le chemin, sans changer la classe', () => {
  const r = c('apps/api/src/billing/stripe.spec.ts', `it('x', () => { expect(1).toBe(1); });`)
  assert.equal(r.sensitive, true)
  assert.equal(r.cls, 'behavior')
})

test('extractTests : python et js', () => {
  assert.deepEqual(extractTests('def test_a():\n  pass\nasync def test_b():\n  pass', 'ia'), ['test_a', 'test_b'])
  assert.deepEqual(extractTests(`it('a', f); test("b", g); it.each([1])('c', h)`, 'web'), ['a', 'b'])
})

test('sample : déterministe à seed fixe', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ i }))
  assert.deepEqual(sample(rows, 5, 1), sample(rows, 5, 1))
  assert.notDeepEqual(sample(rows, 5, 1), sample(rows, 5, 2))
})

test('candidates : exclut sensible, behavior et integration, plafonne à max', () => {
  const mk = (path, cls, sensitive) => ({ app: 'api', path, cls, sensitive, lines: 10, tests: 1, why: '' })
  const rows = [
    mk('a', 'mirror', true),
    mk('b', 'mirror', false),
    mk('c', 'behavior', false),
    mk('d', 'integration', false),
    mk('e', 'guard-text', false),
  ]
  assert.deepEqual(
    candidates(rows)
      .map(r => r.path)
      .sort(),
    ['b', 'e'],
  )
  assert.equal(candidates(rows, 1).length, 1)
})
