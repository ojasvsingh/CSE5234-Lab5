import { useState } from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import { MAX_QUANTITY } from '../lib/shop.js';

export default function QuantityInput({ value, onChange, label, max = MAX_QUANTITY }) {
  const [draft, setDraft] = useState(null);
  function commit() {
    const next = Number(draft);
    if (draft !== null && Number.isInteger(next) && next >= 1 && next <= max) onChange(next);
    setDraft(null);
  }
  function step(amount) {
    setDraft(null);
    onChange(Math.max(1, Math.min(max, value + amount)));
  }
  return (
    <div className="quantity-control">
      <button type="button" aria-label={`Decrease quantity for ${label}`} disabled={value <= 1} onClick={() => step(-1)}><FiMinus /></button>
      <input
        type="number" inputMode="numeric" min="1" max={max} step="1"
        aria-label={`Quantity for ${label}`}
        value={draft ?? value}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          const next = Number(raw);
          if (Number.isInteger(next) && next >= 1 && next <= max) onChange(next);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); }
        }}
      />
      <button type="button" aria-label={`Increase quantity for ${label}`} disabled={value >= max} onClick={() => step(1)}><FiPlus /></button>
    </div>
  );
}
