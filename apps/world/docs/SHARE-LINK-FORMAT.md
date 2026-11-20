# Share-link format

The compact share view is a permanent URL contract. Its implementation and
registries are in `src/share/viewCodec.js`; byte primitives are in
`src/share/wire.js`. Add new values without changing the meaning of existing
codes.

## Addresses

- Compact links use `<app>/share/<code>`. The app may be served at the origin
  root or below a base path.
- The legacy long form uses the URL hash, for example
  `#lat=37.77&lon=-122.42&alt=800&heading=0&pitch=-35&style=nvg`.
- The long form is parsed by `src/sharelink.js`. Conversion between its state
  and compact view state is handled by `src/share/legacyShareState.js`.

## Compact code envelope

The code is unpadded base64url over a byte sequence containing:

1. One format-version byte. The current version is `1`.
2. Zero or more protobuf-style tag/length/value fields.
3. One CRC-8 byte over the version and fields. The polynomial is `0x07`, with
   initial value `0`, no reflection, and no final XOR.

Field wire types are varint (`0`), fixed 64-bit (`1`), length-delimited (`2`),
and fixed 32-bit (`5`). The writer uses varints and length-delimited values.
The decoder rejects malformed base64url, non-canonical or out-of-range values,
unsupported versions, invalid checksums, and codes longer than 2048 characters.
Unknown fields are skipped so a newer encoder can add fields without changing
the meaning of fields an older decoder already understands.

## Permanent top-level fields

Field numbers are append-only. Never renumber or reuse a number; retired fields
remain reserved. Default values are omitted from the code and restored by the
decoder.

| Number | Key                          | Value                                      |
| -----: | ---------------------------- | ------------------------------------------ |
|      1 | `view`                       | View kind enum                             |
|      2 | `lat`                        | Latitude, degrees × 10,000                 |
|      3 | `lon`                        | Longitude, degrees × 10,000                |
|      4 | `alt`                        | Signed altitude                            |
|      5 | `heading`                    | Whole-degree angle                         |
|      6 | `pitch`                      | Signed whole-degree angle                  |
|      7 | `roll`                       | Whole-degree angle                         |
|      8 | `sharedAtMs`                 | Signed seconds relative to the share epoch |
|      9 | `flags`                      | Bitset defined by `SHARE_VIEW_FLAGS`       |
|     10 | `layerState`                 | Enabled layer state                        |
|     11 | `layerOptions`               | Layer option state                         |
|     12 | `panelState`                 | Shareable panel state                      |
|     13 | `thing`                      | Followed-entity identity and camera state  |
|     14 | `style`                      | Visual style enum                          |
|     15 | `mapStack`                   | Map stack enum                             |
|     16 | `hudVariant`                 | HUD variant                                |
|     17 | `bloomIntensity`             | Bloom intensity                            |
|     18 | `bloomVersion`               | Bloom scale version                        |
|     19 | `sharpenIntensity`           | Sharpen intensity                          |
|     20 | `detectionMode`              | Detection mode enum                        |
|     21 | `detectionDensity`           | Detection density                          |
|     22 | `detectionAllocation`        | Detection allocation enum                  |
|     23 | `detectionFadePct`           | Detection fade percentage                  |
|     24 | `detectionOutsideOpacityPct` | Outside opacity percentage                 |
|     25 | `scopeFeatherPct`            | Scope feather percentage                   |
|     26 | `scopeTerminusPct`           | Scope terminus percentage                  |
|     27 | `styleParams`                | Style-specific visual parameters           |

The enum, flag, layer-token, panel, entity-kind, and style-parameter registries
are also permanent contracts. Preserve their assigned numbers, tokens, and
defaults; new entries are appended. Retired entries stay reserved. The
registries in `viewCodec.js` and `src/data/layerState.js` are the source of
truth for those nested values.

## Compatibility rules

- Do not change format version `1` for an additive field or value.
- Do not change the default associated with an existing field; omission has
  that frozen meaning in links created by older app versions.
- Add fields with unused numbers, and add enum or token values without
  renumbering existing values.
- Keep retired codes reserved. A retired visual style decodes to the documented
  fallback rather than assigning its old code to a different style.
- Keep encoding canonical so a decode-and-encode round trip preserves the
  normalized state.
- Update codec tests with compatibility cases when changing a registry or
  field. See `src/share/viewCodec.test.mjs` and `src/share/wire.test.mjs`.
