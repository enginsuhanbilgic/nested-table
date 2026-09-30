import {
  startTransition,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box } from "@mui/material";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Color,
  ShaderMaterial,
  SRGBColorSpace,
} from "three";
import { Globe, type GlobeQuality } from "./Globe";

const CAMERA_POSITION: [number, number, number] = [0, 0, 300];
const CAMERA_FOV = 35;
const GLOBE_QUALITY_COOKIE = "globeBackgroundQuality";
const GLOBE_QUALITY_COOKIE_MAX_AGE = 60 * 60 * 24;
const QUALITY_SETTLE_MS = 5000;

const softStars = [
  { left: "40%", top: "11%", size: 9, blur: 4, opacity: 0.36, delay: "0s" },
  { left: "56%", top: "8%", size: 5, blur: 2, opacity: 0.34, delay: "1.2s" },
  { left: "81%", top: "10%", size: 8, blur: 3, opacity: 0.4, delay: "2.1s" },
  { left: "91%", top: "23%", size: 4, blur: 2, opacity: 0.34, delay: "0.7s" },
  { left: "38%", top: "31%", size: 4, blur: 2, opacity: 0.28, delay: "2.8s" },
  { left: "52%", top: "35%", size: 7, blur: 3, opacity: 0.3, delay: "1.8s" },
  { left: "74%", top: "33%", size: 5, blur: 2, opacity: 0.28, delay: "0.4s" },
  { left: "95%", top: "41%", size: 10, blur: 5, opacity: 0.34, delay: "3.1s" },
  { left: "44%", top: "52%", size: 6, blur: 3, opacity: 0.26, delay: "1.5s" },
  { left: "67%", top: "56%", size: 4, blur: 2, opacity: 0.3, delay: "2.4s" },
  { left: "86%", top: "66%", size: 8, blur: 4, opacity: 0.32, delay: "0.9s" },
  { left: "58%", top: "83%", size: 5, blur: 2, opacity: 0.24, delay: "3.4s" },
  { left: "78%", top: "84%", size: 7, blur: 3, opacity: 0.28, delay: "1.1s" },
  { left: "94%", top: "82%", size: 4, blur: 2, opacity: 0.24, delay: "2.7s" },
];

function isGlobeQuality(value: string | undefined): value is GlobeQuality {
  return value === "low" || value === "medium" || value === "high";
}

