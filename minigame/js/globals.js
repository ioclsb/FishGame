// Safe reference to the runtime global object. Older WeChat runtimes expose
// `global` (CommonJS) without `globalThis`; modern engines expose both.
const G = (typeof globalThis !== 'undefined') ? globalThis
  : (typeof global !== 'undefined') ? global
  : (typeof self !== 'undefined') ? self
  : {};

module.exports = { G };