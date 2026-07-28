'use client';

import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';

/**
 * Phần PWA: đăng ký service worker và bắt sự kiện "cài được app".
 *
 * Chrome bắn `beforeinstallprompt` ngay lúc mới vào trang, thường là lúc người
 * dùng còn chưa mở trang Cài app. Nên `PwaSetup` (nằm trong layout gốc) giữ lại
 * sự kiện đó, để `InstallApp` mở lúc nào cũng còn dùng được.
 */

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: InstallPrompt | null = null;
const EVENT_NAME = 'rental:installable';

export function PwaSetup() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Không đăng ký được thì app vẫn chạy bình thường, chỉ là không cài được.
      });
    }

    function capture(event: Event) {
      event.preventDefault();
      deferredPrompt = event as InstallPrompt;
      window.dispatchEvent(new Event(EVENT_NAME));
    }

    function clear() {
      deferredPrompt = null;
      window.dispatchEvent(new Event(EVENT_NAME));
    }

    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', clear);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', clear);
    };
  }, []);

  return null;
}

type Platform = 'installed' | 'prompt' | 'ios' | 'other';

export function InstallApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    function detect() {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true;

      if (standalone) return setPlatform('installed');
      if (deferredPrompt) return setPlatform('prompt');

      // iPadOS khai là "Macintosh", nên phải nhìn thêm số điểm chạm.
      const ua = navigator.userAgent;
      const isIos =
        /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

      setPlatform(isIos ? 'ios' : 'other');
    }

    detect();
    window.addEventListener(EVENT_NAME, detect);
    return () => window.removeEventListener(EVENT_NAME, detect);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setResult(outcome === 'accepted' ? 'Đang cài, xem màn hình chính nhé.' : 'Bạn đã bỏ qua.');
    setPlatform(outcome === 'accepted' ? 'installed' : 'other');
  }

  if (platform === null) return null;

  if (platform === 'installed') {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Đang chạy ở chế độ app rồi — không cần cài lại.
      </p>
    );
  }

  if (platform === 'prompt') {
    return (
      <div>
        <button
          type="button"
          onClick={install}
          className={`${buttonClass()} w-full py-3 sm:w-auto`}
        >
          📲 Cài app vào máy
        </button>
        {result ? <p className="mt-2 text-sm text-slate-500">{result}</p> : null}
      </div>
    );
  }

  const steps =
    platform === 'ios'
      ? [
          'Mở trang này bằng Safari (Chrome trên iPhone không cài được).',
          'Bấm nút Chia sẻ — hình vuông có mũi tên đi lên, ở thanh dưới.',
          'Kéo xuống chọn "Thêm vào MH chính" / "Add to Home Screen".',
          'Bấm "Thêm". Icon nhà trọ sẽ nằm ở màn hình chính.',
        ]
      : [
          'Mở trang này bằng Chrome.',
          'Bấm nút ⋮ ở góc trên bên phải.',
          'Chọn "Cài đặt ứng dụng" / "Thêm vào Màn hình chính".',
          'Xác nhận. Icon nhà trọ sẽ nằm ở màn hình chính.',
        ];

  return (
    <ol className="space-y-2 text-sm text-slate-700">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}
