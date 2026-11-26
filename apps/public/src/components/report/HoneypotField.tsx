import React from 'react';

interface HoneypotFieldProps {
  value?: string;
  onChange: (value: string) => void;
}

export const HoneypotField: React.FC<HoneypotFieldProps> = ({ value = '', onChange }) => {
  return (
    <div className="sr-only" aria-hidden="true" tabIndex={-1}>
      <label htmlFor="website_url">Leave this field blank</label>
      <input
        type="text"
        id="website_url"
        name="website_url"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};
