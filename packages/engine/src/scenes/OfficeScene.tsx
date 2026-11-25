import { Backdrop, Ground } from '../environment/Ground';
import { Paths } from '../environment/Paths';
import { Crowd } from '../ambient/Crowd';

/** Office: a square floor with carpet walkways and a few coworkers (walls and furniture come from the world's props). */
export function OfficeScene() {
  return (
    <>
      <Backdrop />
      <Ground />
      <Paths width={1.5} pebbles={false} plaza={0} />
      <Crowd count={4} colors={['#d9dee5', '#e2d9cf', '#d3dccf', '#ddd3e0']} />
    </>
  );
}
