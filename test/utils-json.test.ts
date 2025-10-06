/**
 * Tests JSON utility: parseJsonRelaxed()
 * - Handles BOM and common security prefixes
 * - Parses JSON-in-string and returns original when inner parse fails
 * - Invalid JSON returns ok:false
 */
import { test } from 'tap'
import { parseJsonRelaxed } from '../src/utils/json'

test('parseJsonRelaxed - basic JSON', async (t) => {
  const r = parseJsonRelaxed('{"a":1}')
  t.same(r, { ok: true, value: { a: 1 } })
})

test('parseJsonRelaxed - non-string and empty', async (t) => {
  t.same(parseJsonRelaxed(undefined as any), { ok: false })
  t.same(parseJsonRelaxed('  '), { ok: false })
})

test('parseJsonRelaxed - BOM', async (t) => {
  const bom = String.fromCharCode(0xfeff) + '{"a":1}'
  const r = parseJsonRelaxed(bom)
  t.equal(r.ok, true)
})

test('parseJsonRelaxed - security prefixes', async (t) => {
  const inputs = [
    ")]}',\n{\"a\":1}",
    'while(1); {"a":1}',
    'for(;;); {"a":1}'
  ]
  for (const inp of inputs) {
    const r = parseJsonRelaxed(inp)
    t.equal(r.ok, true)
    t.same((r as any).value.a, 1)
  }
})

test('parseJsonRelaxed - string that contains JSON', async (t) => {
  const r = parseJsonRelaxed('" {\\"b\\":2} "')
  t.equal(r.ok, true)
  t.same((r as any).value, { b: 2 })
})

test('parseJsonRelaxed - string that looks like JSON but invalid', async (t) => {
  const r = parseJsonRelaxed('" {invalid} "')
  t.equal(r.ok, true)
  // Should return the original string when inner JSON parse fails
  t.same((r as any).value, ' {invalid} ')
})

test('parseJsonRelaxed - invalid JSON', async (t) => {
  const r = parseJsonRelaxed('{invalid')
  t.same(r, { ok: false })
})
