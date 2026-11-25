import { Backdrop, Ground } from '../environment/Ground';
import { Paths } from '../environment/Paths';

/** Office: a square floor with carpet walkways (walls and furniture come from the world's props). */
export function OfficeScene() {
  return (
    <>
      <Backdrop />
      <Ground />
      <Paths width={1.5} pebbles={false} plaza={0} />
    </>
  );
}
