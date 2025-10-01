"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { ChatScene } from "@/components/chat-scene"
import { useRef } from "react"
import { Feature } from "@/components/feature"

export default function HomePage() {
  const { scrollYProgress } = useScroll()
  const bgOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0.85])
  const storyRef = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress: storyProgress } = useScroll({
    target: storyRef,
    offset: ["start start", "end end"],
  })

  return (
    <main className="min-h-screen bg-[#0B141A] text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-[#0B141A]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img 
              src="/logo.png" 
              alt="Wattspay Logo" 
              className="size-8 object-contain"
            />
            <span className="text-sm font-medium tracking-wide text-white/90">Wattspay</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a href="#story" className="hover:text-white">
              Story
            </a>
            <a href="#features" className="hover:text-white">
              Features
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#waitlist"
              className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-black hover:bg-[#1FC65C] focus:outline-none focus:ring-2 focus:ring-[#25D366]/60"
            >
              Get early access
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <motion.div
          style={{ opacity: bgOpacity }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,211,102,0.15),_transparent_60%)]"
          aria-hidden
        />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/80">
              <span className="size-1.5 rounded-full bg-[#25D366]" />
              Built on Aptos • Inside WhatsApp
            </span>
            <h1 className="text-pretty text-4xl font-semibold leading-[1.1] md:text-5xl lg:text-6xl">
              <span className="bg-gradient-to-r from-[#25D366] to-[#1FC65C] bg-clip-text text-transparent">
                Aptos Blockchain
              </span>
              <br />
              💬 Living Inside WhatsApp 
            </h1>
            <p className="text-pretty text-sm leading-relaxed text-white/70 md:text-base">
              {/* The world's first <strong className="text-[#25D366]">Aptos-powered AI agent</strong> that lives natively inside WhatsApp chat.
              <br /> */}
              <br />
              <strong className="text-[#25D366]">Bringing 2 billion WhatsApp users to Aptos.</strong>
              <br />
              � Send APT • 🍕 Split bills • 🔒 Secure escrows — all through simple text messages.
              <br />
              <span className="text-white/90">No apps to download. No wallets to manage. Just pure blockchain magic in your favorite chat.</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#story"
                className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-black hover:bg-[#1FC65C] focus:outline-none focus:ring-2 focus:ring-[#25D366]/60"
              >
                See it in action
              </a>
              <a
                href="#features"
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/30"
              >
                Explore features
              </a>
            </div>
          </div>

          {/* Phone mock container */}
          <div className="mx-auto w-full max-w-sm">
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0E1D15] shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
              <img
                src="/images/whatsapp-3d-hero.jpg"
                width={640}
                height={1280}
                alt="Isometric WhatsApp 3D chat showing Wattspay transactions and confirmations"
                className="block h-auto w-full"
              />
            </div>
            <p className="mt-3 text-center text-xs text-white/50">Live 3D scroll story below</p>
          </div>
        </div>
      </section>

      {/* 3D Scroll Story */}
      <section id="story" className="relative">
        <div ref={storyRef} className="h-[300vh]">
          <div className="sticky top-0 h-screen">
            <ChatScene progress={storyProgress} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Feature
            title="💸 Lightning Payments"
            text="Zap APT faster than you can say 'HODL'. Send, receive, confirm—all in seconds. Your wallet, your rules, zero friction."
            variant="payments"
          />
          <Feature
            title="🍕 Squad Bill Splitting"
            text="Dinner for 8? Concert tickets? Vacation rental? Auto-split any expense. No awkward 'who owes what' convos ever again."
            variant="groups"
          />
          <Feature
            title="🔒 Fort Knox Escrow"
            text="Lock funds like a boss. Deal goes wrong? Instant refund. Deal goes right? Money flies. Trust the blockchain, not promises."
            variant="escrow"
          />
        </div>
      </section>

      {/* Footer */}
      <footer id="waitlist" className="border-t border-white/10 bg-[#0E1D15]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-10 sm:flex-row sm:justify-between">
          <p className="text-sm text-white/60">© {new Date().getFullYear()} Wattspay</p>
          <form
            className="flex w-full max-w-md items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              alert("Thanks! You are on the waitlist.")
            }}
          >
            <input
              aria-label="Email address"
              placeholder="Enter your email"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#25D366]/40"
            />
            <button className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-medium text-black hover:bg-[#1FC65C] focus:outline-none focus:ring-2 focus:ring-[#25D366]/60">
              Join
            </button>
          </form>
        </div>
      </footer>
    </main>
  )
}
