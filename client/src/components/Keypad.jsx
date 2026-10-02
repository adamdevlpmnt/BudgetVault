import React from 'react';
import { Delete } from 'lucide-react';

export default function Keypad({ onKeyPress, onDelete, onTripleZero }) {
  const handlePress = (val) => {
    if (navigator.vibrate) navigator.vibrate(8);
    if (val === 'backspace') {
      onDelete();
    } else if (val === '000') {
      if (onTripleZero) onTripleZero();
      else {
        onKeyPress('0');
        onKeyPress('0');
        onKeyPress('0');
      }
    } else {
      onKeyPress(val);
    }
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['000', '0', 'backspace'],
  ];

  return (
    <div className="custom-keypad">
      {keys.map((row, rIdx) => (
        <div key={rIdx} className="keypad-row">
          {row.map((k) => (
            <button
              key={k}
              type="button"
              className={`keypad-btn ${k === 'backspace' ? 'keypad-btn--action' : ''} ${k === '000' ? 'keypad-btn--triple' : ''}`}
              onClick={() => handlePress(k)}
            >
              {k === 'backspace' ? <Delete size={22} /> : k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
