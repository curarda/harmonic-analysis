# Harmonic Analysis

An in-browser music theory analyzer. Drop a melody MIDI file and a chord MIDI file, and get the harmonic analysis: key, mode changes, a Roman-numeral chord progression, how the melody relates to the chords, and the musical form.

**Live app (installable on iPhone):** https://curarda.github.io/harmonic-analysis/

## Who it is for

- Music theory students who want to check their harmony exercises.
- Songwriters and arrangers analyzing the harmony of a melody.
- Teachers who need quick examples of chord progressions and cadences.

## Why I built it

I wanted to see how a melody and its chords relate, such as which melody notes are chord tones and where the key changes, without opening a notation program.

## What it does

- Key and mode detection, including local key changes.
- Roman-numeral chord progression with function labels and cadences.
- Vertical analysis of melody against chords: chord tones, non-chord tones and tension.
- Melodic profile: range, step and leap ratios, direction and repetition.
- Structure: phrase form (for example a-a-b-b) and contour shapes.

All analysis happens in your browser. Your MIDI files are not uploaded.

## Run locally

Open `index.html` in a browser. There is no build step. Sample MIDI files are in `samples/`.

## Install on iPhone

1. Open the live link in **Safari**.
2. Tap Share → **Add to Home Screen**.

Privacy details are in [privacy.html](privacy.html).

## Tech

HTML, CSS and JavaScript, a single-page app, service worker and Web App Manifest for offline use.

The original Turkish documentation is in [README.tr.md](README.tr.md).
