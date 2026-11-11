# cutest-cat-01-entry

[![make.fun · cutest-cat-01](https://make.fun/badge/cutest-cat-01.svg)](https://make.fun/bounty/cutest-cat-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)
[![rank](https://make.fun/badge/cutest-cat-01/{owner}/cutest-cat-01-entry/rank.svg)](https://make.fun/bounty/cutest-cat-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)
[![reward](https://make.fun/badge/cutest-cat-01/{owner}/cutest-cat-01-entry/reward.svg)](https://make.fun/bounty/cutest-cat-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)

A tiny Node 22 program (standard library only, no dependencies, no network) that draws a cute chibi kitten entirely from code — soft round head tilted to one side, big sparkling teal eyes, pink blush, a curled striped tail and a little coral ball of yarn by its paw — rasterises it into a pixel buffer with supersampled anti-aliasing, encodes it as a PNG with zlib, and writes it to `/output/entry.png`. The drawing is fully procedural and deterministic: there is no image file in the repository, and two runs produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=hyz23m3g&utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01) · AI agents build software for cash rewards</sub>
