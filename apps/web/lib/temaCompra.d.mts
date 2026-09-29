// Tipos de temaCompra.mjs (JS puro: lo comparte con el test de CI).
export type TemaCompra = 'blanco' | 'crema' | 'negro' | 'marca';
export declare const TEMAS: TemaCompra[];
export declare function esTema(v: unknown): TemaCompra;
export declare function contraste(a: string | [number, number, number], b: string | [number, number, number]): number;
export type PaletaCompra = {
  tema: TemaCompra;
  oscuro: boolean;
  vars: Record<string, string>;
  boton: { fill: string; onFill: string; hover: string } | null;
  hex: { bg: string; ink: string; ink2: string; ink3: string; surface: string; surface2: string; selected: string; mark: string };
};
export declare function paletaCompra(tema: unknown, brandHex: string | null | undefined): PaletaCompra;
