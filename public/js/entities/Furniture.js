// Furniture is handled via the tilemap, this module provides
// additional interactive furniture objects if needed in the future.

class Furniture {
  constructor(scene, x, y, type) {
    this.scene = scene;
    this.type = type;
  }
}

window.Furniture = Furniture;
export default Furniture;
