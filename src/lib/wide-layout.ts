import { createContext, useContext } from 'react';

// True inside the web admin: shared screens drop the 520px phone column and use desktop widths.
export const WideLayout = createContext(false);
export const useWideLayout = () => useContext(WideLayout);
