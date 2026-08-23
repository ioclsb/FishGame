// Storage wrapper: wx.setStorageSync/getStorageSync with an in-memory
// fallback so the module also works under Node (core tests) and in
// environments where storage throws.
let memory = {};

function get(key) {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const v = wx.getStorageSync(key);
      return v === '' || v === null || v === undefined ? null : v;
    }
  } catch (e) { /* fall through to memory */ }
  return key in memory ? memory[key] : null;
}

function set(key, value) {
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(key, value);
      return;
    }
  } catch (e) { /* fall through to memory */ }
  memory[key] = String(value);
}

function remove(key) {
  try {
    if (typeof wx !== 'undefined' && wx.removeStorageSync) {
      wx.removeStorageSync(key);
      return;
    }
  } catch (e) { /* fall through to memory */ }
  delete memory[key];
}

module.exports = { get, set, remove };