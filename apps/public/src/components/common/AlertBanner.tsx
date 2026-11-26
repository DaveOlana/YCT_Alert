import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type BannerVariant = 'error' | 'warning' | 'info' | 'success';

interface AlertBannerProps {
  variant?: BannerVariant;
  title?: string;
  children: React.ReactNode;
  id?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  variant = 'info',
  title,
  children,
  id,
}) => {
  const styles = {
    error: {
      container: 'bg-red-50 border-red-300 text-red-950',
      icon: <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />,
      titleColor: 'text-red-900',
    },
    warning: {
      container: 'bg-amber-50 border-amber-300 text-amber-950',
      icon: <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />,
      titleColor: 'text-amber-900',
    },
    info: {
      container: 'bg-emerald-50 border-emerald-300 text-emerald-950',
      icon: <Info className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />,
      titleColor: 'text-emerald-900',
    },
    success: {
      container: 'bg-green-50 border-green-300 text-green-950',
      icon: <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" aria-hidden="true" />,
      titleColor: 'text-green-900',
    },
  }[variant];

  return (
    <div
      id={id}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`border rounded-2xl p-4 text-xs sm:text-sm flex items-start gap-3 shadow-2xs ${styles.container}`}
    >
      {styles.icon}
      <div className="space-y-0.5 flex-1">
        {title && <p className={`font-semibold ${styles.titleColor}`}>{title}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
    </div>
  );
};
