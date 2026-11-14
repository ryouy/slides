import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ART_LEVELS, type ArtLevel } from '../logic/board';

interface Props {
  current: ArtLevel;
  getLabel: (level: ArtLevel) => string;
  ariaLabel: string;
  onSelect: (level: ArtLevel) => void;
  disabled?: boolean;
}

/**
 * A controlled, downward-opening size picker. Native select menus may align
 * their selected item over the trigger and consequently open upwards.
 */
export function ArtLevelMenu({ current, getLabel, ariaLabel, onSelect, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ArtLevel>(current);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef(new Map<ArtLevel, HTMLButtonElement>());
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  useEffect(() => {
    if (open) optionsRef.current.get(active)?.focus();
  }, [active, open]);

  const openList = (next: ArtLevel = current) => {
    if (disabled) return;
    setActive(next);
    setOpen(true);
  };
  const closeList = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const selectLevel = (level: ArtLevel) => {
    closeList(true);
    onSelect(level);
  };
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const index = ART_LEVELS.indexOf(current);
      openList(ART_LEVELS[(index + (event.key === 'ArrowDown' ? 1 : -1) + ART_LEVELS.length) % ART_LEVELS.length]);
    }
  };
  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = ART_LEVELS.indexOf(active);
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        setActive(ART_LEVELS[(index + (event.key === 'ArrowDown' ? 1 : -1) + ART_LEVELS.length) % ART_LEVELS.length]);
        break;
      case 'Home':
      case 'End':
        event.preventDefault();
        event.stopPropagation();
        setActive(event.key === 'Home' ? ART_LEVELS[0] : ART_LEVELS[ART_LEVELS.length - 1]);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closeList(true);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        // Enter and Space activate the focused button by default.
        break;
    }
  };

  return (
    <div className="art-level-menu-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="art-level-trigger"
        data-testid="art-size-select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => open ? closeList(false) : openList()}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{getLabel(current)}</span>
        <svg viewBox="0 0 12 8" width="11" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 1.5 6 6l4.5-4.5" />
        </svg>
      </button>
      {open && (
        <div id={listId} className="art-level-options" role="listbox" aria-label={ariaLabel} data-testid="art-size-options">
          {ART_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              ref={(node) => {
                if (node) optionsRef.current.set(level, node);
                else optionsRef.current.delete(level);
              }}
              role="option"
              className="art-level-option"
              aria-selected={level === current}
              tabIndex={-1}
              onClick={() => selectLevel(level)}
              onKeyDown={onOptionKeyDown}
              onMouseEnter={() => setActive(level)}
            >
              <span>{getLabel(level)}</span>
              {level === current && (
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m3.2 8.3 3.2 3.1 6.5-6.7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
