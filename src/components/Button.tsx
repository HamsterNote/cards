import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 按钮变体 */
  variant?: 'filled' | 'outlined' | 'ghost';
  /** 按钮尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 子节点 */
  children?: ReactNode;
}

export function Button({
  variant = 'filled',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`cards-button cards-button--${variant} cards-button--${size} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
