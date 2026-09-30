import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import ThreeGlobe from "three-globe";
import {
  globeConnections,
  globePoints,
  ISTANBUL,
  type GlobeConnection,
} from "../../data/globeData";

type CountryFeature = {
  type: string;
  properties: Record<string, unknown>;
  geometry: unknown;
  bbox?: [number, number, number, number];
};

type GeoJsonPosition = [number, number, ...number[]];

type BoundaryPathPoint = {
  lat: number;
  lng: number;
};

type BoundaryPath = {
  points: BoundaryPathPoint[];
};

type SurfaceDot = readonly [
  lat: number,
  lng: number,
  size: number,
  phase: number,
];

export type GlobeQuality = "low" | "medium" | "high";

type SurfaceDots = {
  dots: SurfaceDot[];
  turkeyDots: SurfaceDot[];
};

function ringToPath(ring: GeoJsonPosition[]): BoundaryPath {
  return {
    points: ring.map(([lng, lat]) => ({
      lat,
      lng,
    })),
  };
}

function extractBoundaryPaths(features: CountryFeature[]): BoundaryPath[] {
  const paths: BoundaryPath[] = [];

  for (const feature of features) {
    const geometry = feature.geometry as any;

    if (!geometry) continue;

    if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates as GeoJsonPosition[][]) {
        if (ring.length > 3) {
          paths.push(ringToPath(ring));
        }
      }
    }

    if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates as GeoJsonPosition[][][]) {
        for (const ring of polygon) {
          if (ring.length > 3) {
            paths.push(ringToPath(ring));
          }
        }
      }
    }
  }

  return paths;
}

const GLOBE_RADIUS = 100;
const DOT_POINT_SCALE = 6500;

type GlobePlacement = "background" | "interactive";

const GLOBE_POSITION: [number, number, number] = [120, -20, -88];
const GLOBE_ENTRY_POSITION: [number, number, number] = [120, -285, -88];
const GLOBE_SCALE = 1.09;
const INTERACTIVE_GLOBE_POSITION: [number, number, number] = [0, 0, 0];
const INTERACTIVE_GLOBE_ENTRY_POSITION: [number, number, number] = [0, -170, 0];
const INTERACTIVE_GLOBE_SCALE = 1.22;

//const TEXTURE_URL = "/textures/earth-night.jpg";
const TEXTURE_URL = "/textures/earth-dark.jpg";
const BUMP_TEXTURE_URL = "/textures/earth-topology.png";
const COUNTRIES_URL = "/geo/countries.geojson";
const globeAnchorPoints = globePoints.filter(
  (point) => point.label === ISTANBUL.label,
);
const DOTS_URL_BY_QUALITY: Record<GlobeQuality, string> = {
  low: "/geo/globe-dots-low.json",
  medium: "/geo/globe-dots-medium.json",
  high: "/geo/globe-dots-high.json",
};

let countriesGeoJsonPromise: Promise<{ features?: CountryFeature[] }> | null =
  null;
const boundaryPathsCache = new WeakMap<CountryFeature[], BoundaryPath[]>();
const surfaceDotsPromiseCache: Partial<Record<GlobeQuality, Promise<SurfaceDots>>> =
  {};

function loadCountriesGeoJson() {
  countriesGeoJsonPromise ??= fetch(COUNTRIES_URL).then((res) => {
    if (!res.ok) throw new Error("countries.geojson not found");
    return res.json();
  });

  return countriesGeoJsonPromise;
}

function loadSurfaceDots(quality: GlobeQuality) {
  surfaceDotsPromiseCache[quality] ??= fetch(DOTS_URL_BY_QUALITY[quality]).then(
    (res) => {
      if (!res.ok) throw new Error(`${DOTS_URL_BY_QUALITY[quality]} not found`);
      return res.json() as Promise<SurfaceDots>;
    },
  );

  return surfaceDotsPromiseCache[quality];
}

function getBoundaryPaths(features: CountryFeature[]) {
  const cached = boundaryPathsCache.get(features);

  if (cached) return cached;

  const paths = extractBoundaryPaths(features);
  boundaryPathsCache.set(features, paths);

  return paths;
}

function scheduleIdleWork(callback: () => void) {
  let didRun = false;

  const run = () => {
    if (didRun) return;
    didRun = true;
    callback();
  };

  const idleId =
    "requestIdleCallback" in window
      ? window.requestIdleCallback(run, { timeout: 1600 })
      : undefined;
  const timeoutId =
    idleId === undefined ? window.setTimeout(run, 220) : undefined;

  return () => {
    didRun = true;

    if (idleId !== undefined) {
      window.cancelIdleCallback(idleId);
    }

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  };
}

