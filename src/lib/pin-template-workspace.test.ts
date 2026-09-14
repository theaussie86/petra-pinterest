import {
  WORKSPACE_TABS,
  workspaceForStatus,
  countByWorkspace,
  nextSelectionAfterRemoval,
} from './pin-template-workspace'
import { buildPinTemplate } from '@/test/factories'

describe('workspaceForStatus', () => {
  it('maps draft and needs_revision to the open workspace', () => {
    expect(workspaceForStatus('draft')).toBe('open')
    expect(workspaceForStatus('needs_revision')).toBe('open')
  })

  it('maps approved and archived to their own workspaces', () => {
    expect(workspaceForStatus('approved')).toBe('approved')
    expect(workspaceForStatus('archived')).toBe('archived')
  })
})

describe('WORKSPACE_TABS', () => {
  it('lists the three tabs in review order', () => {
    expect(WORKSPACE_TABS).toEqual(['open', 'approved', 'archived'])
  })
})

describe('countByWorkspace', () => {
  it('counts templates per workspace, collapsing draft + needs_revision into open', () => {
    const templates = [
      buildPinTemplate({ status: 'draft' }),
      buildPinTemplate({ status: 'needs_revision' }),
      buildPinTemplate({ status: 'approved' }),
      buildPinTemplate({ status: 'archived' }),
      buildPinTemplate({ status: 'archived' }),
    ]
    expect(countByWorkspace(templates)).toEqual({ open: 2, approved: 1, archived: 2 })
  })

  it('returns zeroes for an empty list', () => {
    expect(countByWorkspace([])).toEqual({ open: 0, approved: 0, archived: 0 })
  })
})

describe('nextSelectionAfterRemoval', () => {
  const list = [
    buildPinTemplate({ id: 'a', position: 1 }),
    buildPinTemplate({ id: 'b', position: 2 }),
    buildPinTemplate({ id: 'c', position: 3 }),
  ]

  it('jumps to the next item after the removed one', () => {
    expect(nextSelectionAfterRemoval(list, 'b')).toBe('c')
  })

  it('falls back to the previous item when the removed one was last', () => {
    expect(nextSelectionAfterRemoval(list, 'c')).toBe('b')
  })

  it('returns null when the removed one was the only item', () => {
    expect(nextSelectionAfterRemoval([list[0]], 'a')).toBeNull()
  })

  it('returns null when the id is not in the list', () => {
    expect(nextSelectionAfterRemoval(list, 'z')).toBeNull()
  })
})
