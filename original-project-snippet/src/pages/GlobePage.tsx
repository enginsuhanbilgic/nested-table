import { Suspense } from 'react'
import { Box, useTheme } from '@mui/material'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import {
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from 'three'
import { PageHeader } from '../components/common/PageHeader'
import { Globe } from '../components/globe/Globe'

const CAMERA_POSITION: [number, number, number] = [0, 0, 340]

export function GlobePage() {
  const theme = useTheme()

  return (
    <Box sx={{ minWidth: 0, width: '100%' }}>
      <PageHeader
        eyebrow="Observe"
        title="Globe"
        description="Live global topology and connection activity."
      />

      <Box
        sx={{
          position: 'relative',
          height: {
            xs: 'calc(100vh - 184px)',
            md: 'calc(100vh - 188px)',
          },
          minHeight: { xs: 480, md: 620 },
          overflow: 'hidden',
          background: `
            radial-gradient(circle at 50% 48%, ${theme.palette.mode === 'dark' ? 'rgba(0, 159, 195, 0.22)' : 'rgba(0, 122, 150, 0.18)'}, transparent 0 28%, transparent 52%),
            radial-gradient(circle at 74% 24%, rgba(96, 247, 255, 0.12), transparent 0 20%, transparent 44%),
            linear-gradient(135deg, #06111f 0%, #08192b 48%, #0a2036 100%)
          `,
        }}
      >
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: CAMERA_POSITION, fov: 35, near: 1, far: 1200 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            outputColorSpace: SRGBColorSpace,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.12,
          }}
        >
          <fog attach="fog" args={['#071526', 420, 900]} />

          <ambientLight intensity={1.05} />
          <hemisphereLight
            intensity={1.18}
            color="#e2fbff"
            groundColor="#091a2e"
          />
          <directionalLight
            position={[120, 80, 180]}
            intensity={1.72}
            color="#f0feff"
          />
          <directionalLight
            position={[-120, 20, 160]}
            intensity={0.72}
            color="#54eaff"
          />
          <pointLight
            position={[105, 35, 130]}
            intensity={3.8}
            color="#60f7ff"
            distance={520}
            decay={2}
          />

          <Stars
            radius={620}
            depth={90}
            count={2200}
            factor={4}
            saturation={0}
            fade
            speed={0.35}
          />

          <Suspense fallback={null}>
            <Globe quality="high" placement="interactive" />
          </Suspense>

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={210}
            maxDistance={440}
            rotateSpeed={0.56}
            target={[0, 0, 0]}
          />
        </Canvas>

        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `
              radial-gradient(circle at 50% 48%, transparent 0 36%, rgba(1, 7, 16, 0.12) 72%, rgba(1, 7, 16, 0.42) 100%),
              linear-gradient(180deg, rgba(0,0,0,0) 70%, rgba(1,7,16,0.30) 100%)
            `,
          }}
        />
      </Box>
    </Box>
  )
}
