import { Geometry } from "three";
declare module "three/addons/utils/BufferGeometryUtils.js" {
    function mergeGeometries(geometries: Geometry[]): Geometry;
}

export { }