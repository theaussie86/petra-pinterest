/**
 * Upper bound on how many rows a single MCP list tool returns, so a tool result
 * can never blow past an agent's context window (Spec #115: "Paginierung/Limit
 * bei Listen"). Callers page with offset/cursor to go further.
 */
export const MAX_LIST_LIMIT = 100
