import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const listeners = new Map()
const shown = []
const self = {
  addEventListener(type, handler) { listeners.set(type, handler) },
  registration: {
    showNotification(title, options) {
      shown.push({ title, options })
      return Promise.resolve()
    },
  },
}

vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self })

test('a repeated ordinary message alerts again while keeping one notification per link', async () => {
  let pending
  const event = {
    data: { json: () => ({ title: 'Synthetic message', link: '/teacher' }) },
    waitUntil(value) { pending = value },
  }
  listeners.get('push')(event)
  await pending
  listeners.get('push')(event)
  await pending
  assert.equal(shown.length, 2)
  assert.equal(shown[1].options.tag, '/teacher')
  assert.equal(shown[1].options.renotify, true)
})
