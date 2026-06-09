/**
 * Repair-preserving structured `Output` for the `generateText` path.
 *
 * AI SDK v6 deprecated `generateObject` in favor of `generateText({ output })`.
 * The old `experimental_repairText` slot lived only on `generateObject`, and
 * `Output.object` exposes no repair hook. This wraps `Output.object` and runs
 * the carried-over control-char repair inside `parseCompleteOutput` when the
 * first parse/validation fails — same net behavior and fire-counter as before:
 * native parse first, repair only on failure (ADR 0002 / PRD #40).
 */

import { Output } from 'ai'
import type { z } from 'zod'
import { repairText } from './repair'

/**
 * Like `Output.object({ schema })`, but a failed parse triggers one
 * control-char-repair retry before giving up.
 */
export function repairableObject<SCHEMA extends z.ZodType>(schema: SCHEMA) {
  const inner = Output.object<z.infer<SCHEMA>>({ schema })
  const parse = inner.parseCompleteOutput.bind(inner)

  inner.parseCompleteOutput = async (options, context) => {
    try {
      return await parse(options, context)
    } catch (error) {
      const repaired = await repairText({
        text: options.text,
        error: error as Parameters<typeof repairText>[0]['error'],
      })
      if (repaired == null || repaired === options.text) throw error
      return parse({ ...options, text: repaired }, context)
    }
  }

  return inner
}
