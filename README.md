# Azkar TV Display — Version 01

A mobile-first and tablet-ready Islamic reading app for Android. It presents one
authentic Dua, Dhikr, or Kalima at a time with the Arabic text as the reading
focus, accompanied by transliteration, natural English translation, and a sourced
reference.

## Highlights

- One-item reading view with the Arabic text as the hero element.
- Responsive layouts for phone portrait, phone landscape, tablet portrait, and a
  two-zone tablet landscape layout.
- Swipe left or right to move between items, vertical scroll for long text,
  long-press to toggle auto-rotation.
- Twelve content sections, including a separate Kalima section kept as a
  traditional learning set.
- Five themes: Dark Ambient, Gold and Navy Premium, Haram-Inspired Light,
  Green Classic, and High Contrast Accessibility.
- Intelligent auto text sizing across Short, Normal, Long, and Very Long content,
  plus manual font controls up to 200 percent with no clipping.
- Compact, optional prayer-time ribbon with manual city selection. Offline values
  are clearly labelled as approximate.
- Content served to the WebView through a secure asset loader on an HTTPS origin.
  Cleartext traffic and file-URL access are disabled.

## Build

The project builds with Gradle and the Android Gradle Plugin. The included GitHub
Actions workflow produces a debug APK on every push.

- Application ID: `com.ahmed.azkartv`
- Version name: `Version 01`
- Version code: `1`
- minSdk 22, targetSdk 34, compileSdk 34, JDK 17

## Content note

All items carry a source reference and a verification flag. The content set is
prepared with care but has not yet been confirmed by a qualified scholar. The
top-level `review_status` is set to `pending_scholarly_review`. Tajweed colouring
is disabled because no verified tajweed markup is bundled.
