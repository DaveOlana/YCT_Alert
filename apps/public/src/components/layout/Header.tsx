import React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="max-w-2xl mx-auto w-full pt-6 pb-4 px-4 sm:px-0">
      {/* Development Preview Banner */}
      <div
        role="region"
        aria-label="Development status disclaimer"
        className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 mb-5 text-amber-950 shadow-xs"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-xs sm:text-sm">
            <p className="font-bold uppercase tracking-wider text-amber-900 text-xs">
              Campus Safety Notice — Not for Direct Police/Fire Dispatch
            </p>
            <p className="text-amber-800 leading-relaxed">
              Reports submitted here are sent directly to the Campus Safety review team. This
              platform does not replace official emergency numbers.
            </p>
            <p className="text-amber-900 font-medium pt-1">
              If you or someone else is in immediate physical danger, please contact campus security
              or emergency authorities directly.
            </p>
          </div>
        </div>
      </div>

      {/* Main Header Branding */}
      <div className="flex items-center gap-3">
        <div
          className="bg-[#174b32] text-white p-3 rounded-2xl shadow-sm flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0d2c20]">YCT Alert</h1>
          <p className="text-xs sm:text-sm text-[#4d5c54]">
            Campus Incident Reporting & Safety Awareness (Preview)
          </p>
        </div>
      </div>
    </header>
  );
};
