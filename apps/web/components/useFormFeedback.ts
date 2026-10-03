'use client';

import { useFormState } from 'react-dom';
import { toast } from 'sonner';

type FeedbackState = { ok: boolean; message: string | null };

// useFormState + toast con el resultado de la server action.
//
// Por qué: en la ficha de marca de la cabina, las actions hacen revalidatePath
// de la misma página y el mensaje inline de useFormState no llegaba a verse
// (verificado en prod: "Guardar contraseña" aplicaba el cambio sin ninguna
// confirmación). El toast se dispara en el cliente apenas vuelve el resultado,
// antes del re-render, así que la confirmación no depende de que el estado del
// formulario sobreviva. El mensaje inline se mantiene cuando sí sobrevive.
export function useFormFeedback<S extends FeedbackState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initial: S
) {
  return useFormState<S, FormData>(async (prev, formData) => {
    const res = await action(prev as S, formData);
    if (res.message) {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    }
    return res;
  }, initial as Awaited<S>);
}
