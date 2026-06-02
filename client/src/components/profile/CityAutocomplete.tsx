import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared';
import { geoApi } from '../../api/geo';
import { inputStyle, labelStyle } from './ProfilePrimitives';

/**
 * Поле «Город» с автодополнением из серверного геосправочника. Свободный ввод
 * только фильтрует подсказки — итоговое значение всегда выбирается из списка
 * (`onSelect`); сервер дополнительно проверяет принадлежность справочнику.
 */
export function CityAutocomplete({
  label = 'Город',
  value,
  confirmed,
  onChange,
  onSelect,
  hint,
}: {
  label?: string;
  value: string;
  /** Значение уже выбрано из списка/исходное — подсказки не запрашиваем. */
  confirmed: boolean;
  onChange: (text: string) => void;
  onSelect: (label: string) => void;
  /** Подсказка/ошибка под полем (например «выберите вариант из списка»). */
  hint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Дебаунс-запрос подсказок при наборе. Подтверждённое значение (выбор из
  // списка или исходный город) не запрашиваем — поле «в покое».
  useEffect(() => {
    const q = value.trim();
    if (confirmed || q.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await geoApi.searchCities(q);
        if (!cancelled) {
          setItems(res.cities);
          setActive(-1);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [value, confirmed]);

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);

  const pick = (label_: string) => {
    setOpen(false);
    setItems([]);
    setActive(-1);
    onSelect(label_);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && !confirmed && value.trim().length >= 2;

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder="Начните вводить город"
        autoComplete="off"
        maxLength={120}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (!confirmed) setOpen(true); }}
        onBlur={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          blurTimer.current = setTimeout(() => setOpen(false), 140);
        }}
        onKeyDown={onKeyDown}
        style={inputStyle}
      />
      {hint && <span style={{ fontSize: 12, color: 'var(--accent-hi)' }}>{hint}</span>}

      {showDropdown && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 30,
            background: 'var(--bg-2)',
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-md)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {loading && items.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-3)' }}>Поиск…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-3)' }}>Ничего не найдено</div>
          ) : (
            items.map((c, idx) => (
              <button
                key={c}
                type="button"
                // onMouseDown — чтобы выбор сработал раньше blur инпута.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  color: 'var(--text-0)',
                  background: idx === active ? 'var(--bg-3)' : 'transparent',
                }}
              >
                <span style={{ color: 'var(--text-3)', display: 'grid', placeItems: 'center' }}>
                  <Icon name="mapPin" size={15} />
                </span>
                {c}
              </button>
            ))
          )}
        </div>
      )}
    </label>
  );
}
