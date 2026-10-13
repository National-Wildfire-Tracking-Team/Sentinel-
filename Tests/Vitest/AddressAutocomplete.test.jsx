import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AddressAutocomplete from '../../src/app/components/Routing/AddressAutocomplete';

const results = [
  { id: 'a', label: '1 Main St, Sacramento, CA', lat: 38.5, lng: -121.5 },
  { id: 'b', label: '1 Main Ave, Davis, CA', lat: 38.6, lng: -121.7 },
];

const setup = (props = {}) => {
  const p = {
    onSelect: vi.fn(), onSubmitText: vi.fn(), suggest: vi.fn().mockResolvedValue(results),
    ariaLabel: 'Start address', placeholder: 'Choose a start point', ...props,
  };
  render(<AddressAutocomplete {...p} />);
  return { ...p, input: screen.getByRole('combobox', { name: 'Start address' }) };
};

const type = (input, value) => fireEvent.change(input, { target: { value } });
const flush = async (ms = 300) => { await act(async () => { vi.advanceTimersByTime(ms); }); await act(async () => {}); };

describe('AddressAutocomplete', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces: one call after typing quickly', async () => {
    const { input, suggest } = setup({ proximity: [-121, 38] });
    type(input, '1 M');
    await act(async () => { vi.advanceTimersByTime(100); });
    type(input, '1 Ma');
    await act(async () => { vi.advanceTimersByTime(100); });
    type(input, '1 Main');
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(suggest).not.toHaveBeenCalled();
    await flush(50);
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith('1 Main', expect.objectContaining({ proximity: [-121, 38], signal: expect.any(AbortSignal) }));
  });

  it('does not fetch under 3 characters', async () => {
    const { input, suggest } = setup();
    type(input, '1 ');
    await flush();
    expect(suggest).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows options', async () => {
    const { input } = setup();
    type(input, '1 Main');
    await flush();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAccessibleName('1 Main St, Sacramento, CA');
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('caps the list at 5', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, label: `Place ${i}`, lat: 38, lng: -121 }));
    const { input } = setup({ suggest: vi.fn().mockResolvedValue(many) });
    type(input, 'Place');
    await flush();
    expect(screen.getAllByRole('option')).toHaveLength(5);
  });

  it('shows "No matches" when nothing matches', async () => {
    const { input } = setup({ suggest: vi.fn().mockResolvedValue([]) });
    type(input, 'zzzz');
    await flush();
    const row = screen.getByText('No matches', { selector: '[data-testid="autocomplete-hint"]' });
    expect(row.closest('[role="listbox"]')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
  });

  it('announces the number of suggestions', async () => {
    const { input } = setup();
    expect(screen.getByRole('status')).toHaveTextContent('');
    type(input, '1 Main');
    await flush();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('2 suggestions');
  });

  it('shows a searching row while loading', async () => {
    const { input } = setup({ suggest: vi.fn(() => new Promise(() => {})) });
    type(input, '1 Main');
    await flush();
    expect(screen.getByText('Searching…').closest('[role="listbox"]')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ArrowDown + Enter selects the highlighted suggestion', async () => {
    const { input, onSelect, onSubmitText } = setup();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith({ lat: 38.5, lng: -121.5, label: '1 Main St, Sacramento, CA' });
    expect(onSubmitText).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clicking an option selects it', async () => {
    const { input, onSelect } = setup();
    type(input, '1 Main');
    await flush();
    const option = screen.getAllByRole('option')[1];
    // Mouse-down keeps focus in the input (no blur closes the list first) …
    expect(fireEvent.mouseDown(option)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    // … and the choice commits on release.
    fireEvent.click(option);
    expect(input).toHaveValue('');
    expect(onSelect).toHaveBeenCalledWith({ lat: 38.6, lng: -121.7, label: '1 Main Ave, Davis, CA' });
  });

  it('Escape closes the list', async () => {
    const { input } = setup();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('1 Main');
  });

  it('a second Escape clears the text', async () => {
    const { input, suggest } = setup();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
    await flush();
    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it('blur closes the list', async () => {
    const { input } = setup();
    type(input, '1 Main');
    await flush();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Enter with no highlight calls onSubmitText', async () => {
    const { input, onSubmitText, onSelect } = setup();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmitText).toHaveBeenCalledWith('1 Main');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores stale responses', async () => {
    let resolveFirst;
    const suggest = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce([results[1]]);
    const { input } = setup({ suggest });
    type(input, '1 Mai');
    await flush();
    const firstSignal = suggest.mock.calls[0][1].signal;
    type(input, '1 Main Ave');
    expect(firstSignal.aborted).toBe(true);
    await flush();
    await act(async () => resolveFirst([results[0]]));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName('1 Main Ave, Davis, CA');
  });

  it('a failed fetch shows no list', async () => {
    const { input, onSubmitText } = setup({ suggest: vi.fn().mockRejectedValue(new Error('boom')) });
    type(input, '1 Main');
    await flush();
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmitText).toHaveBeenCalledWith('1 Main');
  });

  it('has combobox ARIA attributes', async () => {
    const { input } = setup();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('enterkeyhint', 'search');
    expect(input).toHaveAttribute('autocomplete', 'off');
    type(input, '1 Main');
    await flush();
    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(listbox.className).toContain('backdrop-blur-xl');
    expect(listbox.className).toContain('route-safety-suggestions');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false');
  });
  it('choosing a suggestion clears the text, closes the list and blurs the input', async () => {
    const { input } = setup();
    input.focus();
    type(input, '1 Main');
    await flush();
    const option = screen.getAllByRole('option')[0];
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).not.toBe(input);
  });

  it('Enter with text submits, clears the text and closes the list, keeping keyboard focus', async () => {
    const { input, onSubmitText } = setup();
    input.focus();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmitText).toHaveBeenCalledWith('1 Main');
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByTestId('autocomplete-hint')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('disabled blocks input and fetching, and shows the hint', async () => {
    const { input, suggest, onSubmitText } = setup({ disabled: true, hint: 'Set a start first' });
    expect(input).toBeDisabled();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(suggest).not.toHaveBeenCalled();
    expect(onSubmitText).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('Set a start first')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('Set a start first');
  });

  it('a keyboard-chosen suggestion keeps focus in the input', async () => {
    const { input, onSelect } = setup();
    input.focus();
    type(input, '1 Main');
    await flush();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalled();
    expect(input).toHaveValue('');
    expect(document.activeElement).toBe(input);
  });

  it('merges inputClassName onto the input', () => {
    const { input } = setup({ inputClassName: 'placeholder:text-white' });
    expect(input.className).toContain('placeholder:text-white');
    expect(input.className).toContain('min-h-[40px]');
  });
});
