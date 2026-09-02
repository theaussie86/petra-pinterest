import { getModel, DEFAULT_MODEL_ID } from './model'

describe('getModel()', () => {
  it('resolves a Google model with the default modelId', () => {
    const model = getModel('test-api-key')
    expect(model).toBeTypeOf('object')
    // AI SDK language models expose provider + modelId
    expect((model as { provider: string }).provider).toContain('google')
    expect((model as { modelId: string }).modelId).toBe(DEFAULT_MODEL_ID)
    expect(DEFAULT_MODEL_ID).toBe('gemini-3.5-flash')
  })

  it('honors an explicit modelId', () => {
    const model = getModel('test-api-key', 'gemini-3.5-flash-lite')
    expect((model as { modelId: string }).modelId).toBe('gemini-3.5-flash-lite')
  })
})
