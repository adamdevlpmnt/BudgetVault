import React from 'react';

export default function ReceiptCard({
  title,
  subtitle,
  rightText,
  rightColor,
  hasSawtooth = true,
  children,
  className = '',
}) {
  return (
    <div className={`receipt-container ${className}`}>
      <div className="receipt-card">
        {(title || rightText) && (
          <div className="receipt-header">
            <div className="receipt-header-left">
              <span className="receipt-date">{title}</span>
              {subtitle && <span className="receipt-sub">{subtitle}</span>}
            </div>
            {rightText && (
              <span
                className="receipt-total"
                style={rightColor ? { color: rightColor } : undefined}
              >
                {rightText}
              </span>
            )}
          </div>
        )}

        <div className="receipt-divider" />

        <div className="receipt-body">
          {children}
        </div>
      </div>

      {hasSawtooth && <div className="receipt-sawtooth" aria-hidden="true" />}
    </div>
  );
}
