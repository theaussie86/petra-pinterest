import { hasFeature } from './features'

describe('hasFeature', () => {
  it('returns true when the feature is in the user flag list', () => {
    expect(hasFeature({ features: ['pin_werkstatt'] }, 'pin_werkstatt')).toBe(true)
  })

  it('returns false when the feature is not enabled', () => {
    expect(hasFeature({ features: [] }, 'pin_werkstatt')).toBe(false)
  })

  it('fails closed for a missing user', () => {
    expect(hasFeature(null, 'pin_werkstatt')).toBe(false)
    expect(hasFeature(undefined, 'pin_werkstatt')).toBe(false)
  })
})
