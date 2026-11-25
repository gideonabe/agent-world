import { Backdrop, Ground } from '../environment/Ground';
import { Paths } from '../environment/Paths';
import { GlowDriver } from '../assets/shapes';
import { RingRoad, Traffic } from '../ambient/Traffic';
import { Crowd } from '../ambient/Crowd';
import { CITY_ROAD } from '../presets/city';

/** City: sidewalks, a ring road with traffic in both directions, and a few people out and about. */
export function CityScene() {
  return (
    <>
      <Backdrop />
      <Ground tiles={false} />
      <RingRoad half={CITY_ROAD} />
      <Traffic half={CITY_ROAD} perLane={3} />
      <Paths width={1.3} pebbles={false} plaza={3.2} />
      <Crowd count={5} />
      <GlowDriver />
    </>
  );
}
