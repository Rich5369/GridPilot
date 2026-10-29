// Playwright route predicates receive URLs; request/response predicates receive objects.
function isOptimization(value, mode) {
  const url = value instanceof URL ? value : new URL(value.url())
  const request = typeof value.request === 'function' ? value.request() : value
  return url.pathname === '/api/optimize'
    && url.searchParams.get('scheduling_mode') === mode
    && (value instanceof URL || request.method() === 'POST')
}
module.exports = {
  isEvOnlyOptimization: value => isOptimization(value, 'ev_only'),
  isJointOptimization: value => isOptimization(value, 'joint'),
}
