"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { Html, Float, Environment } from "@react-three/drei"
import { useMemo, useRef } from "react"
import type { MotionValue } from "framer-motion"
import * as THREE from "three"

// Color palette (limit 3-5 total)
// Dark:  #0B141A
// Bubble dark: #1F2C34
// Green: #25D366
// White: #FFFFFF
// Timestamp gray: #AAB2B7

type Msg = {
  id: string
  side: "left" | "right"
  text: string
  time: string
}

const MESSAGES: Msg[] = [
  { id: "m1", side: "left", text: "💸 Zap 15 APT to @mike ASAP!", time: "2:04" },
  { id: "m2", side: "right", text: "⚡ SENT! — Lightning fast 0x7f…9a2", time: "2:04 ✓✓" },
  { id: "m3", side: "left", text: "🍕 Split dinner bill: $84 ÷ 4 squad", time: "2:07" },
  { id: "m4", side: "right", text: "💯 Auto-split! Everyone pays $21 — BOOM!", time: "2:07 ✓✓" },
  { id: "m5", side: "left", text: "🔒 Refund my $200 — deal went south", time: "2:11" },
  { id: "m6", side: "right", text: "🚀 Escrow released! $200 back in your wallet", time: "2:12 ✓✓" },
]

export function ChatScene({ progress }: { progress: MotionValue<number> }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 45 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
    >
      {/* Soft ambient and subtle environment for realism */}
      <ambientLight intensity={0.5} />
      <Environment preset="city" />
      <color attach="background" args={["#0B141A"]} />
      <ChatBubbles progress={progress} />
      <FloatingBadges progress={progress} />
    </Canvas>
  )
}

function ChatBubbles({ progress }: { progress: MotionValue<number> }) {
  const positions = useMemo(() => {
    return MESSAGES.map((_, i) => -i * 1.3)
  }, [])

  return (
    <>
      {MESSAGES.map((m, i) => (
        <Bubble key={m.id} msg={m} index={i} y={positions[i]} progress={progress} />
      ))}
    </>
  )
}

function Bubble({
  msg,
  index,
  y,
  progress,
}: {
  msg: Msg
  index: number
  y: number
  progress: MotionValue<number>
}) {
  const group = useRef<THREE.Group>(null!)
  const htmlRef = useRef<HTMLDivElement>(null!)
  const appearStart = index / (MESSAGES.length + 1)
  const appearEnd = appearStart + 0.22

  useFrame((state, delta) => {
    const p = progress.get()
    const t = smoothstep(appearStart, appearEnd, p)

    // Animate in: rise, fade, rotate slightly
    const targetY = y + (1 - t) * 0.4
    const targetRot = (1 - t) * (msg.side === "left" ? -0.25 : 0.25)
    const targetScale = 0.9 + 0.1 * t

    group.current.position.y += (targetY - group.current.position.y) * Math.min(1, delta * 6)
    group.current.rotation.z += (targetRot - group.current.rotation.z) * Math.min(1, delta * 6)
    group.current.scale.x = THREE.MathUtils.damp(group.current.scale.x, targetScale, 8, delta)
    group.current.scale.y = THREE.MathUtils.damp(group.current.scale.y, targetScale, 8, delta)
    group.current.scale.z = THREE.MathUtils.damp(group.current.scale.z, targetScale, 8, delta)

    // subtle depth drift
    const zBase = -index * 0.1
    const zTarget = zBase + t * -0.05
    group.current.position.z += (zTarget - group.current.position.z) * Math.min(1, delta * 6)

    if (htmlRef.current) {
      const opacity = 0.05 + 0.95 * t
      const blur = (1 - t) * 3.5
      htmlRef.current.style.opacity = opacity.toFixed(3)
      htmlRef.current.style.filter = `blur(${blur.toFixed(2)}px)`
      htmlRef.current.style.transform = `translateZ(0)` // ensure GPU compositing for smoother fade/blur
    }
  })

  const x = msg.side === "left" ? -1.3 : 1.3

  return (
    <group ref={group} position={[x, y + 1.5, -0.5]}>
      <Float speed={1} rotationIntensity={0.05} floatIntensity={0.2}>
        <Html transform occlude distanceFactor={4.5} wrapperClass="pointer-events-none">
          <div
            ref={htmlRef}
            className={[
              "max-w-[260px] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-lg transition-[opacity,filter] will-change-[opacity,filter]",
              msg.side === "left" ? "rounded-bl-sm bg-[#1F2C34] text-white" : "rounded-br-sm bg-[#25D366] text-black",
            ].join(" ")}
            style={{ opacity: 0, filter: "blur(4px)" }}
          >
            <p>{msg.text}</p>
            <p className={["mt-1 text-[10px]", msg.side === "left" ? "text-[#AAB2B7]" : "text-black/60"].join(" ")}>
              {msg.time}
            </p>
          </div>
        </Html>
      </Float>
    </group>
  )
}

function FloatingBadges({ progress }: { progress: MotionValue<number> }) {
  const left = useRef<THREE.Group>(null!)
  const right = useRef<THREE.Group>(null!)

  useFrame((_, delta) => {
    const p = progress.get()
    const lTarget = -0.6 + p * 0.4
    const rTarget = 0.8 - p * 0.5
    left.current.position.y += (lTarget - left.current.position.y) * Math.min(1, delta * 4)
    right.current.position.y += (rTarget - right.current.position.y) * Math.min(1, delta * 4)
  })

  return (
    <>
      <group ref={left} position={[-2.6, -0.4, -0.6]} rotation={[0, 0, -0.08]}>
        <Html transform distanceFactor={6} wrapperClass="pointer-events-none">
          <Badge text="💸 Instant Payments" />
        </Html>
      </group>
      <group ref={right} position={[2.6, 0.9, -0.6]} rotation={[0, 0, 0.08]}>
        <Html transform distanceFactor={6} wrapperClass="pointer-events-none">
          <Badge text="🍕 Group Splits" />
        </Html>
      </group>
      <group position={[0, -2.1, -0.6]}>
        <Html transform distanceFactor={6} wrapperClass="pointer-events-none">
          <Badge text="🔒 Escrow Safety" />
        </Html>
      </group>
    </>
  )
}

function Badge({ text }: { text: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/85 backdrop-blur">
      {text}
    </div>
  )
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
