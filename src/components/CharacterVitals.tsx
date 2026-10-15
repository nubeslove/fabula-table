import type { Character } from "../shared/types";
import { derived } from "../shared/rules";
export function CharacterVitals({
  character: c,
  creation = false,
}: {
  character: Character;
  creation?: boolean;
}) {
  const d = derived(c);
  return (
    <div className="character-vitals">
      {(
        [
          ["hp", "生命", creation ? d.hp : c.hp, d.hp],
          ["mp", "魔力", creation ? d.mp : c.mp, d.mp],
          ["ip", "物资", creation ? d.ip : c.ip, d.ip],
          ["fabula", "物语点", c.fabula, null],
          ["zenit", "泽尼特", c.zenit, null],
        ] as const
      ).map(([key, label, value, max]) => (
        <div className={`vital ${key}`} key={key}>
          <span>
            {label} <small>{key === "fabula" ? "✦" : key.toUpperCase()}</small>
          </span>
          <strong>
            {value}
            {max !== null && <small> / {max}</small>}
          </strong>
          {max !== null && (
            <span className="vital-track">
              <i
                style={{
                  width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`,
                }}
              />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
