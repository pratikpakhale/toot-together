const KEY = 'toot-together:hippocam-key'

export function hippocamKey() {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setHippocamKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY, key)
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: the key lasts as long as the page.
  }
}
