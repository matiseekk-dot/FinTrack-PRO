/**
 * Client-side rate limit - wykrywa nadmierną aktywność w UI.
 * Nie chroni przed prawdziwym atakiem (trzeba Cloud Function), ale:
 * - Zapobiega accidental bugom (nieskończona pętla useEffect)
 * - Sygnalizuje userowi gdy coś jest nie tak
 * - Pozwala na rozsądny use case: 50 tx/min = OK, 1000 tx/min = STOP
 */

const LIMITS = {
  addTransaction: { count: 60, windowMs: 60000 },   // 60/min
  saveFirestore:  { count: 100, windowMs: 60000 },  // 100/min
  default:        { count: 200, windowMs: 60000 },
};

const counters = new Map();  // key -> [{ timestamp }, ...]

function checkLimit(action) {
  const now = Date.now();
  const limit = LIMITS[action] || LIMITS.default;
  
  let timestamps = counters.get(action) || [];
  // Usuń timestampy poza oknem
  timestamps = timestamps.filter(t => now - t < limit.windowMs);
  
  if (timestamps.length >= limit.count) {
    console.warn(`[FT RateLimit] ${action} exceeded: ${timestamps.length}/${limit.count} in ${limit.windowMs}ms`);
    return { allowed: false, resetIn: limit.windowMs - (now - timestamps[0]) };
  }
  
  timestamps.push(now);
  counters.set(action, timestamps);
  return { allowed: true, remaining: limit.count - timestamps.length };
}

function resetLimit(action) {
  counters.delete(action);
}

export { checkLimit, resetLimit };
