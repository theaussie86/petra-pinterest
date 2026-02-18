describe('supabase browser client', () => {
  it('exports a supabase client instance', async () => {
    const mod = await import('./supabase')
    expect(mod.supabase).toBeDefined()
    expect(typeof mod.supabase).toBe('object')
  })
})
