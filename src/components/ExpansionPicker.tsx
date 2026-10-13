import { EXPANSIONS } from "../shared/expansions";
export function ExpansionPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="expansion-picker">
      <legend>世界扩展 · 核心规则始终可用</legend>
      {EXPANSIONS.map((e) => (
        <label key={e.id}>
          <input
            type="checkbox"
            checked={value.includes(e.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...value, e.id]
                  : value.filter((id) => id !== e.id),
              )
            }
          />
          <span>
            <strong>{e.name}</strong>
            <small>{e.detail}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
