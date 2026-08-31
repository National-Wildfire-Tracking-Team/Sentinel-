import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../../src/shared/components/Footer/Footer';

const renderWithRouter = (component) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('Footer', () => {
  it('renders without crashing', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('displays the NWTT brand name', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByText('NWTT')).toBeInTheDocument();
  });

  it('displays the team description', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByText(/dedicated to monitoring, tracking/)).toBeInTheDocument();
  });

  it('renders quick links section', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /About the Team/i })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: /Volunteer/i })).toHaveAttribute('href', '/volunteer');
    // jsdom's default location is http://localhost/, so getAppOrigin() resolves to app.localhost here.
    expect(screen.getByRole('link', { name: /Live Wildfire Tracker/i })).toHaveAttribute('href', 'http://app.localhost/');
  });

  it('renders resources section', () => {
    renderWithRouter(<Footer />);
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /NIFC/i })).toHaveAttribute('href', 'https://www.nifc.gov');
    expect(screen.getByRole('link', { name: /InciWeb/i })).toHaveAttribute('href', 'https://inciweb.wildfire.gov');
  });

  it('displays copyright with current year', () => {
    renderWithRouter(<Footer />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
  });

  it('renders Terms of Service links in Quick Links and bottom bar', () => {
    renderWithRouter(<Footer />);
    const links = screen.getAllByRole('link', { name: /Terms of Service/i });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link).toHaveAttribute('href', '/terms'));
  });
});
