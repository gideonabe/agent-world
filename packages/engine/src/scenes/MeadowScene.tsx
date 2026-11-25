import { Island } from '../environment/Island';
import { Water } from '../environment/Water';
import { Paths } from '../environment/Paths';
import { Clouds } from '../environment/Sky';

/** Meadow Island: the round island, animated water, dirt paths and drifting clouds. */
export function MeadowScene() {
  return (
    <>
      <Island />
      <Water />
      <Paths />
      <Clouds />
    </>
  );
}
