"use client";

const QUICK_OPTIONS = [1.5, 1.6, 1.7];

interface Props {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}

export default function MultiplierSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
        Multiplicador de venta
      </label>
      <div className="flex gap-2">
        {QUICK_OPTIONS.map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition ${
              value === opt
                ? "bg-black text-white"
                : "bg-zinc-100 text-zinc-700 active:bg-zinc-200"
            }`}
          >
            {opt}x
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        max={5}
        step={0.05}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v > 0) onChange(v);
        }}
        className="w-full border-2 border-zinc-200 rounded-xl px-4 py-3 text-center text-lg font-bold focus:outline-none focus:border-black transition"
      />
    </div>
  );
}
