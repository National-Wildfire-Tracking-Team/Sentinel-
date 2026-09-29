import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmSignOutDialog from '../../src/shared/components/ConfirmSignOutDialog/ConfirmSignOutDialog';

const onConfirm = vi.fn();
const onCancel = vi.fn();

const renderDialog = (props = {}) =>
  render(<ConfirmSignOutDialog open busy={false} onConfirm={onConfirm} onCancel={onCancel} {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConfirmSignOutDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks the user to confirm signing out', () => {
    renderDialog();
    expect(screen.getByRole('alertdialog', { name: 'Sign out?' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to sign out/)).toBeInTheDocument();
  });

  it('focuses "No" by default so Enter does not sign out by accident', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'No, stay signed in' })).toHaveFocus();
  });

  it('confirms on Yes and cancels on No', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, sign out' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'No, stay signed in' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape', () => {
    renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on a backdrop click but not on a click inside the dialog', () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole('alertdialog'));
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.querySelector('[data-confirm-signout]'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and ignores Escape while signing out', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No, stay signed in' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
