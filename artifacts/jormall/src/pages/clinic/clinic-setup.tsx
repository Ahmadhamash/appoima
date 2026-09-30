import { useEffect } from 'react';
import { WorkspaceHome } from '@/components/workspace/workspace-home';
import '@/components/concierge/concierge.css';

export default function ClinicSetupPage() {
  useEffect(() => {
    document.documentElement.classList.add('jc-setup-page');
    return () => document.documentElement.classList.remove('jc-setup-page');
  }, []);
  return <section aria-hidden="true" inert data-testid="clinic-setup-background"><WorkspaceHome /></section>;
}