function readStoredGlobeQuality() {
  if (typeof document === "undefined") return null;

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${GLOBE_QUALITY_COOKIE}=`));
  const value = cookie?.split("=")[1];

  if (!value) return null;

  const decodedValue = decodeURIComponent(value);
  return isGlobeQuality(decodedValue) ? decodedValue : null;
}

function storeGlobeQuality(quality: GlobeQuality) {
  if (typeof document === "undefined") return;

  document.cookie = [
    `${GLOBE_QUALITY_COOKIE}=${encodeURIComponent(quality)}`,
    `Max-Age=${GLOBE_QUALITY_COOKIE_MAX_AGE}`,
    "Path=/",
    "SameSite=Lax",
  ].join("; ");
}

function dprForQuality(quality: GlobeQuality) {
  if (quality === "low") return 1;
  if (quality === "medium") return 1.2;
  return 1.35;
}

function lowerQuality(quality: GlobeQuality): GlobeQuality {
  if (quality === "high") return "medium";
  if (quality === "medium") return "low";
  return "low";
}

function higherQuality(quality: GlobeQuality): GlobeQuality {
  if (quality === "low") return "medium";
  if (quality === "medium") return "high";
  return "high";
}

function StellarHaze({ quality }: { quality: GlobeQuality }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const frameRef = useRef(0);
  const uniforms = useMemo(
    () => ({
      time: { value: 0 },
      colorA: { value: new Color("#54eaff") },
      colorB: { value: new Color("#486bff") },
      opacity: { value: quality === "low" ? 0.16 : 0.24 },
    }),
    [quality],
  );

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    frameRef.current++;
    if (frameRef.current % 2 !== 0) return;

    materialRef.current.uniforms.time.value = clock.getElapsedTime();
    materialRef.current.uniforms.opacity.value = quality === "low" ? 0.14 : 0.23;
  });

  return (
    <mesh position={[36, 0, -210]} scale={[620, 360, 1]} renderOrder={-20}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float time;
          uniform float opacity;
          uniform vec3 colorA;
          uniform vec3 colorB;

          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);

            return mix(
              mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }

          void main() {
            vec2 uv = vUv;
            vec2 center = uv - vec2(0.66, 0.46);
            float vignette = smoothstep(0.72, 0.12, length(center));

            float cloud =
              noise(uv * 2.4 + vec2(time * 0.012, -time * 0.006)) * 0.45 +
              noise(uv * 5.2 + vec2(-time * 0.01, time * 0.014)) * 0.28 +
              noise(uv * 9.0) * 0.14;

            float strand = smoothstep(0.34, 0.92, cloud) * vignette;
            float alpha = strand * opacity;
            vec3 color = mix(colorB, colorA, smoothstep(0.18, 0.86, cloud));

            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

export function GlobeBackground() {
  const storedQualityRef = useRef<GlobeQuality | null | undefined>(undefined);

  if (storedQualityRef.current === undefined) {
    storedQualityRef.current = readStoredGlobeQuality();
  }

  const initialQuality = storedQualityRef.current ?? "high";
  const [dpr, setDpr] = useState(() => dprForQuality(initialQuality));
  const [quality, setQuality] = useState<GlobeQuality>(initialQuality);
  const [isEvaluatingQuality, setIsEvaluatingQuality] = useState(
    storedQualityRef.current === null,
  );
  const [mountGlobe, setMountGlobe] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMountGlobe(true);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    setDpr(dprForQuality(quality));

    if (!isEvaluatingQuality) return;

    const timeout = window.setTimeout(() => {
      storeGlobeQuality(quality);
      setIsEvaluatingQuality(false);
    }, QUALITY_SETTLE_MS);

    return () => window.clearTimeout(timeout);
  }, [isEvaluatingQuality, quality]);

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        background: `
          radial-gradient(circle 9vw at 51% 18%, rgba(93, 240, 255, 0.11), transparent),
          radial-gradient(circle 13vw at 72% 16%, rgba(82, 137, 255, 0.10), transparent),
          radial-gradient(circle 10vw at 88% 58%, rgba(95, 244, 255, 0.10), transparent),
          radial-gradient(circle 8vw at 62% 76%, rgba(61, 193, 255, 0.08), transparent),
          radial-gradient(circle 7vw at 33% 28%, rgba(82, 247, 255, 0.08), transparent),
          radial-gradient(circle at 68% 42%, rgba(65, 97, 255, 0.18), transparent 0 17%, transparent 42%),
          radial-gradient(circle at 79% 34%, rgba(69, 105, 255, 0.18), transparent 0 19%, transparent 44%),
          radial-gradient(circle at 45% 70%, rgba(16, 140, 255, 0.15), transparent 0 20%, transparent 45%),
          radial-gradient(circle at 18% 20%, rgba(64, 245, 255, 0.12), transparent 0 18%, transparent 36%),
          linear-gradient(135deg, #071a2e 0%, #0a1d33 42%, #0c253f 100%)
        `,
        "@keyframes softStarPulse": {
          "0%, 100%": {
            opacity: 0.46,
            transform: "translate(-50%, -50%) scale(0.88)",
          },
          "50%": {
            opacity: 1,
            transform: "translate(-50%, -50%) scale(1.2)",
          },
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: "-4%",
          backgroundImage: `
            radial-gradient(circle at 74% 38%, rgba(84, 138, 255, 0.28), transparent 0 26%, transparent 58%),
            url("/backgrounds/cepheus-star-field.jpg")
          `,
          backgroundSize: "cover, cover",
          backgroundPosition: "center, center",
          filter: "blur(3px) saturate(1.45) contrast(1.38) brightness(1.16)",
          opacity: 0.82,
          transform: "scale(1.04)",
          mixBlendMode: "screen",
        }}
      />

      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(circle at 78% 44%, rgba(74, 119, 255, 0.12), transparent 0 22%, transparent 52%),
            radial-gradient(circle at 54% 18%, rgba(110, 246, 255, 0.06), transparent 0 18%, transparent 42%),
            linear-gradient(180deg, rgba(5, 16, 31, 0.04), rgba(2, 8, 20, 0.16))
          `,
        }}
      />


      {softStars.map((star, index) => (
        <Box
          key={`soft-star-${index}`}
          sx={{
            position: "absolute",
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, rgba(255,255,255,0.96) 0%, rgba(150,248,255,0.76) 34%, rgba(88,164,255,0) 72%)",
            opacity: star.opacity,
            mixBlendMode: "screen",
            animation: "softStarPulse 5.6s ease-in-out infinite",
            animationDelay: star.delay,
          }}
        />
      ))}

      {/* Diagonal light sweep */}
      <Box
        sx={{
          position: "absolute",
          inset: "-20%",
          background:
            "linear-gradient(120deg, transparent 0%, rgba(85, 245, 255, 0.055) 42%, rgba(90, 127, 255, 0.075) 50%, transparent 62%)",
          transform: "rotate(-8deg)",
          filter: "blur(18px)",
          opacity: 0.85,
        }}
      />

      <Canvas
        dpr={dpr}
        camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
        style={{ pointerEvents: "none" }}
        gl={{
          antialias: quality !== "low",
          alpha: true,
          powerPreference: "high-performance",
          outputColorSpace: SRGBColorSpace,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
      >
        {isEvaluatingQuality && (
          <PerformanceMonitor
            iterations={8}
            ms={250}
            threshold={0.75}
            flipflops={4}
            onDecline={() => {
              startTransition(() => {
                setQuality((currentQuality) => lowerQuality(currentQuality));
              });
            }}
            onIncline={() => {
              startTransition(() => {
                setQuality((currentQuality) => higherQuality(currentQuality));
              });
            }}
            onFallback={() => {
              storeGlobeQuality("low");
              setIsEvaluatingQuality(false);
              startTransition(() => {
                setQuality("low");
              });
            }}
          />
        )}

        <fog attach="fog" args={["#0a1d33", 380, 760]} />

        <ambientLight intensity={1.1} />
        <hemisphereLight
          intensity={1.15}
          color="#d8fbff"
          groundColor="#0a2440"
        />

        <directionalLight
          position={[120, 80, 180]}
          intensity={1.65}
          color="#e9feff"
        />
        <directionalLight
          position={[-140, -20, 120]}
          intensity={0.7}
          color="#52e8ff"
        />

        <pointLight
          position={[95, 20, 120]}
          intensity={quality === "low" ? 2.4 : 3.8}
          color="#60f7ff"
          distance={460}
          decay={2}
        />

        <StellarHaze quality={quality} />

        {mountGlobe && (
          <Suspense fallback={null}>
            <Globe quality={quality} />
          </Suspense>
        )}
      </Canvas>

      {/* Left readability layer. Still readable, less dead-flat. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(circle at 24% 52%, rgba(10, 22, 39, 0.12), transparent 0 20%, transparent 48%),
            linear-gradient(
              90deg,
              rgba(5, 16, 31, 0.64) 0%,
              rgba(5, 16, 31, 0.50) 24%,
              rgba(5, 16, 31, 0.18) 43%,
              rgba(5, 16, 31, 0.02) 63%,
              rgba(5, 16, 31, 0.00) 82%
            )
          `,
        }}
      />

      {/* Stronger glow behind Earth */}
      <Box
        sx={{
          position: "absolute",
          right: "-17%",
          top: "-15%",
          pointerEvents: "none",
          width: "72vw",
          height: "72vw",
          maxWidth: 1280,
          maxHeight: 1280,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(72, 101, 255, 0.20) 0%, rgba(27, 125, 255, 0.11) 34%, rgba(8, 24, 44, 0) 68%)",
          filter: "blur(70px)",
          mixBlendMode: "screen",
        }}
      />

      {/* Bottom cinematic vignette */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(1,7,16,0.28) 100%)",
        }}
      />
    </Box>
  );
}
