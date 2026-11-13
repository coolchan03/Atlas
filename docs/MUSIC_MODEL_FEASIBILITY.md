# Text-to-music models on the phone: feasibility note (2026-11-14)

Not tested on a device. This is a reading of what such a model needs, not a measurement.

Music Studio now plays a tune that code writes (style, chords, melody, bass, drums) through synthesized instruments. A text-to-music model (MusicGen small, Stable Audio Open and similar) would write the audio itself, which can sound richer, but:

- **Runtime.** Atlas has llama.cpp, whisper, sherpa-onnx (speech) and an image runtime. None of them runs a music model's audio decoder (EnCodec or a diffusion VAE). One would need to be added and built for Android.
- **Size.** The smallest useful models are roughly 300 MB to 3 GB.
- **Speed.** Generation is many times slower than real time on phone CPUs; thirty seconds of music can take minutes and use most of the RAM that a chat model needs.
- **Quality control.** Output is not editable (no score), cannot be told to include a piano, and varies from run to run.

Decision rule if this is ever tried: convert one small model to ONNX, run it with the runtime already in the app on a flagship phone, and ship it only if thirty seconds of audio takes under three times real time and fits in memory beside a loaded chat model. Until then the built-in band is the reliable path, and its listed instruments are what plays.
