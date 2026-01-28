
import { webcrypto } from 'node:crypto'

export default function () {
  if (!global.crypto) {
    Object.defineProperty(global, 'crypto', {
      value: webcrypto,
      writable: true,
      configurable: true,
    })
  }
}
