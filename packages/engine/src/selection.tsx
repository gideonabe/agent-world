import { createContext, useContext } from 'react';

export interface SelectionValue {
  selectedId: string | null;
  select: (id: string | null) => void;
}

export const SelectionContext = createContext<SelectionValue>({ selectedId: null, select: () => {} });

export function useSelection() {
  return useContext(SelectionContext);
}
