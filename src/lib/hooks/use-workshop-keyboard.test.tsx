import { render, fireEvent, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { useWorkshopKeyboard, type WorkshopKeyboardHandlers } from './use-workshop-keyboard'

afterEach(cleanup)

function makeHandlers(): WorkshopKeyboardHandlers & Record<string, ReturnType<typeof vi.fn>> {
  return {
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onApprove: vi.fn(),
    onCopyPrompt: vi.fn(),
    onRequestRevision: vi.fn(),
  }
}

function Harness({
  handlers,
  enabled = true,
}: {
  handlers: WorkshopKeyboardHandlers
  enabled?: boolean
}) {
  useWorkshopKeyboard(handlers, enabled)
  return (
    <div>
      <div data-testid="surface">surface</div>
      <input data-testid="field" />
      <textarea data-testid="area" />
    </div>
  )
}

describe('useWorkshopKeyboard', () => {
  it('maps j/k/f/c/r to the matching handlers', () => {
    const handlers = makeHandlers()
    const { getByTestId } = render(<Harness handlers={handlers} />)
    const surface = getByTestId('surface')

    fireEvent.keyDown(surface, { key: 'j' })
    fireEvent.keyDown(surface, { key: 'k' })
    fireEvent.keyDown(surface, { key: 'f' })
    fireEvent.keyDown(surface, { key: 'c' })
    fireEvent.keyDown(surface, { key: 'r' })

    expect(handlers.onNext).toHaveBeenCalledTimes(1)
    expect(handlers.onPrev).toHaveBeenCalledTimes(1)
    expect(handlers.onApprove).toHaveBeenCalledTimes(1)
    expect(handlers.onCopyPrompt).toHaveBeenCalledTimes(1)
    expect(handlers.onRequestRevision).toHaveBeenCalledTimes(1)
  })

  it('ignores unmapped keys', () => {
    const handlers = makeHandlers()
    const { getByTestId } = render(<Harness handlers={handlers} />)

    fireEvent.keyDown(getByTestId('surface'), { key: 'x' })

    expect(handlers.onNext).not.toHaveBeenCalled()
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('does not fire while an input is focused', () => {
    const handlers = makeHandlers()
    const { getByTestId } = render(<Harness handlers={handlers} />)

    fireEvent.keyDown(getByTestId('field'), { key: 'f' })

    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('does not fire while a textarea is focused', () => {
    const handlers = makeHandlers()
    const { getByTestId } = render(<Harness handlers={handlers} />)

    fireEvent.keyDown(getByTestId('area'), { key: 'r' })

    expect(handlers.onRequestRevision).not.toHaveBeenCalled()
  })

  it('does not fire while a dialog is open', () => {
    const handlers = makeHandlers()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    const { getByTestId } = render(<Harness handlers={handlers} />)
    fireEvent.keyDown(getByTestId('surface'), { key: 'j' })

    expect(handlers.onNext).not.toHaveBeenCalled()
    document.body.removeChild(dialog)
  })

  it('ignores shortcuts combined with a modifier key', () => {
    const handlers = makeHandlers()
    const { getByTestId } = render(<Harness handlers={handlers} />)

    fireEvent.keyDown(getByTestId('surface'), { key: 'c', metaKey: true })
    fireEvent.keyDown(getByTestId('surface'), { key: 'f', ctrlKey: true })

    expect(handlers.onCopyPrompt).not.toHaveBeenCalled()
    expect(handlers.onApprove).not.toHaveBeenCalled()
  })

  it('does not fire when disabled', () => {
    const handlers = makeHandlers()
    const { getByTestId } = render(<Harness handlers={handlers} enabled={false} />)

    fireEvent.keyDown(getByTestId('surface'), { key: 'j' })

    expect(handlers.onNext).not.toHaveBeenCalled()
  })
})
