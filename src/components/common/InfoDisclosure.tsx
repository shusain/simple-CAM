import React from 'react';
import { Info } from 'lucide-react';

interface InfoDisclosureProps {
  label: string;
  children: React.ReactNode;
}

export default function InfoDisclosure({
  label,
  children,
}: InfoDisclosureProps): React.JSX.Element {
  return (
    <details className="info-disclosure">
      <summary aria-label={label} title={label}>
        <Info aria-hidden="true" size={16} />
      </summary>
      <div className="info-disclosure-content">{children}</div>
    </details>
  );
}
