import React from 'react';
import { formatMoney } from '../utils/format';

export default function GoalCard({ goal, onEdit }) {
  const current = goal.current_amount || goal.currentAmount || 0;
  const target = goal.target_amount || goal.targetAmount || 1;
  const pct = Math.min(100, Math.round((current / target) * 100));
  const color = goal.color || (pct >= 50 ? '#f59e0b' : '#38bdf8');

  // SVG Circular progress constants
  const size = 56;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="goal-card" onClick={onEdit ? () => onEdit(goal) : undefined}>
      <div className="goal-gauge" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <span className="goal-gauge-icon">
          {goal.emoji || '🎯'}
        </span>
      </div>

      <div className="goal-info">
        <h4 className="goal-title">{goal.name || goal.title}</h4>
        <div className="goal-sub">
          {formatMoney(current)} / {formatMoney(target)}
          {goal.target_date && ` · ${goal.target_date}`}
        </div>
      </div>

      <div className="goal-pct" style={{ color }}>
        {pct}%
      </div>
    </div>
  );
}
