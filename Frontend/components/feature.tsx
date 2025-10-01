"use client"

import type React from "react"

import { motion } from "framer-motion"
import { useState } from "react"

type Variant = "payments" | "groups" | "escrow" | undefined

function Checkmarks({ delivered = true }: { delivered?: boolean }) {
  return (
    <span className="ml-2 inline-flex items-center" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" className="text-[#34B7F1]">
        <path fill="currentColor" d="M0 13l2-2 5 5L22 1l2 2L7 20z" opacity="0.9" />
      </svg>
      {delivered && (
        <svg width="16" height="16" viewBox="0 0 24 24" className="-ml-2 text-[#34B7F1]">
          <path fill="currentColor" d="M0 13l2-2 5 5L22 1l2 2L7 20z" opacity="0.9" />
        </svg>
      )}
    </span>
  )
}

function ChatBubble({
  side,
  children,
  time,
  ticks = true,
}: {
  side: "me" | "bot"
  children: React.ReactNode
  time: string
  ticks?: boolean
}) {
  const isMe = side === "me"
  return (
    <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isMe ? "bg-white text-[#111]" : "bg-[#DCF8C6] text-[#0B141A]",
        ].join(" ")}
        style={{ borderTopLeftRadius: isMe ? 16 : 4, borderTopRightRadius: isMe ? 4 : 16 }}
      >
        <div className="leading-relaxed">{children}</div>
        <div className="mt-1 flex items-center justify-end text-[10px] text-black/40">
          <span className="tabular-nums">{time}</span>
          {isMe && <Checkmarks delivered />}
        </div>
      </div>
    </div>
  )
}

function ChatPreview({ variant, keySeed }: { variant: Variant; keySeed: number }) {
  // Messages per variant
  const base = {
    payments: [
      { side: "me" as const, text: "🚀 Zap 50 APT to @crypto_sarah NOW!", time: "3:14" },
      { side: "bot" as const, text: "⚡ BOOM! 50 APT sent → 0x9f…2d in 0.8s", time: "3:14" },
    ],
    groups: [
      { side: "me" as const, text: "🍕 Squad dinner was $240 → split 6 ways", time: "9:45" },
      { side: "bot" as const, text: "💰 Auto-split! Everyone owes $40. Collecting...", time: "9:45" },
      { side: "me" as const, text: "Send reminders to slowpokes 🐌", time: "9:46" },
      { side: "bot" as const, text: "🔥 5/6 paid! Nudging @lazy_mike...", time: "9:46" },
    ],
    escrow: [
      { side: "me" as const, text: "🔐 Lock 500 APT for NFT deal. Release on delivery", time: "11:30" },
      { side: "bot" as const, text: "🛡️ Escrow LIVE! Funds locked & protected", time: "11:30" },
      { side: "me" as const, text: "Seller flaked 😤 REFUND ME!", time: "2:15" },
      { side: "bot" as const, text: "💸 REFUNDED! 500 APT back in your pocket", time: "2:15" },
    ],
  }

  const messages = variant ? base[variant] : base.payments

  // Staggered fade/slide-in per message
  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.12, delayChildren: 0.08 },
    },
  }
  const item = {
    hidden: { opacity: 0, y: 10, rotateX: -5, filter: "blur(3px)" },
    show: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      filter: "blur(0px)",
      transition: { type: "spring", stiffness: 180, damping: 18 },
    },
  }

  return (
    <motion.div
      key={keySeed}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: false, amount: 0.5 }}
      className="rounded-2xl border border-white/10 bg-[#0E1D15] p-3"
      aria-label="Chat preview"
    >
      <div className="mb-2 text-[10px] uppercase tracking-wide text-white/40">Preview</div>
      <motion.div className="space-y-2">
        {messages.map((m, i) => (
          <motion.div key={i} variants={item}>
            <ChatBubble side={m.side} time={m.time}>
              {m.text}
            </ChatBubble>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}

export function Feature({
  title,
  text,
  variant,
}: {
  title: string
  text: string
  variant?: Variant
}) {
  const [seed, setSeed] = useState(0)

  return (
    <motion.div
      className="rounded-2xl border border-white/10 bg-[#0E1D15] p-5"
      initial={{ y: 16, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: false, amount: 0.4 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      whileHover={{ scale: 1.02, rotateX: 0.5, rotateY: -0.5 }}
    >
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-4 text-sm leading-relaxed text-white/70">{text}</p>

      <ChatPreview variant={variant} keySeed={seed} />

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/30"
          aria-label="Replay demo"
        >
          Replay demo
        </button>
        <span className="text-[10px] text-white/40">Live in WhatsApp chat</span>
      </div>
    </motion.div>
  )
}
