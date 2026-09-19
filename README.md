# cairo-canvas2d

cairo's API, recorded and replayed on a Canvas2D.

This is not cairo, and it is not a binding to one. It is a `cairo.h` and a
`cairomm/context.h` that answer to cairo's names for the corner of cairo
that drawing a diagram uses -- paths, fills, strokes, the toy text API, a
transform, a clip, and one image surface -- and record every call into a
flat list. A hundred and fifty lines of JavaScript then replay that list
onto a `CanvasRenderingContext2D`, whose vocabulary is the same one.

It exists so that C or C++ which draws through cairo on a desktop can be
compiled to WebAssembly and draw the same picture in a browser, with its
include path changed and nothing else.

No rasteriser ships with it. The browser has one.

## Why not one of the other answers

- **Real cairo, compiled to wasm.** It works, and it brings pixman and
  freetype: about a megabyte of rasteriser to draw rectangles the browser
  will rasterise anyway, and a font stack beside the one already in the
  page. This is the well-trodden path -- see [cubicool/cairo-wasm][cw] and
  [VitoVan/pango-cairo-wasm][pcw], the latter of which vendors cairo,
  pixman, freetype, harfbuzz, fribidi, glib, fontconfig and two font files
  to put a string on a canvas.
- **Draw it again in JavaScript.** Two versions of every picture a person
  looks at, kept in step by hand for ever.
- **A C binding to the Canvas API.** Several exist -- [wasm-canvas][wc] is
  a good one. If you are writing the drawing code now, and it will only
  ever run in a browser, write it against one of those: you do not need
  cairo's names, and this would be a layer between you and the canvas for
  nothing. What they cannot do is help code that already says
  `cairo_move_to`, because reaching them means rewriting every call. That
  code is what this is for.
- **An abstraction with a web backend.** [piet][piet] is this, done well,
  in Rust: one drawing API over cairo, Direct2D, CoreGraphics and the web
  canvas. If you are starting from nothing, start there. It is not a
  `cairo.h`.

What is here is the fifth thing: cairo's own spelling, for code that has
already been written once.

Someone [proposed a canvas backend on the cairo mailing list in January
2008][list], observing that the two imaging models look very similar. They
do. It was never built.

[cw]: https://github.com/cubicool/cairo-wasm
[pcw]: https://github.com/VitoVan/pango-cairo-wasm
[wc]: https://github.com/alextyner/wasm-canvas
[piet]: https://github.com/linebender/piet
[list]: https://lists.cairographics.org/archives/cairo/2008-January/012626.html

## What is in it

| | |
|---|---|
| `cairo.h` | the C API, and the whole of what a caller may use |
| `cairomm/context.h` | the same, as cairomm spells it, for C++ |
| `cairo2d.h` | the host's side: make a recorder, read the list |
| `cairo2d.cpp` | the recorder |
| `replay.js` | the replayer, an ES module |
| `replay.d.ts` | its types, for a TypeScript caller |
| `test/` | both halves, and the check that they still agree |

About a thousand lines, all told. It depends on nothing, and it includes
nothing from outside its own directory.

## Getting it

The JavaScript half is on npm, and the package carries the C sources too,
so one install is enough for both:

```
npm install cairo-canvas2d
```

```js
import { replay } from 'cairo-canvas2d';
```

The C half is a directory to put on an include path. Either point at the
installed package:

```cmake
add_subdirectory(node_modules/cairo-canvas2d cairo2d)
target_link_libraries(mytarget PRIVATE cairo2d)
```

or vendor the seven files, or add it as a submodule. There is nothing to
configure and nothing to find.

The CMake target is called `cairo2d`, as are the header, the C prefix and
the opcodes: the package has the longer name because npm's `cairo` is
StarkNet's, and the code kept its own.

## Using it

The drawing code does not change. The host makes a recorder, hands it
over, and reads three tables back:

```c
#include <cairo2d.h>
#include <emscripten.h>

static cairo_t *cr;

EMSCRIPTEN_KEEPALIVE int draw (int width, int height)
{
    if (cr == NULL)
        cr = cairo2d_create();

    cairo2d_begin(cr);              /* a frame */
    draw_whatever(cr, width, height);

    return cairo2d_op_words(cr);
}

EMSCRIPTEN_KEEPALIVE const float *draw_ops (void) { return cairo2d_ops(cr); }
EMSCRIPTEN_KEEPALIVE int draw_strings (void) { return cairo2d_string_count(cr); }
EMSCRIPTEN_KEEPALIVE const char *draw_string (int i) { return cairo2d_string(cr, i); }
```

and on the other side, the three tables out of the module's heap and one
call:

