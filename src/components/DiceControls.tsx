import { useRef, useState } from "react";
import type { Character, Command } from "../shared/types";
import { ATTR_NAMES, currentAttributes } from "../shared/rules";
import { Field } from "./Common";

export function DiceControls({
  character,
  act,
  onRolled,
}: {
  character?: Character;
  act: (command: Command) => Promise<boolean>;
  onRolled?: () => void;
}) {
  const [count, setCount] = useState<1 | 2>(2),
    [dice, setDice] = useState([8, 8]),
    [modifier, setModifier] = useState(0),
    [label, setLabel] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  const pending = useRef(false);
  async function roll() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setResult("");
    try {
      if (
        await act({
          type: "roll",
          actor: character?.id ?? "",
          sides: dice.slice(0, count),
          modifier,
          label,
        })
      ) {
        setResult("结果已发送到掷骰频道");
        onRolled?.();
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="dice-controls">
      <div className="dice-mode" role="group" aria-label="骰子数量">
        <button
          type="button"
          aria-pressed={count === 1}
          onClick={() => setCount(1)}
        >
          单骰
        </button>
        <button
          type="button"
          aria-pressed={count === 2}
          onClick={() => setCount(2)}
        >
          双骰
        </button>
      </div>
      {character && (
        <div className="dice-attributes">
          {Object.entries(currentAttributes(character)).map(([key, value]) => (
            <button
              type="button"
              key={key}
              onClick={() =>
                setDice(count === 1 ? [value, dice[1]] : [dice[1], value])
              }
            >
              {ATTR_NAMES[key as keyof typeof ATTR_NAMES]} d{value}
            </button>
          ))}
        </div>
      )}
      <div className="dice-fields">
        {dice.slice(0, count).map((n, i) => (
          <Field key={i} label={`第${i + 1}枚骰子`}>
            <select
              value={n}
              onChange={(e) =>
                setDice(dice.map((v, j) => (i === j ? +e.target.value : v)))
              }
            >
              {[4, 6, 8, 10, 12, 20, 100].map((n) => (
                <option key={n} value={n}>
                  d{n}
                </option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="修正值">
          <input
            type="number"
            min={-999}
            max={999}
            value={modifier}
            onChange={(e) => setModifier(+e.target.value)}
          />
        </Field>
      </div>
      <Field label="掷骰说明">
        <input
          value={label}
          placeholder="可选，例如调查古老石门"
          maxLength={100}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <button
        type="button"
        className="primary full"
        disabled={
          busy || !Number.isInteger(modifier) || Math.abs(modifier) > 999
        }
        onClick={() => void roll()}
      >
        {busy
          ? "掷骰中…"
          : `掷出 ${dice
              .slice(0, count)
              .map((n) => `d${n}`)
              .join(" + ")}`}
      </button>
      {result && <small role="status">{result}</small>}
    </div>
  );
}