function globeCoordsToVector3(coords: { x: number; y: number; z: number }) {
  return new Vector3(coords.x, coords.y, coords.z);
}

function getGlobePoint(globe: any, lat: number, lng: number, altitude = 0) {
  return globeCoordsToVector3(globe.getCoords(lat, lng, altitude));
}

function createArcCurve(
  globe: any,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  altitude: number,
) {
  const radius = globe.getGlobeRadius();

  const start = getGlobePoint(globe, startLat, startLng, 0.014);
  const end = getGlobePoint(globe, endLat, endLng, 0.014);

  const safeAltitude = Math.max(altitude, 0.2);

  const p1 = start
    .clone()
    .lerp(end, 0.22)
    .normalize()
    .multiplyScalar(radius * (1 + safeAltitude * 0.85));

  const p2 = start
    .clone()
    .lerp(end, 0.5)
    .normalize()
    .multiplyScalar(radius * (1 + safeAltitude * 1.28));

  const p3 = start
    .clone()
    .lerp(end, 0.78)
    .normalize()
    .multiplyScalar(radius * (1 + safeAltitude * 0.65));

  return new CatmullRomCurve3([start, p1, p2, p3, end]);
}

type ActiveArc = {
  connection: GlobeConnection;
  id: number;
  drawDuration: number;
  travelDuration: number;
  eraseDuration: number;
  startedAt: number;
  pause: number;
};

const INBOUND_CONNECTION_PROBABILITY = 0.24;

type ConnectionDirection = "mixed" | "outbound" | "inbound";

function smoothProgress(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutCubic(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - clamped, 3);
}

function connectionWeight(connection: GlobeConnection) {
  return connection.probabilityWeight;
}

function randomConnection(excludedLabels = new Set<string>()) {
  if (globeConnections.length <= 1) return globeConnections[0];

  const candidates = globeConnections.filter(
    (connection) => !excludedLabels.has(connection.label),
  );
  const pool = candidates.length > 0 ? candidates : globeConnections;
  const totalWeight = pool.reduce(
    (sum, connection) => sum + connectionWeight(connection),
    0,
  );
  let threshold = Math.random() * totalWeight;

  for (const connection of pool) {
    threshold -= connectionWeight(connection);

    if (threshold <= 0) {
      return connection;
    }
  }

  return pool[pool.length - 1];
}

function reverseConnection(connection: GlobeConnection): GlobeConnection {
  return {
    ...connection,
    startLat: connection.endLat,
    startLng: connection.endLng,
    endLat: connection.startLat,
    endLng: connection.startLng,
  };
}

function orientConnection(
  connection: GlobeConnection,
  direction: ConnectionDirection,
): GlobeConnection {
  if (direction === "outbound") {
    return connection;
  }

  if (direction === "inbound") {
    return reverseConnection(connection);
  }

  return Math.random() < INBOUND_CONNECTION_PROBABILITY
    ? reverseConnection(connection)
    : connection;
}

function createActiveArc(
  quality: GlobeQuality,
  excludedLabels = new Set<string>(),
  direction: ConnectionDirection = "mixed",
): ActiveArc {
  const drawBase = quality === "low" ? 0.95 : quality === "medium" ? 1.15 : 1.35;
  const travelBase = quality === "low" ? 1.6 : quality === "medium" ? 1.8 : 2.0;
  const eraseBase = quality === "low" ? 1.0 : quality === "medium" ? 1.18 : 1.34;
  const connection = orientConnection(randomConnection(excludedLabels), direction);

  return {
    connection,
    id: Date.now() + Math.random(),
    drawDuration: drawBase + Math.random() * 0.35,
    travelDuration: travelBase + Math.random() * 0.7,
    eraseDuration: eraseBase + Math.random() * 0.34,
    startedAt: performance.now(),
    pause: 0.28 + Math.random() * 0.5,
  };
}

function setMaterialOpacity(mesh: Mesh, opacity: number) {
  const material = mesh.material;

  if (Array.isArray(material)) {
    material.forEach((item) => {
      item.opacity = opacity;
    });
    return;
  }

  (material as MeshBasicMaterial).opacity = opacity;
}

function setLineMaterialWindow(
  material: ShaderMaterial | null,
  tail: number,
  head: number,
  opacity: number,
) {
  if (!material) return;

  material.uniforms.tail.value = tail;
  material.uniforms.head.value = head;
  material.uniforms.opacity.value = opacity;
}

function lineGeometryDetail(quality: GlobeQuality) {
  if (quality === "low") {
    return {
      tubeSegments: 64,
      glowRadialSegments: 4,
      coreRadialSegments: 4,
      sphereSegments: 14,
      destinationSegments: 20,
    };
  }

  if (quality === "medium") {
    return {
      tubeSegments: 92,
      glowRadialSegments: 5,
      coreRadialSegments: 5,
      sphereSegments: 18,
      destinationSegments: 24,
    };
  }

  return {
    tubeSegments: 120,
    glowRadialSegments: 6,
    coreRadialSegments: 5,
    sphereSegments: 22,
    destinationSegments: 28,
  };
}

const lineVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragmentShader = `
  uniform vec3 lineColor;
  uniform float opacity;
  uniform float tail;
  uniform float head;
  uniform float edgeSoftness;

  varying vec2 vUv;

  void main() {
    float leadingEdge = smoothstep(tail, tail + edgeSoftness, vUv.x);
    float trailingEdge = 1.0 - smoothstep(head - edgeSoftness, head, vUv.x);
    float lineAlpha = min(leadingEdge, trailingEdge) * opacity;

    if (lineAlpha <= 0.002) discard;

    gl_FragColor = vec4(lineColor, lineAlpha);
  }
`;

function ShootingArc({
  globe,
  connection,
  quality,
  drawDuration,
  travelDuration,
  eraseDuration,
  startedAt,
}: {
  globe: any;
  connection: GlobeConnection;
  quality: GlobeQuality;
  drawDuration: number;
  travelDuration: number;
  eraseDuration: number;
  startedAt: number;
}) {
  const glowLineRef = useRef<Mesh>(null);
  const coreLineRef = useRef<Mesh>(null);
  const glowMaterialRef = useRef<ShaderMaterial>(null);
  const coreMaterialRef = useRef<ShaderMaterial>(null);
  const dataSignalRef = useRef<Mesh>(null);
  const destinationWaveRefs = useRef<Mesh[]>([]);

  const detail = lineGeometryDetail(quality);
  const glowRadius = quality === "low" ? 0.34 : quality === "medium" ? 0.42 : 0.5;
  const coreRadius = quality === "low" ? 0.072 : quality === "medium" ? 0.088 : 0.105;

  const curve = useMemo(
    () =>
      createArcCurve(
        globe,
        connection.startLat,
        connection.startLng,
        connection.endLat,
        connection.endLng,
        connection.altitude,
      ),
    [globe, connection],
  );

  const destinationPosition = useMemo(
    () => getGlobePoint(globe, connection.endLat, connection.endLng, 0.014),
    [globe, connection],
  );
  const destinationQuaternion = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 0, 1),
        destinationPosition.clone().normalize(),
      ),
    [destinationPosition],
  );

  const coreColor = connection.intensity >= 1.2 ? "#ffffff" : "#bfffff";
  const glowColor = connection.intensity >= 1.2 ? "#62f8ff" : "#1edcff";
  const totalDuration = drawDuration + travelDuration + eraseDuration;

  const glowUniforms = useMemo(
    () => ({
      lineColor: { value: new Color(glowColor) },
      opacity: { value: 0 },
      tail: { value: 0 },
      head: { value: 0 },
      edgeSoftness: { value: 0.035 },
    }),
    [glowColor],
  );

  const coreUniforms = useMemo(
    () => ({
      lineColor: { value: new Color(coreColor) },
      opacity: { value: 0 },
      tail: { value: 0 },
      head: { value: 0 },
      edgeSoftness: { value: 0.025 },
    }),
    [coreColor],
  );

  useFrame(({ clock }) => {
    const elapsed = (performance.now() - startedAt) / 1000;
    const isActive = elapsed > 0 && elapsed < totalDuration;

    if (!isActive) {
      if (glowLineRef.current) glowLineRef.current.visible = false;
      if (coreLineRef.current) coreLineRef.current.visible = false;
      if (dataSignalRef.current) dataSignalRef.current.visible = false;
      destinationWaveRefs.current.forEach((wave) => {
        wave.visible = false;
      });
      return;
    }

    const drawProgress = smoothProgress(elapsed / drawDuration);
    const travelProgress = smoothProgress(elapsed / travelDuration);
    const eraseElapsed = elapsed - drawDuration - travelDuration;
    const eraseProgress = smoothProgress(eraseElapsed / eraseDuration);
    const head = elapsed < drawDuration ? drawProgress : 1;
    const tail = eraseElapsed > 0 ? eraseProgress : 0;
    const linePulse = 0.88 + Math.sin(clock.getElapsedTime() * 4.4) * 0.08;

    if (glowLineRef.current) {
      glowLineRef.current.visible = head > tail;
      setLineMaterialWindow(
        glowMaterialRef.current,
        tail,
        head,
        (0.18 + connection.intensity * 0.12) * linePulse,
      );
    }

    if (coreLineRef.current) {
      coreLineRef.current.visible = head > tail;
      setLineMaterialWindow(
        coreMaterialRef.current,
        tail,
        head,
        (0.74 + connection.intensity * 0.12) * linePulse,
      );
    }

    if (dataSignalRef.current) {
      const signalVisible = eraseElapsed <= 0;

      dataSignalRef.current.visible = signalVisible;

      if (signalVisible) {
        const signalPosition = curve.getPointAt(travelProgress);
        const signalTangent = curve.getTangentAt(travelProgress).normalize();
        const signalPulse = 0.9 + Math.sin(clock.getElapsedTime() * 8.2) * 0.1;

        dataSignalRef.current.position.copy(signalPosition);
        dataSignalRef.current.quaternion.setFromUnitVectors(
          new Vector3(0, 1, 0),
          signalTangent,
        );
        dataSignalRef.current.scale.set(
          signalPulse,
          0.92 + connection.intensity * 0.16,
          signalPulse,
        );
      }
    }

    const destinationOpacity =
      elapsed < drawDuration
        ? Math.max(0.15, drawProgress)
        : eraseElapsed > 0
          ? Math.max(0, 1 - eraseProgress * 0.8)
          : 1;

    destinationWaveRefs.current.forEach((wave, index) => {
      const phase = (clock.getElapsedTime() * 0.84 + index * 0.34) % 1;
      const waveScale = 0.72 + phase * 2.45;
      const waveOpacity = Math.pow(1 - phase, 1.18) * destinationOpacity;

      wave.visible = destinationOpacity > 0.01;
      wave.scale.setScalar(waveScale);
      setMaterialOpacity(wave, 0.72 * waveOpacity);
    });
  });

  return (
    <group>
      <mesh ref={glowLineRef} renderOrder={8} visible={false}>
        <tubeGeometry
          args={[
            curve,
            detail.tubeSegments,
            glowRadius,
            detail.glowRadialSegments,
            false,
          ]}
        />
        <shaderMaterial
          ref={glowMaterialRef}
          transparent
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
          toneMapped={false}
          uniforms={glowUniforms}
          vertexShader={lineVertexShader}
          fragmentShader={lineFragmentShader}
        />
      </mesh>

      <mesh ref={coreLineRef} renderOrder={9} visible={false}>
        <tubeGeometry
          args={[
            curve,
            detail.tubeSegments,
            coreRadius,
            detail.coreRadialSegments,
            false,
          ]}
        />
        <shaderMaterial
          ref={coreMaterialRef}
          transparent
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
          toneMapped={false}
          uniforms={coreUniforms}
          vertexShader={lineVertexShader}
          fragmentShader={lineFragmentShader}
        />
      </mesh>

      <mesh ref={dataSignalRef} renderOrder={11} visible={false}>
        <cylinderGeometry
          args={[
            quality === "low" ? 0.24 : 0.3,
            quality === "low" ? 0.24 : 0.3,
            quality === "low" ? 2.25 : 2.85,
            detail.sphereSegments,
            1,
            true,
          ]}
        />
        <meshBasicMaterial
          color="#dfffff"
          transparent
          opacity={0.98}
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <group position={destinationPosition} quaternion={destinationQuaternion}>
        {[0, 1, 2].map((waveIndex) => (
          <mesh
            key={waveIndex}
            ref={(mesh) => {
              if (mesh) destinationWaveRefs.current[waveIndex] = mesh;
            }}
            renderOrder={13}
            visible={false}
            position={[0, 0, 0.012 + waveIndex * 0.004]}
          >
            <ringGeometry args={[1.0, 1.18, detail.destinationSegments * 2]} />
            <meshBasicMaterial
              color="#bfffff"
              transparent
              opacity={0}
              depthWrite={false}
              depthTest
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function ConnectionGlowLayer({
  globe,
  quality,
}: {
  globe: any;
  quality: GlobeQuality;
}) {
  const maxConnections = quality === "low" ? 7 : quality === "medium" ? 9 : 10;
  const initialConnections = Math.min(5, maxConnections);
  const [activeArcs, setActiveArcs] = useState<ActiveArc[]>(() => {
    const labels = new Set<string>();

    return Array.from({ length: initialConnections }).map((_, index) => {
      const direction = index === 0 ? "inbound" : "mixed";
      const arc = createActiveArc(quality, labels, direction);
      labels.add(arc.connection.label);
      return arc;
    });
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveArcs((previous) => {
        const now = performance.now();
        const active = previous.filter((arc) => {
          const totalDuration =
            arc.drawDuration + arc.travelDuration + arc.eraseDuration + arc.pause;

          return now - arc.startedAt < totalDuration * 1000;
        });

        if (active.length >= maxConnections) {
          return active;
        }

        const labels = new Set(active.map((arc) => arc.connection.label));
        const nextArc = createActiveArc(quality, labels);

        return [...active, nextArc];
      });
    }, 500);

    return () => window.clearInterval(interval);
  }, [maxConnections, quality]);

  return (
    <group>
      {activeArcs.map((activeArc) => (
        <ShootingArc
          key={activeArc.id}
          globe={globe}
          connection={activeArc.connection}
          quality={quality}
          drawDuration={activeArc.drawDuration}
          travelDuration={activeArc.travelDuration}
          eraseDuration={activeArc.eraseDuration}
          startedAt={activeArc.startedAt}
        />
      ))}
    </group>
  );
}

function IstanbulBeacon({ globe }: { globe: any }) {
  const beaconRef = useRef<Mesh>(null);

  const position = useMemo(
    () => getGlobePoint(globe, ISTANBUL.lat, ISTANBUL.lng, 0.035),
    [globe],
  );

  useFrame(({ clock }) => {
    if (!beaconRef.current) return;

    const t = clock.getElapsedTime();
    const scale = 1 + Math.sin(t * 4.2) * 0.18;

    beaconRef.current.scale.setScalar(scale);
  });

  return (
    <group position={position}>
      <pointLight color="#76f8ff" intensity={5.2} distance={48} decay={2} />

      <mesh ref={beaconRef} renderOrder={20}>
        <sphereGeometry args={[1.65, 28, 28]} />
        <meshBasicMaterial
          color="#b8ffff"
          transparent
          opacity={0.98}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <mesh renderOrder={19}>
        <sphereGeometry args={[4.8, 36, 36]} />
        <meshBasicMaterial
          color="#39efff"
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

const dotVertexShader = `
  attribute float dotLat;
  attribute float dotLng;
  attribute float dotIstanbulDistance;
  attribute float dotSize;
  attribute float dotPhase;

  uniform float time;
  uniform float globeRadius;
  uniform float baseAltitude;
  uniform float hoverLift;
  uniform float shimmer;
  uniform float hoverScale;
  uniform float pointScale;
  uniform float pixelRatio;

  varying float vWave;
  varying float vPulse;
  varying float vPhase;

  void main() {
    float broadWave =
      ((sin(time * 0.78 + dotLat * 0.062 + dotLng * 0.031) + 1.0) * 0.5) * 0.68 +
      ((sin(time * 0.54 + dotLat * 0.041 - dotLng * 0.048) + 1.0) * 0.5) * 0.32;
    float detailWave =
      (sin(time * 0.34 + dotLat * 0.018 + dotLng * 0.021) + 1.0) * 0.5;
    float wave = broadWave * 0.88 + detailWave * 0.12;
    float waveLift = (wave - 0.34) * shimmer * 0.925;
    float pulseAge = mod(time, 5.0);
    float pulseProgress = pulseAge / 5.0;
    float pulseRadius = pulseProgress * 24.0;
    float pulseRing = 1.0 - smoothstep(0.0, 2.3, abs(dotIstanbulDistance - pulseRadius));
    float pulseDistanceFade = 1.0 - smoothstep(5.0, 24.0, dotIstanbulDistance);
    float pulseEnvelope = 1.0 - smoothstep(0.58, 1.0, pulseProgress);
    float originBeatEnvelope =
      smoothstep(0.0, 0.18, pulseAge) *
      (1.0 - smoothstep(0.42, 0.95, pulseAge));
    float originBeat =
      (1.0 - smoothstep(0.0, 3.2, dotIstanbulDistance)) *
      originBeatEnvelope;
    float pulse = max(pulseRing * pulseDistanceFade * pulseEnvelope, originBeat * 0.72);
    float lift = max(0.002, baseAltitude + hoverLift + waveLift + pulse * 0.026) * globeRadius;
    float scalePulse = hoverScale * (0.96 + wave * 0.07 + pulse * 0.42);

    vec3 normalDirection = normalize(position);
    vec3 localPosition = position + normalDirection * lift;
    vec4 viewPosition = modelViewMatrix * vec4(localPosition, 1.0);
    float sizeJitter = 0.94 + dotPhase * 0.16;
    float attenuatedSize = dotSize * pointScale * scalePulse * sizeJitter / max(1.0, -viewPosition.z);

    vWave = wave;
    vPulse = pulse;
    vPhase = dotPhase;

    gl_PointSize = clamp(attenuatedSize * pixelRatio, 1.0, 16.0);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const dotFragmentShader = `
  uniform vec3 dotColor;
  uniform float opacity;

  varying float vWave;
  varying float vPulse;
  varying float vPhase;

  void main() {
    vec2 spriteUv = gl_PointCoord * 2.0 - 1.0;
    float distanceFromCenter = length(spriteUv);

    if (distanceFromCenter > 0.92) discard;

    float body = 1.0 - smoothstep(0.68, 0.9, distanceFromCenter);
    float core = 1.0 - smoothstep(0.18, 0.56, distanceFromCenter);
    float shape = body * 0.88 + core * 0.22;
    float variation = 0.9 + vPhase * 0.18;
    float pulseGlow = vPulse * (1.0 - smoothstep(0.16, 0.74, distanceFromCenter));
    float alpha = opacity * variation * (0.74 + vWave * 0.16 + vPulse * 0.4) * shape;
    vec3 color = mix(dotColor, vec3(1.0), core * 0.16 + pulseGlow * 0.12);

    gl_FragColor = vec4(color, alpha);
  }
`;

function angularDistanceDegrees(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
) {
  const toRadians = Math.PI / 180;
  const startPhi = startLat * toRadians;
  const endPhi = endLat * toRadians;
  const deltaPhi = (endLat - startLat) * toRadians;
  const deltaLambda = (endLng - startLng) * toRadians;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(startPhi) *
      Math.cos(endPhi) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / toRadians;
}

function SurfaceDotField({
  globe,
  dots,
  color,
  baseOpacity,
  baseAltitude,
  hoverLift,
  hovered,
  shimmer,
}: {
  globe: any;
  dots: SurfaceDot[];
  color: string;
  baseOpacity: number;
  baseAltitude: number;
  hoverLift: number;
  hovered: boolean;
  shimmer: number;
}) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const liftRef = useRef(0);
  const { gl } = useThree();
  const geometry = useMemo(() => {
    const dotGeometry = new BufferGeometry();
    const positions = new Float32Array(dots.length * 3);
    const latitudes = new Float32Array(dots.length);
    const longitudes = new Float32Array(dots.length);
    const istanbulDistances = new Float32Array(dots.length);
    const sizes = new Float32Array(dots.length);
    const phases = new Float32Array(dots.length);

    dots.forEach(([lat, lng, size, phase], index) => {
      const position = globe.getCoords(lat, lng, 0);
      const positionOffset = index * 3;

      positions[positionOffset] = position.x;
      positions[positionOffset + 1] = position.y;
      positions[positionOffset + 2] = position.z;
      latitudes[index] = lat;
      longitudes[index] = lng;
      istanbulDistances[index] = angularDistanceDegrees(
        ISTANBUL.lat,
        ISTANBUL.lng,
        lat,
        lng,
      );
      sizes[index] = size;
      phases[index] = phase;
    });

    dotGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    dotGeometry.setAttribute("dotLat", new Float32BufferAttribute(latitudes, 1));
    dotGeometry.setAttribute("dotLng", new Float32BufferAttribute(longitudes, 1));
    dotGeometry.setAttribute(
      "dotIstanbulDistance",
      new Float32BufferAttribute(istanbulDistances, 1),
    );
    dotGeometry.setAttribute("dotSize", new Float32BufferAttribute(sizes, 1));
    dotGeometry.setAttribute("dotPhase", new Float32BufferAttribute(phases, 1));
    dotGeometry.computeBoundingSphere();

    return dotGeometry;
  }, [dots, globe]);
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      globeRadius: { value: GLOBE_RADIUS },
      baseAltitude: { value: baseAltitude },
      hoverLift: { value: 0 },
      shimmer: { value: shimmer },
      hoverScale: { value: 1 },
      pointScale: { value: DOT_POINT_SCALE },
      pixelRatio: { value: gl.getPixelRatio() },
      dotColor: { value: new Color(color) },
      opacity: { value: baseOpacity },
    }),
    [baseAltitude, baseOpacity, color, gl, shimmer],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }, delta) => {
    if (!materialRef.current) return;

    const targetLift = hovered ? hoverLift : 0;
    const easing = 1 - Math.pow(0.001, delta);
    liftRef.current += (targetLift - liftRef.current) * easing;

    const materialUniforms = materialRef.current.uniforms;
    materialUniforms.time.value = clock.getElapsedTime();
    materialUniforms.hoverLift.value = liftRef.current;
    materialUniforms.hoverScale.value = hovered ? 1.12 : 1;
    materialUniforms.pixelRatio.value = gl.getPixelRatio();
    materialUniforms.opacity.value = baseOpacity * (hovered ? 1.24 : 1);
  });

  if (dots.length === 0) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      renderOrder={6}
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={dotVertexShader}
        fragmentShader={dotFragmentShader}
        transparent
        depthWrite={false}
        depthTest
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function AtmosphereGlow() {
  const uniforms = useMemo(
    () => ({
      glowColor: { value: new Color("#4058ff") },
      power: { value: 4.6 },
      intensity: { value: 0.38 },
    }),
    [],
  );

  return (
    <mesh scale={1.14} renderOrder={1}>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        side={BackSide}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vNormal;

          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 glowColor;
          uniform float power;
          uniform float intensity;
          varying vec3 vNormal;

          void main() {
            float rim = pow(0.82 - dot(vNormal, vec3(0.0, 0.0, 1.0)), power);
            gl_FragColor = vec4(glowColor, rim * intensity);
          }
        `}
      />
    </mesh>
  );
}

function SurfaceAtmosphere() {
  const uniforms = useMemo(
    () => ({
      glowColor: { value: new Color("#3a6aff") },
      rimPower: { value: 2.2 },
      rimIntensity: { value: 0.55 },
      ambientIntensity: { value: 0.055 },
    }),
    [],
  );

  return (
    <mesh scale={1.005} renderOrder={2}>
      <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vNormal;

          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 glowColor;
          uniform float rimPower;
          uniform float rimIntensity;
          uniform float ambientIntensity;
          varying vec3 vNormal;

          void main() {
            float cosAngle = dot(vNormal, vec3(0.0, 0.0, 1.0));
            if (cosAngle < 0.0) discard;
            float rim = pow(1.0 - cosAngle, rimPower);
            float alpha = rim * rimIntensity + ambientIntensity;
            gl_FragColor = vec4(glowColor, alpha);
          }
        `}
      />
    </mesh>
  );
}

export function Globe({
  quality = "medium",
  placement = "background",
}: {
  quality?: GlobeQuality;
  placement?: GlobePlacement;
}) {
  const groupRef = useRef<Group>(null);
  const entranceStartRef = useRef<number | null>(null);
  const [bordersReady, setBordersReady] = useState(false);
  const [globeHovered, setGlobeHovered] = useState(false);
  const [surfaceDots, setSurfaceDots] = useState<SurfaceDots>({
    dots: [],
    turkeyDots: [],
  });
  const { size } = useThree();
  const isInteractivePlacement = placement === "interactive";
  const targetPosition = isInteractivePlacement
    ? INTERACTIVE_GLOBE_POSITION
    : GLOBE_POSITION;
  const entryPosition = isInteractivePlacement
    ? INTERACTIVE_GLOBE_ENTRY_POSITION
    : GLOBE_ENTRY_POSITION;
  const globeScale = isInteractivePlacement
    ? INTERACTIVE_GLOBE_SCALE
    : GLOBE_SCALE;

  const globe = useMemo(() => {
    const g: any = new ThreeGlobe({
      waitForGlobeReady: true,
      animateIn: false,
    })
      .globeImageUrl(TEXTURE_URL)
      .bumpImageUrl(BUMP_TEXTURE_URL)
      .showAtmosphere(false)

      /**
       * We do NOT use built-in arcs for the main visual anymore.
       * Custom tubes below look much more premium and glow properly.
       */
      .arcsData([])

      .pointsData(globeAnchorPoints)
      .pointLat((d: any) => d.lat)
      .pointLng((d: any) => d.lng)
      .pointColor((d: any) => d.color)
      .pointAltitude(() => 0.008)
      .pointRadius((d: any) => (d.label === "Istanbul" ? 0.2 : d.size * 0.75))

      .ringsData([
        {
          lat: ISTANBUL.lat,
          lng: ISTANBUL.lng,
          maxR: 5.2,
          propagationSpeed: 1,
          repeatPeriod: 1300,
        },
      ])
      .ringLat((d: any) => d.lat)
      .ringLng((d: any) => d.lng)
      .ringColor(() => (t: number) => `rgba(115, 246, 255, ${1 - t})`)
      .ringMaxRadius((d: any) => d.maxR)
      .ringPropagationSpeed((d: any) => d.propagationSpeed)
      .ringRepeatPeriod((d: any) => d.repeatPeriod);

    return g;
  }, []);

  useEffect(() => {
    globe.rendererSize(new Vector2(size.width, size.height));
  }, [globe, size.width, size.height]);

  useEffect(() => {
    const material = globe.globeMaterial() as MeshPhongMaterial;

    material.color = new Color("#7ccfff");
    material.emissive = new Color("#123a55");
    material.emissiveIntensity = 0.58;
    material.specular = new Color("#06111f");
    material.shininess = 3;
    material.bumpScale = 0.11;
    material.needsUpdate = true;
  }, [globe]);

  useEffect(() => {
    let isCurrent = true;
    let cancelIdleWork: (() => void) | undefined;

    loadCountriesGeoJson()
      .then((geojson) => {
        if (!isCurrent) return;
        if (!geojson?.features) {
          startTransition(() => {
            setBordersReady(true);
          });
          return;
        }

        const features = geojson.features as CountryFeature[];

        cancelIdleWork = scheduleIdleWork(() => {
          if (!isCurrent) return;

          const boundaryPaths = getBoundaryPaths(features);

          globe
            /**
             * Keep very faint polygon fill.
             * Disable polygon stroke because it is thin/jagged.
             */
            .polygonsData(features)
            .polygonAltitude(0.0015)
            .polygonCapColor(() => "rgba(20, 240, 255, 0.004)")
            .polygonSideColor(() => "rgba(0,0,0,0)")
            .polygonStrokeColor(() => "rgba(0,0,0,0)")
            .polygonCapCurvatureResolution(1.25)
            .polygonsTransitionDuration(0)

            /**
             * Use paths for actual country borders.
             * pathStroke gives real thickness.
             */
            .pathsData(boundaryPaths)
            .pathPoints((d: BoundaryPath) => d.points)
            .pathPointLat((p: BoundaryPathPoint) => p.lat)
            .pathPointLng((p: BoundaryPathPoint) => p.lng)
            .pathPointAlt(() => 0.007)
            .pathColor(() => "rgba(107, 186, 199, 0.36)")
            .pathStroke(() => 0.22)
            .pathResolution(0.22);

          startTransition(() => {
            setBordersReady(true);
          });
        });
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.warn("Country borders could not be loaded:", error);
        startTransition(() => {
          setBordersReady(true);
        });
      });

    return () => {
      isCurrent = false;
      cancelIdleWork?.();
    };
  }, [globe]);

  useEffect(() => {
    let isCurrent = true;

    loadSurfaceDots(quality)
      .then((dots) => {
        if (!isCurrent) return;

        startTransition(() => {
          setSurfaceDots(dots);
        });
      })
      .catch((error) => {
        if (!isCurrent) return;
        console.warn("Globe surface dots could not be loaded:", error);
      });

    return () => {
      isCurrent = false;
    };
  }, [quality]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    const t = clock.getElapsedTime();

    /**
     * Turkey is currently too far from the user’s eye.
     * This pulls the Europe/Turkey region closer to the visual center.
     */
    const baseY = isInteractivePlacement ? -0.74 : -0.9;
    const baseX = isInteractivePlacement ? 0.34 : 0.5;

    const targetY =
      baseY + Math.sin(t * 0.28) * 0.042 + Math.sin(t * 0.11) * 0.018;
    const targetX =
      baseX + Math.sin(t * 0.46) * 0.026 + Math.sin(t * 0.19) * 0.012;
    const targetZ = Math.sin(t * 0.31) * 0.016;

    if (!bordersReady) {
      groupRef.current.position.set(...entryPosition);
      groupRef.current.rotation.set(baseX + 0.46, baseY - 1.35, 0.18);
      return;
    }

    if (entranceStartRef.current === null) {
      entranceStartRef.current = t;
    }

    const entranceProgress = easeOutCubic((t - entranceStartRef.current) / 2.2);

    groupRef.current.position.set(
      entryPosition[0] +
        (targetPosition[0] - entryPosition[0]) * entranceProgress,
      entryPosition[1] +
        (targetPosition[1] - entryPosition[1]) * entranceProgress,
      entryPosition[2] +
        (targetPosition[2] - entryPosition[2]) * entranceProgress,
    );

    groupRef.current.rotation.y = targetY - (1 - entranceProgress) * 1.35;
    groupRef.current.rotation.x = targetX + (1 - entranceProgress) * 0.46;
    groupRef.current.rotation.z = targetZ + (1 - entranceProgress) * 0.18;
  });

  return (
    <group ref={groupRef} position={entryPosition} scale={globeScale}>
      <primitive object={globe} />

      {bordersReady && (
        <>
          <SurfaceDotField
            globe={globe}
            dots={surfaceDots.dots}
            color="#33baff"
            baseOpacity={0.44}
            baseAltitude={0.010}
            hoverLift={0.026}
            hovered={globeHovered}
            shimmer={0.022}
          />
          <SurfaceDotField
            globe={globe}
            dots={surfaceDots.turkeyDots}
            color="#bfffff"
            baseOpacity={0.9}
            baseAltitude={0.014}
            hoverLift={0.04}
            hovered={globeHovered}
            shimmer={0.026}
          />
          <ConnectionGlowLayer globe={globe} quality={quality} />
          <IstanbulBeacon globe={globe} />
          <AtmosphereGlow />
          <SurfaceAtmosphere />
        </>
      )}

      <mesh
        scale={1.03}
        onPointerOver={(event) => {
          event.stopPropagation();
          setGlobeHovered(true);
        }}
        onPointerOut={() => setGlobeHovered(false)}
      >
        <sphereGeometry args={[GLOBE_RADIUS, 48, 48]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      <mesh scale={1.28} renderOrder={0}>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 96]} />
        <meshBasicMaterial
          color="#233dff"
          transparent
          opacity={0.026}
          side={BackSide}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
