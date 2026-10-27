import type { DayCell } from '../lib/plan';
import { daysBetween, dayMonth, longDate, todayISO } from '../lib/dates';
import { cx } from '../lib/dates';

/** One column per plan day. Height of the fill = share of that day's tick boxes ticked. */
export function DayStrip({ cells, onPick, selected }: { cells: DayCell[]; onPick?: (date: string) => void; selected?: string }) {
  const today = todayISO();
  if (!cells.length) return null;
  return (
    <div className="strip-wrap">
      <ol className="strip" aria-label="Revision plan, one column per day">
        {cells.map((c) => {
          const isToday = c.date === today;
          const past = c.date < today;
          const missed = past && c.classes > 0 && c.ratio < 1;
          const label = c.classes
            ? `Day ${c.dayNo}, ${longDate(c.date)}: ${c.doneClasses} of ${c.classes} classes done`
            : `Day ${c.dayNo}, ${longDate(c.date)}: no classes`;
          return (
            <li key={c.date}>
              <button
                type="button"
                className={cx('cell', isToday && 'is-today', missed && 'is-missed', c.ratio === 1 && c.classes > 0 && 'is-full', selected === c.date && 'is-selected', c.classes === 0 && 'is-empty')}
                title={label}
                aria-label={label}
                onClick={() => onPick?.(c.date)}
                disabled={!onPick}
              >
                <span className="cell__fill" style={{ height: `${c.ratio * 100}%` }} />
                {isToday && <span className="cell__now" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="strip__axis">
        <span>{dayMonth(cells[0].date)}</span>
        <span>{daysBetween(cells[0].date, today) >= 0 && daysBetween(today, cells[cells.length - 1].date) >= 0 ? `Today, day ${daysBetween(cells[0].date, today) + 1}` : ''}</span>
        <span>{dayMonth(cells[cells.length - 1].date)}</span>
      </div>
    </div>
  );
}
