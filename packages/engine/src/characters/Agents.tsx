import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useEngine } from '../context';
import { Robot } from './Robot';

/** Renders one Robot per registered agent. Re-renders only when the id set changes. */
export function Agents() {
  const { store } = useEngine();
  const ids = useStore(store, useShallow((s) => Object.keys(s.agents)));
  return (
    <group>
      {ids.map((id) => (
        <Robot key={id} agentId={id} />
      ))}
    </group>
  );
}
