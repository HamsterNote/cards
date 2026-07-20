import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CardsTheme } from '../theme';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮变体 */
  variant?: 'filled' | 'outlined' | 'ghost';
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 主题：light（默认）或 dark */
  theme?: CardsTheme;
  /** 子节点 */
  children?: ReactNode;
}

export function Button({
  variant = 'filled',
  size = 'md',
  theme = 'light',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      data-theme={theme}
      className={`cards-button cards-button--${variant} cards-button--${size} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
