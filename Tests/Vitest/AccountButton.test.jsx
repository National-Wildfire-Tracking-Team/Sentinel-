import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useApp } from '../../src/app/context/AppContext';
import { useAuth } from '../../src/shared/context/AuthContext';
import AccountButton from '../../src/app/components/MapControls/AccountButton';
import AccountPanel from '../../src/app/components/AccountPanel/AccountPanel';
import MapCornerButtons from '../../src/app/components/MapControls/MapCornerButtons';

vi.mock('../../src/app/context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('../../src/shared/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/app/context/AppStatusContext', () => ({
  useAppStatus: vi.fn(() => ({ userLocation: null, setUserLocation: vi.fn() })),
}));
vi.mock('../../src/app/context/ViewportContext', () => ({
  useViewport: vi.fn(() => ({ viewport: {}, setViewport: vi.fn() })),
}));
vi.mock('../../src/app/components/Auth/LoginModal', () => ({
  default: () => <div>Login modal</div>,
}));
vi.mock('../../src/app/components/Auth/MapAddressSearchPanel', () => ({
  default: () => null,
}));

const toggleAccountPanel = vi.fn();
const signOut = vi.fn();

function mockApp(overrides = {}) {
  useApp.mockReturnValue({
    accountPanelOpen: false,
    toggleAccountPanel,
    sidebarOpen: false,
    toggleSidebar: vi.fn(),
    futurePanelOpen: false,
    toggleFuturePanel: vi.fn(),
    layerPanelOpen: false,
    locationGranted: false,
    grantLocation: vi.fn(),
    ...overrides,
  });
}

function mockAuth(signedIn) {
  useAuth.mockReturnValue({
    isAuthenticated: signedIn,
    user: signedIn ? { email: 'test@example.com' } : null,
    signOut,
  });
}

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mockApp();
  mockAuth(false);
});

describe('AccountButton', () => {
  it('renders in the top-right corner', () => {
    renderWithRouter(<AccountButton />);
    const button = screen.getByRole('button', { name: 'Open account menu' });
    expect(button.parentElement).toHaveClass('top-4', 'right-4');
  });

  it('toggles the account panel on click', () => {
    renderWithRouter(<AccountButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
    expect(toggleAccountPanel).toHaveBeenCalledTimes(1);
  });

  it('reflects the open state via aria-pressed', () => {
    mockApp({ accountPanelOpen: true });
    renderWithRouter(<AccountButton />);
    expect(screen.getByRole('button', { name: 'Open account menu' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the signed-in dot only when authenticated', () => {
    const { container, unmount } = renderWithRouter(<AccountButton />);
    expect(container.querySelector('.bg-green-500')).toBeNull();
    unmount();

    mockAuth(true);
    const signedIn = renderWithRouter(<AccountButton />);
    expect(signedIn.container.querySelector('.bg-green-500')).not.toBeNull();
  });

  it('is marked as the account trigger so outside-click does not re-toggle', () => {
    const { container } = renderWithRouter(<AccountButton />);
    expect(container.querySelector('[data-account-trigger]')).not.toBeNull();
  });
});

describe('AccountPanel', () => {
  it('renders nothing when closed', () => {
    renderWithRouter(<AccountPanel />);
    expect(screen.queryByText('Account')).toBeNull();
  });

  it('shows Sign In when signed out', () => {
    mockApp({ accountPanelOpen: true });
    renderWithRouter(<AccountPanel />);
    expect(screen.getByRole('button', { name: /Sign In/ })).toBeInTheDocument();
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('shows the email, account links and Sign Out when signed in', () => {
    mockApp({ accountPanelOpen: true });
    mockAuth(true);
    renderWithRouter(<AccountPanel />);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage My Zip Codes/ })).toHaveAttribute('href', '/manage-zipcodes');
    expect(screen.getByRole('link', { name: /Account Settings/ })).toHaveAttribute('href', '/account');
  });

  it('signs out and closes the panel', () => {
    mockApp({ accountPanelOpen: true });
    mockAuth(true);
    renderWithRouter(<AccountPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Sign Out/ }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(toggleAccountPanel).toHaveBeenCalledTimes(1);
  });

  it('is anchored top-right below the account button', () => {
    mockApp({ accountPanelOpen: true });
    renderWithRouter(<AccountPanel />);
    const panel = screen.getByText('Account').closest('.absolute');
    expect(panel).toHaveClass('top-[68px]', 'right-4');
  });

  it('closes on outside click but not on the trigger', () => {
    mockApp({ accountPanelOpen: true });
    renderWithRouter(
      <>
        <AccountButton />
        <AccountPanel />
      </>
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Open account menu' }));
    expect(toggleAccountPanel).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(toggleAccountPanel).toHaveBeenCalledTimes(1);
  });
});

describe('MapCornerButtons', () => {
  it('no longer contains the account button', () => {
    mockAuth(true);
    renderWithRouter(<MapCornerButtons />);
    expect(screen.queryByRole('button', { name: /account/i })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
