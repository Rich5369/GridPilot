import { formatHour } from "../../data/time";
export function HourSelect({
  id,
  value,
  onChange,
  end = false,
  invalid = false,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  end?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const values = Array.from({ length: 24 }, (_, i) =>
    String(i + (end ? 1 : 0)),
  );
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      required
    >
      {!values.includes(value) && (
        <option value={value}>
          {value === ""
            ? "Select a whole-hour time"
            : `Unsupported saved time: ${value}`}
        </option>
      )}
      {values.map((h) => (
        <option key={h} value={h}>
          {formatHour(h)}
        </option>
      ))}
    </select>
  );
}
