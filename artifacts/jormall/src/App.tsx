import LandingPage from '@/pages/landing';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui/spinner';
import { I18nProvider } from '@/lib/i18n';
import { AuthProvider, homePath, useAuth } from '@/lib/auth';
import {ManagerBranchProvider,useManagerBranch} from '@/lib/manager-branch';
import { canOpenSetupStep, isClinicSetupPath, SETUP_PATH, useClinicSetup } from '@/lib/clinic-setup';
import ClinicSetupPage from '@/pages/clinic/clinic-setup';
import PackagesPage from '@/pages/clinic/packages-page';
import NotFound from '@/pages/not-found';
import SetupPage from '@/pages/setup';
import LoginPage from '@/pages/login';
import ChangePasswordPage from '@/pages/change-password';
import ClinicsPage from '@/pages/owner/clinics';
import ClinicDetailPage from '@/pages/owner/clinic-detail';
import { BranchesPage, ServicesPage, EmployeesPage, CustomersPage } from '@/pages/clinic/setup-page';
import RoomsPage from '@/pages/clinic/rooms-page';
import ClinicHomePage from '@/pages/clinic/home';
import ChooseBranchPage from '@/pages/clinic/choose-branch';
import BookingPage from '@/pages/clinic/booking-page';
import AppointmentsView from '@/pages/clinic/appointments-view';
import AppointmentDetailPage from '@/pages/clinic/appointment-detail';
import ReschedulePage from '@/pages/clinic/reschedule-page';
import WaitingListPage from '@/pages/clinic/waiting-list-page';
import { InventoryDetailPage } from '@/pages/clinic/inventory-page';
import InventoryPage from '@/pages/clinic/inventory-workspace';
import EquipmentMaterialsPage from '@/pages/clinic/equipment-materials-page';
import { AppointmentsPage, BusinessPage, PeoplePage } from '@/pages/clinic/sections';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function FullscreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <Spinner className="size-6 text-primary" />
    </div>
  );
}

/** Routes for visitors who are not signed in. */
function PublicRoutes() {
  const { needsSetup } = useAuth();
  return (
    <Switch>
      <Route path="/" component={LandingPage}/>
      <Route path="/setup">{needsSetup ? <SetupPage /> : <Redirect to="/login" />}</Route>
      <Route path="/login">{needsSetup ? <Redirect to="/setup" /> : <LoginPage />}</Route>
      <Route>
        <Redirect to={needsSetup ? '/setup' : '/login'} />
      </Route>
    </Switch>
  );
}

/** Routes for signed-in users; gated by role on the server and mirrored here. */
function PrivateRoutes() {
  const { user } = useAuth();
  const branch=useManagerBranch();
  const setup = useClinicSetup();
  const [location]=useLocation();
  if (!user) return null;

  const isOwner = user.role === 'platform_owner';
  const has = (key: 'appointments' | 'people' | 'business') => user.nav.includes(key);
  if(user.role==='manager'&&!user.mustChangePassword&&(branch.loading||setup.loading))return <FullscreenLoader/>;
  if (!user.mustChangePassword && setup.required && !isClinicSetupPath(location) && !(setup.paused && location === '/home') && !canOpenSetupStep(location, setup.progress)) return <Redirect to={setup.paused ? '/home' : SETUP_PATH} />;
  if(user.role==='manager'&&!setup.required&&branch.needsEntryChoice&&location!=='/choose-branch')return <Redirect to="/choose-branch"/>;

  // `/change-password` is always first and stays mounted while the user record updates, so the
  // forced first-login change can finish and redirect without racing the guard below.
  return (
    <Switch>
      <Route path="/change-password" component={ChangePasswordPage} />
      {user.mustChangePassword ? (
        <Route>
          <Redirect to="/change-password" />
        </Route>
      ) : (
        <>
          <Route path="/">
            <Redirect to={homePath(user)} />
          </Route>
          <Route path="/login">
            <Redirect to={homePath(user)} />
          </Route>
          <Route path="/setup">
            <Redirect to={homePath(user)} />
          </Route>
          {user.role==='manager'&&<Route path="/choose-branch" component={ChooseBranchPage}/>}
          <Route>
            <AppShell>
              <RoutedErrorBoundary>
                <Switch>
                  {isOwner && <Route path="/clinics" component={ClinicsPage} />}
                  {isOwner && <Route path="/clinics/:id" component={ClinicDetailPage} />}
                  {!isOwner && <Route path="/home" component={ClinicHomePage} />}
                  {user.role === 'manager' && <Route path={SETUP_PATH} component={ClinicSetupPage} />}
                  {!isOwner && has('appointments') && <Route path="/appointments/new" component={BookingPage} />}
                  {!isOwner && has('appointments') && <Route path="/appointments/view" component={AppointmentsView} />}
                  {!isOwner && has('appointments') && <Route path="/appointments/waiting-list" component={WaitingListPage} />}
                  {!isOwner && has('appointments') && <Route path="/appointments/:id/reschedule" component={ReschedulePage} />}
                  {!isOwner && has('appointments') && <Route path="/appointments/:id" component={AppointmentDetailPage} />}
                  {!isOwner && has('appointments') && <Route path="/appointments" component={AppointmentsPage} />}
                  {!isOwner && has('people') && <Route path="/people/customers" component={CustomersPage} />}
                  {!isOwner && has('people') && <Route path="/people/employees" component={EmployeesPage} />}
                  {!isOwner && has('people') && <Route path="/people" component={PeoplePage} />}
                  {!isOwner && has('business') && <Route path="/business/settings" component={BranchesPage} />}
                  {!isOwner && has('business') && <Route path="/business/services/packages" component={PackagesPage} />}
                  {!isOwner && has('business') && <Route path="/business/services" component={ServicesPage} />}
                  {!isOwner && has('business') && <Route path="/business/rooms" component={RoomsPage} />}
                  {!isOwner && has('business') && <Route path="/business/equipment-materials" component={EquipmentMaterialsPage} />}
                  {!isOwner && has('business') && <Route path="/business/inventory/:id" component={InventoryDetailPage} />}
                  {!isOwner && has('business') && <Route path="/business/inventory" component={InventoryPage} />}
                  {!isOwner && has('business') && <Route path="/business" component={BusinessPage} />}
                  <Route component={NotFound} />
                </Switch>
              </RoutedErrorBoundary>
            </AppShell>
          </Route>
        </>
      )}
    </Switch>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const [location]=useLocation();
  if (isLoading) return <FullscreenLoader />;
  if(location==='/welcome')return <LandingPage/>;
  return user ? <PrivateRoutes /> : <PublicRoutes />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <ManagerBranchProvider><Router /></ManagerBranchProvider>
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
