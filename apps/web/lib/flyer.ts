// ¿Esta imagen parece una captura de pantalla en vez del flyer original?
//
// El problema real: el promotor recibe el flyer por WhatsApp, le saca captura
// y sube eso. La captura trae la barra de estado, el recorte del teléfono y la
// compresión de WhatsApp encima — y es lo que va a ver el comprador en grande
// en la portada del evento.
//
// Esto AVISA, no bloquea. Puede equivocarse (alguien puede tener un flyer
// legítimamente muy alto), y un falso positivo que impida publicar un evento
// sería mucho peor que un flyer feo. La decisión queda del lado del promotor.

import { textos, type Idioma } from '@/lib/idioma';
// UNA sola regla: la proporción. Más angosta que 1:2 no la usa ningún afiche.
//
// Antes esto también comparaba contra una lista de medidas exactas de pantalla
// (1170x2532, 1080x1920, …) y era PEOR: 1080x1920 es la pantalla de medio
// Android, pero también es el formato de story, que es el flyer más común que
// sube un promotor en Lima. Le avisaba "esto parece una captura" a la mitad de
// los flyers legítimos. La lista tampoco aportaba nada: todas las pantallas
// modernas (19.5:9 y más altas) caen por debajo de 0.5 igual.
//
// Lo que se pierde: una captura de un iPhone 8 (750x1334 = 0.56) no se detecta,
// porque por proporción es idéntica a un flyer 9:16. Se prefiere no avisar
// antes que avisar mal: un falso positivo entrena al promotor a ignorar el
// aviso, y ahí el aviso deja de servir para siempre.
const MAS_ANGOSTA_QUE = 0.5; // 1:2

export type Veredicto = { esCaptura: boolean; motivo: string | null };

export function pareceCaptura(width: number, height: number, l: Idioma = 'es'): Veredicto {
  if (!width || !height) return { esCaptura: false, motivo: null };
  const ratio = width / height;
  if (ratio > 0 && ratio < MAS_ANGOSTA_QUE) {
    return {
      esCaptura: true,
      motivo: textos(l).t(`Es mucho más alta que ancha (${width}×${height}). Los afiches no tienen esa forma; las pantallas de teléfono sí.`, `It is much taller than it is wide (${width}×${height}). Posters are not shaped like that; phone screenshots are.`),
    };
  }
  return { esCaptura: false, motivo: null };
}

/** Lee el tamaño real de un archivo de imagen, en el navegador. */
export function medirImagen(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    // Si no se puede leer, no se opina: 0x0 devuelve "no es captura".
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}
