import React from 'react';

export default function SegmentedProgressBar({ value = 0, max = 1, totalSegments = 12 }) {
  const safeMax = max > 0 ? max : 1;
  const ratio = value / safeMax;
  const pct = Math.round(ratio * 100);

  // Number of segments to fill
  const filledCount = Math.max(0, Math.min(totalSegments, Math.round(ratio * totalSegments)));

  // Color scheme based on percentage
  let colorClass = 'segment--safe';
  if (pct >= 100) {
    colorClass = 'segment--danger';
  } else if (pct >= 85) {
    colorClass = 'segment--warning';
  }

  const segments = Array.from({ length: totalSegments }, (_, i) => i < filledCount);

  return (
    <div className="segmented-progress-bar" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      {segments.map((isFilled, idx) => (
        <span
          key={idx}
          className={`segment-bar ${isFilled ? `filled ${colorClass}` : 'empty'}`}
        />
      ))}
    </div>
  );
}
