import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold rounded-2xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#174b32] focus-visible:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[44px]';

  const variants = {
    primary: 'bg-[#174b32] text-white hover:bg-[#0f3423] active:bg-[#0a2317] shadow-xs',
    secondary: 'bg-[#dcecdf] text-[#174b32] hover:bg-[#cbdec9] active:bg-[#b9cfb7]',
    outline:
      'border border-[#14221b]/20 bg-white text-[#14221b] hover:bg-[#f4f4ec] active:bg-[#e8e8dc]',
    danger: 'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 shadow-xs',
  }[variant];

  const sizes = {
    sm: 'text-xs px-3.5 py-2',
    md: 'text-sm px-5 py-2.5',
    lg: 'text-base px-6 py-3',
  }[size];

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants} ${sizes} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg
            className="animate-spin h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Processing...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
