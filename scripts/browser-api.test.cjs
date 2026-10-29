const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isEvOnlyOptimization, isJointOptimization } = require('./browser-api.cjs')
test('matches optimization path and scheduling mode independently of query order', () => {
  for (const query of ['scheduling_mode=ev_only', 'trace=1&scheduling_mode=ev_only']) {
    const url = new URL(`http://localhost:8000/api/optimize?${query}`)
    assert(isEvOnlyOptimization(url))
    assert(!isJointOptimization(url))
    const request = { url: () => url.href, method: () => 'POST' }
    assert(isEvOnlyOptimization(request))
    assert(isEvOnlyOptimization({ url: request.url, request: () => request }))
    assert(!isEvOnlyOptimization({ ...request, method: () => 'GET' }))
  }
  assert(isJointOptimization(new URL('http://localhost/api/optimize?scheduling_mode=joint')))
  for (const path of ['/api/optimize', '/other/api/optimize?scheduling_mode=ev_only', '/api/optimize/extra?scheduling_mode=ev_only']) {
    assert(!isEvOnlyOptimization(new URL(path, 'http://localhost')))
  }
})
