import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface SlideOption<T extends string | number> {
  value: T;
  label: string;
}

interface Props<T extends string | number> {
  value: T;
  options: readonly SlideOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  testId?: string;
  className?: string;
  triggerClassName?: string;
  optionsClassName?: string;
  optionClassName?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
}

/** A checked, keyboard-accessible list that always slides down from the trigger. */
export function SlideSelect<T extends string | number>({
  value, options, onChange, ariaLabel, testId, className = '',
  triggerClassName = '', optionsClassName = '', optionClassName = '',
  align = 'start', disabled = false,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const menuId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current.get(active)?.focus();
  }, [active, open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const show = (index = selectedIndex) => {
    if (disabled || options.length === 0) return;
    setActive(index);
    setOpen(true);
  };
  const hide = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };
  const select = (index: number) => {
    if (!options[index]) return;
    hide(true);
    onChange(options[index].value);
  };
  const triggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      show((selectedIndex + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
    }
  };
  const optionKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const length = options.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + length) % length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      setActive(e.key === 'Home' ? 0 : length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`slide-select ${className}`} data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className={`slide-select-trigger ${triggerClassName}`}
        data-testid={testId}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => open ? hide() : show()}
        onKeyDown={triggerKeyDown}
      >
        <span className="slide-select-value">{options[selectedIndex]?.label ?? String(value)}</span>
        <svg className="slide-select-chevron" viewBox="0 0 12 8" width="10" height="7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 1.5 6 6l4.5-4.5" />
        </svg>
      </button>
      <div
        id={menuId}
        className={`slide-select-options ${optionsClassName}`}
        data-align={align}
        role="listbox"
        aria-label={ariaLabel}
        aria-hidden={!open}
        data-testid={testId ? `${testId}-options` : undefined}
      >
        {options.map((option, index) => (
          <button
            key={String(option.value)}
            ref={(node) => {
              if (node) optionRefs.current.set(index, node);
              else optionRefs.current.delete(index);
            }}
            type="button"
            role="option"
            className={`slide-select-option ${optionClassName}`}
            aria-selected={option.value === value}
            tabIndex={-1}
            onClick={() => select(index)}
            onKeyDown={optionKeyDown}
          >
            <span>{option.label}</span>
            {option.value === value && (
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3.2 8.3 3.2 3.1 6.5-6.7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
