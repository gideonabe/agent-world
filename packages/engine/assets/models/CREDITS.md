# Model credits

All models are released under **CC0 1.0 (public domain)**. Attribution isn't required, but it's appreciated.

| Folder | Source | Author | License |
|---|---|---|---|
| `robot/RobotExpressive.glb` | three.js examples (`examples/models/gltf/RobotExpressive`) | Tomás Laulhé (Quaternius), modified by Don McCurdy | CC0 |
| `nature/*.glb` | [Kenney Nature Kit 2.1](https://kenney.nl/assets/nature-kit) | Kenney | CC0 |
| `furniture/*.glb` | [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | Kenney | CC0 |

The original downloads (including full license files) are in `assets-src/_download/`.

Note: Kenney Nature Kit materials export with `metallicFactor: 1`. The engine resets
metalness on load (`prepareMaterials` in `packages/engine/src/assets/Model.tsx`).
