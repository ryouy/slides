import { ART_LEVELS, type ArtLevel } from '../logic/board';
import { SlideSelect } from './SlideSelect';

interface Props {
  current: ArtLevel;
  getLabel: (level: ArtLevel) => string;
  ariaLabel: string;
  onSelect: (level: ArtLevel) => void;
  disabled?: boolean;
}

/** Large piece count, compact chevron, sliding checked choices below it. */
export function ArtLevelMenu({ current, getLabel, ariaLabel, onSelect, disabled = false }: Props) {
  const options = ART_LEVELS.map((level) => ({ value: level, label: getLabel(level) }));
  return (
    <SlideSelect
      value={current}
      options={options}
      onChange={onSelect}
      ariaLabel={ariaLabel}
      testId="art-size-select"
      className="art-level-menu-wrap"
      triggerClassName="art-level-trigger"
      optionsClassName="art-level-options"
      optionClassName="art-level-option"
      disabled={disabled}
    />
  );
}
