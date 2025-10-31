import type { Feature, GeoJSON, Geometry } from 'geojson';
import { GeoJSON2SVG } from 'geojson2svg';

export interface GeoJsonToSvgOptions {
  viewportWidth: number;
  viewportHeight: number;
  mapExtent?: {
    left: number;
    bottom: number;
    right: number;
    top: number;
  };
  precision?: number;
  fitTo?: 'width' | 'height';
  pointRadius?: number;
  mapExtentFromGeojson?: boolean;
}

type GeoJsonToSvgResult = {
  svg: string;
  metadata: {
    elementCount: number;
    bbox: BoundingBox | null;
  };
};

type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function flattenCoords(geometry: Geometry, collection: number[][] = []): number[][] {
  switch (geometry.type) {
    case 'Point':
      collection.push(geometry.coordinates as number[]);
      break;
    case 'MultiPoint':
    case 'LineString':
      (geometry.coordinates as number[][]).forEach((coord) => collection.push(coord));
      break;
    case 'MultiLineString':
    case 'Polygon':
      (geometry.coordinates as number[][][]).forEach((ring) => ring.forEach((coord) => collection.push(coord)));
      break;
    case 'MultiPolygon':
      (geometry.coordinates as number[][][][]).forEach((poly) =>
        poly.forEach((ring) => ring.forEach((coord) => collection.push(coord)))
      );
      break;
    case 'GeometryCollection':
      geometry.geometries.forEach((geom) => flattenCoords(geom, collection));
      break;
    default:
      break;
  }
  return collection;
}

function computeBoundingBox(geojson: GeoJSON): BoundingBox | null {
  const coords: number[][] = [];

  const collect = (feature: Feature | null) => {
    if (!feature || !feature.geometry) return;
    flattenCoords(feature.geometry, coords);
  };

  if (geojson.type === 'FeatureCollection') {
    geojson.features.forEach((feature) => collect(feature));
  } else if (geojson.type === 'Feature') {
    collect(geojson);
  } else {
    flattenCoords(geojson, coords);
  }

  if (!coords.length) return null;

  let minX = coords[0][0];
  let minY = coords[0][1];
  let maxX = coords[0][0];
  let maxY = coords[0][1];

  coords.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });

  return { minX, minY, maxX, maxY };
}

function buildSvgWrapper(
  elements: string[],
  width: number,
  height: number,
  extent?: GeoJsonToSvgOptions['mapExtent']
): string {
  const viewBox = extent
    ? `${extent.left} ${extent.bottom} ${extent.right - extent.left} ${extent.top - extent.bottom}`
    : `0 0 ${width} ${height}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">`,
    ...elements,
    '</svg>',
  ].join('');
}

export function convertGeoJsonToSvg(geojsonText: string, options: GeoJsonToSvgOptions): GeoJsonToSvgResult {
  const { viewportWidth, viewportHeight, mapExtent, precision, fitTo, pointRadius, mapExtentFromGeojson } = options;

  if (!geojsonText.trim()) {
    throw new Error('GeoJSON input is empty.');
  }

  let parsed: GeoJSON;
  try {
    parsed = JSON.parse(geojsonText) as GeoJSON;
  } catch (error) {
    throw new Error('GeoJSON input is not valid JSON.');
  }

  const converter = new GeoJSON2SVG({
    viewportSize: {
      width: viewportWidth,
      height: viewportHeight,
    },
    mapExtent,
    mapExtentFromGeojson,
    precision,
    fitTo,
    pointAsCircle: true,
    r: pointRadius,
  });

  const svgElements = converter.convert(parsed);
  const svg = buildSvgWrapper(svgElements, viewportWidth, viewportHeight, mapExtent);
  const bbox = computeBoundingBox(parsed);

  return {
    svg,
    metadata: {
      elementCount: svgElements.length,
      bbox,
    },
  };
}
