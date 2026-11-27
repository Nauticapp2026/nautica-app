import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { DownloadAppButton } from './download-app-button';
import { SplitWords } from './motion';

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden bg-[#0b2f35] text-white">
      {/* Foto de respaldo: se ve mientras carga el video, si falla, o con "reducir movimiento". */}
      <Image
        src="/landing/hero-bg.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="v2-hero-bg object-cover"
      />
      <video
        className="v2-hero-video absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/landing/hero-bg.png"
        aria-hidden
      >
        <source src="/landing/hero-puerto.mp4" type="video/mp4" />
      </video>
      {/* Velo más liviano que antes para que se vean las camas y amarras; el texto sigue legible. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b2f35]/65 via-[#0b2f35]/25 to-[#0b2f35]/70" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-28 pb-44 md:px-8 md:pb-52">
        <h1 className="max-w-4xl text-5xl leading-[1.02] font-normal tracking-tight text-balance md:text-7xl lg:text-[5.5rem]">
          <SplitWords text="Digitalizamos la" />
          <br />
          <SplitWords text="experiencia" />
          <span className="font-extrabold text-[#ABC2B3]">
            <SplitWords text="náutica" />
          </span>
        </h1>

        <p
          className="v2-rise mt-8 max-w-2xl text-lg leading-relaxed font-medium text-white/90 md:text-xl"
          style={{ '--v2-delay': '1.1s' } as React.CSSProperties}
        >
          La plataforma definitiva para administrar clubes náuticos y potenciar la vida en el río.
          Tecnología para el club. Confort para quienes navegan.
        </p>

        <div
          className="v2-rise mt-10 flex flex-col gap-3 sm:flex-row"
          style={{ '--v2-delay': '1.35s' } as React.CSSProperties}
        >
          <Link href="/onboarding" className="v2-btn bg-[#ABC2B3] text-[#0b2f35] hover:bg-white">
            Registrá tu club
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <DownloadAppButton className="v2-btn border border-white/40 text-white hover:bg-white/10" />
        </div>
      </div>

      <div
        className="v2-rise absolute bottom-28 left-1/2 z-10 hidden -translate-x-1/2 md:block"
        style={{ '--v2-delay': '2s' } as React.CSSProperties}
      >
        <ChevronDown className="v2-cue size-6 text-white/70" aria-hidden />
      </div>

      <div className="v2-wave v2-wave-back" aria-hidden />
      <div className="v2-wave v2-wave-mid" aria-hidden />
      <div className="v2-wave v2-wave-front" aria-hidden />
    </section>
  );
}
