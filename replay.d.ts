/*
 * cairo-canvas2d -- the replayer's types.
 *
 * Hand-written, and held against replay.js by nothing but reading: the
 * package is JavaScript, and this file is here so that a TypeScript
 * caller is not left writing `any`.
 *
 * Public domain, or CC0 where that is not a thing. Take it.
 */

/** The opcodes, by name. The same numbers as cairo2d.h's enum. */
export declare const OPS: {
    readonly SAVE: number;
    readonly RESTORE: number;
    readonly TRANSLATE: number;
    readonly SCALE: number;

    readonly NEW_PATH: number;
    readonly NEW_SUB_PATH: number;
    readonly MOVE_TO: number;
    readonly LINE_TO: number;
    readonly CURVE_TO: number;
    readonly ARC: number;
    readonly RECTANGLE: number;
    readonly CLOSE_PATH: number;

    readonly SET_SOURCE_RGBA: number;
    readonly SET_SOURCE_SURFACE: number;
    readonly SET_LINE_WIDTH: number;
    readonly SET_LINE_CAP: number;
    readonly SET_DASH: number;
    readonly SET_FILTER: number;

    readonly FILL: number;
    readonly FILL_PRESERVE: number;
    readonly STROKE: number;
    readonly STROKE_PRESERVE: number;
    readonly PAINT: number;
    readonly CLIP: number;

    readonly SET_FONT: number;
    readonly SHOW_TEXT: number;
};

/**
 * How many operands follow each opcode, indexed by opcode.
 *
 * -1 is SET_DASH, which says its own count first; -2 is entry 0, which is
 * not an op.
 */
export declare const ARITY: readonly number[];

/** Each opcode's name, indexed by opcode. Entry 0 is undefined. */
export declare const OP_NAMES: readonly string[];

/**
 * An image surface the list refers to by index, read out of the module's
 * heap. `data` is cairo's own byte order -- four bytes a pixel, blue
 * first -- and `stride` is the row stride in bytes, which is not always
 * `width * 4`.
 */
export interface Cairo2dSurface {
    index: number;
    width: number;
    height: number;
    stride: number;
    data: Uint8Array | Uint8ClampedArray | ArrayLike<number>;
}

export interface ReplayOptions {
    /** The canvas's CSS width. What `paint` and the initial clear cover. */
    width?: number;
    /** The canvas's CSS height. */
    height?: number;
    /** The device pixel ratio the element was sized at. Default 1. */
    dpr?: number;
    /** Start from an empty canvas. Default true. */
    clear?: boolean;
}

/** What replay draws on: a 2D context, on-screen or offscreen. */
export type Replayable = CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

/**
 * Replay a recorded list onto a 2D context.
 *
 * @param ops      the list, as a Float32Array or anything with a length
 *                 and numeric indices
 * @param strings  the string table; SET_FONT and SHOW_TEXT index into it
 * @param surfaces the surface table; SET_SOURCE_SURFACE indexes into it
 * @returns the number of ops replayed
 */
export declare function replay (
    ctx: Replayable,
    ops: ArrayLike<number>,
    strings: readonly string[],
    surfaces: readonly Cairo2dSurface[],
    opts?: ReplayOptions,
): number;
