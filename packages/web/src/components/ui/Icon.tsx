import React from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

export type { IconSvgElement };

export type IconProps = {
  icon: IconSvgElement;
  size?: number;
  /** Couleur principale de l'icône (stroke) */
  color?: string;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
};

export function Icon({
  icon,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
}: IconProps): React.JSX.Element {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      primaryColor={color}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    />
  );
}