```js
import { replay } from 'cairo-canvas2d';

const words = M._draw(width, height);
const at = M._draw_ops();

/* Taken after the draw: a heap that grew during it left every earlier
   view detached. */
const ops = M.HEAPF32.subarray(at >> 2, (at >> 2) + words);

const strings = [];

for (let i = 0; i < M._draw_strings(); i++)
    strings.push(M.UTF8ToString(M._draw_string(i)));

replay(ctx, ops, strings, [], { width, height, dpr: devicePixelRatio });
```

Image surfaces, if the drawing uses them, are a fourth table read the same
way -- `cairo2d_surface_data()` and the width, height and stride beside
it, as a `HEAPU8.subarray` -- and handed over as
`{ index, width, height, stride, data }`. Copy that subarray rather than
pass it if it is going through `postMessage`; replaying it in place needs
no copy.

The views and the tables are good until the next `cairo2d_begin()`.

## The list

One flat array of `float`. A record is an opcode followed by exactly as
many operands as `cairo2d_op_arity()` says, and nothing else -- no length
prefix, because the arity table is the contract. The one variable-length
op, `SET_DASH`, says its own count first.

Strings and image surfaces are **indices into side tables**, never
pointers: a `float` holds integers exactly only up to 2^24, and a heap
pointer above sixteen megabytes would land silently on the wrong byte.

The tables and the list live until the next `cairo2d_begin()`. A surface
the drawing code destroyed is kept alive by the list that refers to it,
because a caller which computes pixels, paints them and frees them inside
one frame -- which is what a spectrogram does -- must not leave the
replayer reading freed memory.

## Where the two models differ

Three places, and the replayer earns its keep in all three:

1. **A path survives a fill.** cairo's `fill` and `stroke` clear the
   current path; Canvas2D's do not. So a `beginPath()` is owed after
   either, and paid the next time a path op arrives. The `_preserve` pair
   owe nothing.
2. **`new_sub_path`.** Canvas2D has no such call, so the replayer moves to
   the following arc's first point instead -- which is what cairo does
   internally, and it is why a rounded rectangle drawn out of four arcs
   comes out with no stray line across it.
3. **`paint`.** With a colour it is a `fillRect` over the whole surface
   under the base transform, which the clip cuts down to the region cairo
   would have painted. With a surface it is a `drawImage` at the source's
   origin under the current transform.

## Text

`cairo_text_extents` is the one call that needs an answer while the list
is being built: a label is centred and truncated from its width. The
recorder composes one CSS font string -- `italic bold 12px sans-serif` --
and that same string is what the measurement is made with and what goes
into the list for the replayer to assign to `ctx.font`. One string, one
place, so a label cannot be laid out in a font other than the one it is
drawn in.

Where the measurement comes from is the host's: `cairo2d_set_measure()`
takes a function. Under Emscripten the default asks the browser for
`measureText` on an offscreen 2D context, synchronously, which works on
the main thread and in a worker. Where there is no canvas at all -- Node,
a native test, an audio worklet -- there is a built-in estimate from the
font size and the length, and a label laid out from it is a pixel or two
out of centre.

## What it will not do

Everything not in `cairo.h`. A program that reaches for
`cairo_set_line_join`, a gradient, a PDF surface or Pango does not
compile, in the line that reached, rather than linking and drawing
something wrong. The list is the contract; it grows when a caller needs
it to, and never by accident.

If you need all of cairo, you need cairo. Compile it.

Also absent, on purpose: any include of anything outside this directory.

## The test

```
cmake -S . -B build && cmake --build build && ctest --test-dir build
```

or `npm test`, which is those three lines.

`test/cairo2dtest.cpp` checks that each call records what it says it does,
that both faces record the same list for the same drawing, that the list
can be walked with nothing but the arity table, that text is laid out with
the metrics the host gave and drawn at the current point, and that a
surface's pixels outlive the caller's reference.

`test/replaytest.mjs` reads the op table out of the built program and
holds `replay.js` against it, name by name and arity by arity -- the
opcodes are written out twice, in two languages, and the day they part is
the day every picture after the changed op is drawn from operands read as
opcodes. Then it replays a recorded list onto a context that writes down
what it was asked to do, and checks the three places above.

Neither test needs Emscripten. The recorder is ordinary C++ and the
replayer is ordinary JavaScript; the two only meet in a browser.

## Adding an op

Six places, and the test will tell you if you missed one:

1. `cairo.h` -- the call, as cairo spells it.
2. `cairo2d.h` -- the opcode, at the end of its group.
3. `cairo2d.cpp` -- the recorder, and its arity in the table.
4. `replay.js` -- `OPS`, `ARITY`, and the `case`.
5. `replay.d.ts` -- the name.
6. `cairomm/context.h`, if C++ callers want it too.

Keep the operand count in step across 3 and 4 or every op after it is read
as garbage; that is precisely what `replaytest.mjs` is watching for.

## Licence

Public domain, or CC0 where that is not a thing. Take it.
