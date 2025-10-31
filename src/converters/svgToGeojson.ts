import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { pathologize } from 'svg-to-geojson/src/pathologize';
import { pathToCoords } from 'svg-to-geojson/src/path-to-coordinates';

type SvgToGeoJsonResult = {
  collection: FeatureCollection;
  metadata: {
    featureCount: number;
    pathCount: number;
    samplePoints: number;
  };
};

export interface SvgToGeoJsonOptions {
  samplePoints?: number;
  translateX?: number;
  translateY?: number;
  scale?: number;
  flipY?: boolean;
  precision?: number;
}

const DEFAULT_SAMPLE_POINTS = 250;

function parseLength(value: string | null): number | null {
  if (!value) return null;
  const numeric = parseFloat(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return numeric;
}

function closeRing(coords: number[][]): number[][] {
  if (coords.length === 0) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return coords;
  }
  return [...coords, first];
}

function roundCoords(coords: number[][], precision?: number): number[][] {
  if (precision == null) {
    return coords;
  }
  const factor = Math.pow(10, precision);
  return coords.map(([x, y]) => [Math.round(x * factor) / factor, Math.round(y * factor) / factor]);
}

function inferGeometry(
  coords: number[][],
  pathElement: SVGPathElement,
  flipY: boolean,
  svgHeight: number | null,
  precision?: number
): Feature<Geometry, GeoJsonProperties> {
  const identifier = pathElement.getAttribute('id') ?? undefined;
  const fill = pathElement.getAttribute('fill') ?? undefined;
  const stroke = pathElement.getAttribute('stroke') ?? undefined;
  const strokeWidth = pathElement.getAttribute('stroke-width') ?? undefined;
  const name = pathElement.getAttribute('inkscape:label') ?? pathElement.getAttribute('data-name') ?? undefined;

  const closedPath = /z\s*$/i.test(pathElement.getAttribute('d') ?? '');
  const hasFill = !!fill && fill !== 'none';

  const transformedCoords = coords.map(([x, y]) => {
    if (flipY && svgHeight != null) {
      return [x, svgHeight - y];
    }
    return [x, y];
  });

  const rounded = roundCoords(transformedCoords, precision);

  const properties: GeoJsonProperties = {
    ...(identifier ? { id: identifier } : {}),
    ...(name ? { name } : {}),
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(strokeWidth ? { strokeWidth } : {}),
  };

  if (closedPath || hasFill) {
    return {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [closeRing(rounded)],
      },
      properties,
    };
  }

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: rounded,
    },
    properties,
  };
}

function stripUnsupported(svgMarkup: string): string {
  return svgMarkup
    .replace(/<clipPath[\s\S]*?<\/clipPath>/gi, '')
    .replace(/<mask[\s\S]*?<\/mask>/gi, '')
    .replace(/<defs[\s\S]*?<\/defs>/gi, (match) => {
      // Preserve gradient/marker definitions but remove clipPath/mask inside defs
      return match.replace(/<clipPath[\s\S]*?<\/clipPath>/gi, '').replace(/<mask[\s\S]*?<\/mask>/gi, '');
    });
}

export async function convertSvgToGeoJson(svgText: string, options: SvgToGeoJsonOptions = {}): Promise<SvgToGeoJsonResult> {
  const { samplePoints = DEFAULT_SAMPLE_POINTS, translateX = 0, translateY = 0, scale = 1, flipY = true, precision } = options;
  if (!svgText.trim()) {
    throw new Error('SVG input is empty.');
  }

  let sanitized = svgText;
  try {
    sanitized = await pathologize(svgText);
  } catch (error) {
    const cleaned = stripUnsupported(svgText);
    if (cleaned !== svgText) {
      try {
        sanitized = await pathologize(cleaned);
      } catch {
        sanitized = cleaned;
      }
    } else {
      sanitized = svgText;
    }
  }

  const container = document.createElement('div');
  container.innerHTML = sanitized;

  const svg = container.querySelector('svg');
  if (!svg) {
    throw new Error('Provided input does not contain a valid <svg> element.');
  }

  const svgHeight =
    parseLength(svg.getAttribute('height')) ??
    (() => {
      const viewBox = svg.getAttribute('viewBox');
      if (!viewBox) return null;
      const parts = viewBox.trim().split(/\s+/);
      if (parts.length !== 4) return null;
      const height = parseFloat(parts[3]);
      return Number.isNaN(height) ? null : height;
    })();

  const paths = Array.from(container.querySelectorAll('path'));
  if (!paths.length) {
    throw new Error('No <path> elements were found in the SVG.');
  }

  const features: Feature<Geometry, GeoJsonProperties>[] = [];

  paths.forEach((pathElement) => {
    const { coords } = pathToCoords(pathElement, scale, samplePoints, translateX, translateY);
    if (!coords.length) {
      return;
    }
    const feature = inferGeometry(coords, pathElement, flipY, svgHeight, precision);
    features.push(feature);
  });

  return {
    collection: {
      type: 'FeatureCollection',
      features,
    },
    metadata: {
      featureCount: features.length,
      pathCount: paths.length,
      samplePoints,
    },
  };
}
