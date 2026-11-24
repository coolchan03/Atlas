/**
 * The maths of a recorded route, in code and never by the AI: which GPS fixes to keep, how far and how high a walk went, and where to
 * head to follow the route back to its start. Pure, so it is tested without a device.
 */
import { bearingDeg, distanceM } from '../atlasMaps/maps';

export interface TrailPoint { lat: number; lon: number; /** Height in metres, when the fix had one. */ alt?: number; /** Milliseconds since 1970. */ t: number }
interface Fix { lat: number; lon: number; accuracy: number; altitude: number; time: number }

/** Fixes worse than this (metres) are ignored: they wander and add distance that was not walked. */
const MAX_ACCURACY_M = 40;
/** A new point is kept only after this much movement (metres), so standing still adds nothing. */
const MIN_STEP_M = 8;
/** The most points kept for one trail; beyond it every other point is dropped. */
const MAX_POINTS = 4000;
/** Height changes smaller than this (metres) are noise, not climbing. */
const CLIMB_NOISE_M = 3;
/** Between points slower than this (metres per second) the walker is counted as stopped. */
const MOVING_MS = 0.3;

/** The points with this fix added, or the same list when the fix is poor, too close to the last point or not a real position. */
export function addFix(points: TrailPoint[], fix: Fix): TrailPoint[] {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || !Number.isFinite(fix.accuracy) || fix.accuracy > MAX_ACCURACY_M) return points;
  const last = points[points.length - 1];
  if (last && distanceM(last, fix) < MIN_STEP_M) return points;
  const point: TrailPoint = { lat: fix.lat, lon: fix.lon, t: fix.time || Date.now(), ...(Number.isFinite(fix.altitude) && fix.altitude > -999 ? { alt: fix.altitude } : {}) };
  const next = [...points, point];
  return next.length > MAX_POINTS ? next.filter((_, i) => i % 2 === 0 || i === next.length - 1) : next;
}

export interface TrailStats {
  distanceM: number; durationMs: number; movingMs: number;
  climbM: number; descentM: number; highestM: number | null; lowestM: number | null;
  /** Average speed while moving, in metres per second. */
  speedMs: number;
}

/** Distance, time and climbing of a trail. */
export function trailStats(points: TrailPoint[]): TrailStats {
  let distance = 0; let moving = 0;
  for (let i = 1; i < points.length; i += 1) {
    const d = distanceM(points[i - 1], points[i]);
    const dt = (points[i].t - points[i - 1].t) / 1000;
    distance += d;
    if (dt > 0 && d / dt >= MOVING_MS) moving += dt * 1000;
  }
  // Climbing counts a change only once it passes the noise size, measured from the last height that counted.
  let climb = 0; let descent = 0; let ref: number | null = null;
  const heights = points.map((p) => p.alt).filter((a): a is number => a !== undefined);
  for (const h of heights) {
    if (ref === null) { ref = h; continue; }
    if (h - ref >= CLIMB_NOISE_M) { climb += h - ref; ref = h; } else if (ref - h >= CLIMB_NOISE_M) { descent += ref - h; ref = h; }
  }
  const duration = points.length > 1 ? points[points.length - 1].t - points[0].t : 0;
  return {
    distanceM: distance, durationMs: duration, movingMs: moving, climbM: climb, descentM: descent,
    highestM: heights.length ? Math.max(...heights) : null, lowestM: heights.length ? Math.min(...heights) : null,
    speedMs: moving > 0 ? distance / (moving / 1000) : 0,
  };
}

export interface BackStep {
  /** True when the walker is within arrival distance of the start. */
  arrived: boolean;
  /** Compass bearing to head for, in degrees (0 is north). */
  bearing: number;
  /** Straight-line distance to the next point on the route, in metres. */
  toNextM: number;
  /** Distance left along the route back to the start, in metres. */
  remainingM: number;
  /** How far the walker is from the route itself, in metres (large means they have strayed). */
  offRouteM: number;
}

const ARRIVED_M = 20;
const LOOKAHEAD_M = 30;

/** Where to head to follow `points` back to their first point from `here`: toward the route point a little way back from the nearest one. Null for a route with no points. */
export function backStep(points: TrailPoint[], here: { lat: number; lon: number }): BackStep | null {
  if (!points.length) return null;
  let nearest = 0; let best = Infinity;
  points.forEach((p, i) => { const d = distanceM(here, p); if (d < best) { best = d; nearest = i; } });
  let remaining = best;
  for (let i = nearest; i > 0; i -= 1) remaining += distanceM(points[i], points[i - 1]);
  const start = points[0];
  if (distanceM(here, start) <= ARRIVED_M) return { arrived: true, bearing: bearingDeg(here, start), toNextM: distanceM(here, start), remainingM: distanceM(here, start), offRouteM: best };
  // Aim at the first point back along the route that is a little ahead of where the walker is.
  let target = Math.max(0, nearest - 1);
  while (target > 0 && distanceM(here, points[target]) < LOOKAHEAD_M) target -= 1;
  const aim = points[target];
  return { arrived: false, bearing: bearingDeg(here, aim), toNextM: distanceM(here, aim), remainingM: remaining, offRouteM: best };
}
