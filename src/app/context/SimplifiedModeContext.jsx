/**
 * SimplifiedModeContext.jsx
 * Simplified Sentinel: an opt-in live-map mode for people who find the full
 * map a lot to take in. Each tab offers only its essential layers and the
 * Models tab goes away (see LayerControl / MapBottomBar); every other layer
 * comes back the moment it's turned off.
 *
 * Kept in localStorage on this device (signed-in or not), along with whether
 * the first-visit prompt (SimplifiedPrompt) has been answered.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const MODE_KEY = 'sentinel:simplified';
const PROMPT_KEY = 'sentinel:simplifiedPromptSeen';

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode etc.) — the choice still applies this session.
  }
}

// Outside a provider (e.g. a component rendered on its own) the full map shows.
const FULL_VIEW = {
  simplified: false,
  setSimplified: () => {},
  promptSeen: true,
  dismissPrompt: () => {},
};

const SimplifiedModeContext = createContext(null);

export function SimplifiedModeProvider({ children }) {
  const [simplified, setSimplifiedState] = useState(() => readFlag(MODE_KEY));
  const [promptSeen, setPromptSeen] = useState(() => readFlag(PROMPT_KEY));

  const setSimplified = useCallback((on) => {
    setSimplifiedState(on);
    writeFlag(MODE_KEY, on);
  }, []);

  const dismissPrompt = useCallback(() => {
    setPromptSeen(true);
    writeFlag(PROMPT_KEY, true);
  }, []);

  const value = useMemo(
    () => ({ simplified, setSimplified, promptSeen, dismissPrompt }),
    [simplified, setSimplified, promptSeen, dismissPrompt],
  );

  return (
    <SimplifiedModeContext.Provider value={value}>
      {children}
    </SimplifiedModeContext.Provider>
  );
}

/** Hook to read or change Simplified Sentinel */
export function useSimplifiedMode() {
  return useContext(SimplifiedModeContext) ?? FULL_VIEW;
}
