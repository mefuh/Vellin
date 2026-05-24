import { createContext, useContext, type ReactNode } from 'react';
import type { UseCallApi } from './useCall';

const CallContext = createContext<UseCallApi | null>(null);

export function CallProvider({
  value,
  children,
}: {
  value: UseCallApi;
  children: ReactNode;
}) {
  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCallContext(): UseCallApi {
  const v = useContext(CallContext);
  if (!v) throw new Error('useCallContext must be used within <CallProvider>');
  return v;
}
