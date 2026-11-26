import React from 'react';
import { Lock, Clock } from 'lucide-react';

export const AdminFooter: React.FC = () => {
  return (
    <footer className="border-t border-[#14221b]/10 bg-white/50 backdrop-blur-sm py-4 px-6 text-xs text-[#66736c]">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center gap-2 text-emerald-900 font-medium">
          <Lock className="w-3.5 h-3.5 text-emerald-700" />
          <span>Campus Safety Operations · Secure Session Active</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#66736c]" />
            <span>Auto Sign-Out: 30 minutes idle · 12 hours max</span>
          </span>
          <span className="text-[#14221b]/20">|</span>
          <span>Yaba College of Technology · Internal Operations</span>
        </div>
      </div>
    </footer>
  );
};
