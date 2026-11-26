import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="max-w-2xl mx-auto w-full py-6 px-4 sm:px-0 text-center text-xs text-[#52635a] space-y-2 border-t border-[#14221b]/10 mt-8">
      <p className="font-medium text-[#2d3d34]">
        Yaba College of Technology · Campus Safety Awareness Platform
      </p>
      <p className="leading-relaxed">
        Reports submitted through this platform assist campus security and safety personnel. In an
        immediate life-threatening situation, call the campus emergency hotline.
      </p>
    </footer>
  );
};
