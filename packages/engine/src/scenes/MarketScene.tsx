import { Backdrop, Ground } from '../environment/Ground';
import { Paths } from '../environment/Paths';
import { GlowDriver } from '../assets/shapes';
import { Crowd } from '../ambient/Crowd';

/** Market: cobbled square, sandy walkways and shoppers browsing between the stalls. */
export function MarketScene() {
  return (
    <>
      <Backdrop />
      <Ground />
      <Paths width={1.6} pebbles plaza={3.2} />
      <Crowd count={8} colors={['#f1d3b3', '#cfe3d6', '#e7cfe0', '#d6dcef', '#f3e3b0']} />
      <GlowDriver />
    </>
  );
}
