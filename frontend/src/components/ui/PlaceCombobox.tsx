import { useEffect, useId, useMemo, useState } from 'react';
import { MapPin, SpinnerGap } from '@phosphor-icons/react';
import { searchPlaces } from '../../services/api';
import type { PlaceSuggestion } from '../../types/routing';
import { controlClass } from './controls';

interface PlaceComboboxProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Freight hubs ("City, ST"), shown before typing and matched instantly while the search runs. */
  hubs: string[];
  invalid?: boolean;
  describedBy?: string;
}

const SEARCH_DELAY_MS = 220;
const MAX_ITEMS = 8;

function hubMatches(hubs: string[], query: string): PlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  return hubs
    .filter((hub) => hub.toLowerCase().startsWith(q))
    .slice(0, MAX_ITEMS)
    .map((hub) => {
      const [city, state] = hub.split(', ');
      return { label: hub, name: city, detail: state ? `${state} · freight hub` : 'Freight hub' };
    });
}

/** Text input with a suggestion list (ARIA combobox): freight hubs first, then any city worldwide. */
export function PlaceCombobox({
  id,
  name,
  value,
  onChange,
  placeholder,
  hubs,
  invalid,
  describedBy,
}: PlaceComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Latest search response and the query it answered; the list is derived from these during render.
  const [remote, setRemote] = useState<{ query: string; items: PlaceSuggestion[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const searchable = value.trim().length >= 2;
  const local = useMemo(() => hubMatches(hubs, value), [hubs, value]);
  const answered = remote?.query === value;
  const items = answered && remote.items.length ? remote.items : local;
  const loading = open && searchable && pending === value && !answered;

  useEffect(() => {
    if (!open || !searchable) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPending(value);
      searchPlaces(value, controller.signal)
        .then((results) => setRemote({ query: value, items: results }))
        .catch(() => {
          if (!controller.signal.aborted) setRemote({ query: value, items: [] });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value, open, searchable]);

  const choose = (item: PlaceSuggestion) => {
    onChange(item.label);
    setOpen(false);
    setActive(-1);
  };

  const showList = open && items.length > 0;
  const showEmpty = open && searchable && answered && items.length === 0;

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(items.length - 1, i + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (event.key === 'Enter' && showList && active >= 0) {
            event.preventDefault();
            choose(items[active]);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className={`${controlClass} pr-9`}
      />
      {loading ? (
        <SpinnerGap
          size={16}
          className="pointer-events-none absolute right-3 top-3.5 animate-spin text-muted"
          aria-hidden
        />
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-md border border-line bg-white py-1 shadow-lg"
        >
          {!value.trim() ? (
            <li role="presentation" className="px-3 pb-1 pt-1.5 text-xs text-muted">
              Freight hubs
            </li>
          ) : null}
          {items.map((item, index) => (
            <li
              key={item.label}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Keep focus in the input so the click lands before blur closes the list.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
                index === active ? 'bg-canvas' : ''
              }`}
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block truncate text-xs text-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {showEmpty ? (
        <p className="absolute z-[1000] mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-muted shadow-lg">
          No matching places. Try a city name, or a latitude, longitude pair.
        </p>
      ) : null}
    </div>
  );
}
