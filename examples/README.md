# Native image JSON for Atlas

**File:** [atlas-runtime.json](atlas-runtime.json)

For directly imported SD 1.5, SDXL, FLUX, Z-Image, Anima or Chroma checkpoints using the native sd.cpp image engine, Atlas can now read an optional `atlas-runtime.json` and apply supported generation settings.

1. Download `atlas-runtime.json` or copy the example from **My Models → Attachments → Copy native JSON example**.
2. Edit the values in a text editor, preserving the `schema` value.
3. In **My Models**, find the native image model and select **Attach LoRA / support file**. Select the JSON.
4. You can enable, disable, replace or delete this attachment in the model card. A disabled file has no effect.

The only executable fields in schema **`atlas-native-image/v1`** are:

| Field | Accepted values | sd.cpp option |
| --- | --- | --- |
| `sampling_method` | `euler`, `euler_a`, `heun`, `dpm2`, `dpm++2s_a`, `dpm++2m`, `dpm++2mv2`, `lcm` | `--sampling-method` |
| `schedule` | `discrete`, `karras`, `ays` | `--scheduler` |

One or both fields may be supplied. Atlas validates the schema and rejects unknown fields/values rather than silently ignoring them. These flags were checked against the repository's pinned upstream sd.cpp revision, `e16d26a96a1bf59824d12cc26352aa36c25c2252`.

Other attached JSON files (such as `tokenizer_config.json`, `scheduler_config.json`, `model_index.json`) are retained as metadata only. They **cannot** make an unsupported Diffusers pipeline or encoder work. Atlas still needs compatible GGUF/safetensors weights and appropriate VAE/text encoders. A file named `scheduler_config.json` will not automatically override the sampler; use `atlas-runtime.json` instead.

Atlas validates the new runtime JSON before replacing any previous version. If a generation fails, disable `atlas-runtime.json` to restore the native defaults. Phone and GPU/driver performance still require on-device testing.
