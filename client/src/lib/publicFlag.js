/**
 * PUBLIC PORTAL — flag shown to visitors. `public_flag` comes from the database (projects.public_flag,
 * migration 021): the flag once an Auditor or Admin has confirmed or overridden it, otherwise null.
 * The portal never sees the unreviewed automatic flag, so null always means "Under review".
 */
import { FLAG_META } from './constants.js';

export const UNDER_REVIEW = Object.freeze({ label: 'Under review', color: '#94a3b8' });

const labelOf = (flag) => `${FLAG_META[flag].label} · ${FLAG_META[flag].long}`;

/** Map pin colour and label for a public project row. */
export function publicFlagMarker(project) {
  const flag = project?.public_flag;
  return FLAG_META[flag] ? { color: FLAG_META[flag].color, label: labelOf(flag) } : { color: UNDER_REVIEW.color, label: UNDER_REVIEW.label };
}

/** Legend under the public map, in severity order. */
export const PUBLIC_FLAG_LEGEND = Object.freeze([
  ...['green', 'yellow', 'red'].map((flag) => ({ key: flag, color: FLAG_META[flag].color, label: labelOf(flag) })),
  { key: 'under_review', color: UNDER_REVIEW.color, label: UNDER_REVIEW.label },
]);
