/** Minimum history window for the Work OS feed (Notch central stream). */
export const FEED_HISTORY_DAYS = 7
export const FEED_HISTORY_MS = FEED_HISTORY_DAYS * 24 * 60 * 60 * 1000

/** Max stream items loaded into the feed for the history window. */
export const FEED_HISTORY_ITEM_LIMIT = 800

/** Max grouped Monday thread cards shown in the feed. */
export const FEED_MONDAY_THREAD_LIMIT = 80
