import { createContext, useContext, useState, useCallback, useEffect } from "react";

const RioCaseContext = createContext({
  caseId: null,
  caseTitle: null,
  setRioCase: () => {},
  clearRioCase: () => {},
});

export function RioCaseProvider({ children }) {
  const [state, setState] = useState({ caseId: null, caseTitle: null });

  const setRioCase = useCallback((info) => {
    setState({
      caseId: info?.caseId ?? null,
      caseTitle: info?.caseTitle ?? null,
    });
  }, []);

  const clearRioCase = useCallback(() => {
    setState({ caseId: null, caseTitle: null });
  }, []);

  return (
    <RioCaseContext.Provider value={{ ...state, setRioCase, clearRioCase }}>
      {children}
    </RioCaseContext.Provider>
  );
}

export function useRioCase() {
  return useContext(RioCaseContext);
}

// Helper for case pages: sets context on mount, clears on unmount.
export function useSetRioCase(info) {
  const { setRioCase, clearRioCase } = useRioCase();
  useEffect(() => {
    setRioCase(info);
    return () => clearRioCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.caseId, info?.caseTitle]);
}
