'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { formatPEN } from '@/lib/utils';
import {
  upsertTicketTypeAction,
  deleteTicketTypeAction,
} from './actions';

type TicketType = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  capacity: number;
  sold: number;
  sort_order: number;
  color_hex: string | null;
  is_active: boolean;
};

export function TicketTypesEditor({
  eventId,
  initial,
}: {
  eventId: string;
  initial: TicketType[];
}) {
  const [types, setTypes] = useState<TicketType[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  function handleSave(formData: FormData) {
    formData.set('event_id', eventId);
    startTransition(async () => {
      const res = await upsertTicketTypeAction(formData);
      if (res.ok) {
        toast.success(res.message ?? 'Guardado');
        if (res.ticketType) {
          setTypes((prev) => {
            const idx = prev.findIndex((t) => t.id === res.ticketType!.id);
            if (idx === -1) return [...prev, res.ticketType!].sort((a, b) => a.sort_order - b.sort_order);
            const copy = [...prev];
            copy[idx] = res.ticketType!;
            return copy;
          });
        }
        setCreating(false);
      } else {
        toast.error(res.message ?? 'Error');
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm('¿Borrar este tipo de entrada?')) return;
    startTransition(async () => {
      const res = await deleteTicketTypeAction(id);
      if (res.ok) {
        toast.success('Tipo eliminado');
        setTypes((prev) => prev.filter((t) => t.id !== id));
      } else {
        toast.error(res.message ?? 'Error');
      }
    });
  }

  return (
    <div className="s-stack" style={{ gap: 14 }}>
      {types.length === 0 && !creating && (
        <div className="s-card"><p className="s-empty">Sin tipos de entrada todavía. Agregá uno para empezar.</p></div>
      )}

      {types.map((t) => (
        <TicketTypeRow
          key={t.id}
          eventId={eventId}
          type={t}
          onSave={handleSave}
          onDelete={handleDelete}
          isPending={isPending}
        />
      ))}

      {creating ? (
        <TicketTypeRow
          eventId={eventId}
          onSave={handleSave}
          onCancel={() => setCreating(false)}
          isPending={isPending}
        />
      ) : (
        <button type="button" className="s-btn s-btn--soft s-btn--block" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Agregar tipo de entrada
        </button>
      )}

      <p className="s-hint">
        Orden recomendado: el más caro primero (VIP / Box arriba) para anclar precio. La página pública respeta el campo "orden".
      </p>
    </div>
  );
}

function TicketTypeRow({
  eventId,
  type,
  onSave,
  onDelete,
  onCancel,
  isPending,
}: {
  eventId: string;
  type?: TicketType;
  onSave: (form: FormData) => void;
  onDelete?: (id: string) => void;
  onCancel?: () => void;
  isPending: boolean;
}) {
  return (
    <form action={onSave} className="s-card grid grid-cols-1 gap-3 md:grid-cols-12">
      <input type="hidden" name="event_id" value={eventId} />
      {type && <input type="hidden" name="id" value={type.id} />}

      <div className="md:col-span-3">
        <label htmlFor={`name-${type?.id ?? 'new'}`} className="s-label">Nombre</label>
        <input id={`name-${type?.id ?? 'new'}`} name="name" className="s-input" defaultValue={type?.name ?? ''} placeholder="General" required />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`price-${type?.id ?? 'new'}`} className="s-label">Precio (S/)</label>
        <input id={`price-${type?.id ?? 'new'}`} name="price_soles" type="number" min={0} step="0.5" className="s-input" defaultValue={type ? type.price_cents / 100 : ''} required />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`capacity-${type?.id ?? 'new'}`} className="s-label">Capacidad</label>
        <input id={`capacity-${type?.id ?? 'new'}`} name="capacity" type="number" min={0} className="s-input" defaultValue={type?.capacity ?? ''} required />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`order-${type?.id ?? 'new'}`} className="s-label">Orden</label>
        <input id={`order-${type?.id ?? 'new'}`} name="sort_order" type="number" className="s-input" defaultValue={type?.sort_order ?? 0} />
      </div>
      <div className="md:col-span-3 md:col-start-1">
        <label htmlFor={`desc-${type?.id ?? 'new'}`} className="s-label">Beneficios (uno por línea)</label>
        <textarea id={`desc-${type?.id ?? 'new'}`} name="description" rows={2} className="s-input" defaultValue={type?.description ?? ''} placeholder={'Acceso completo\nCortesía bebida'} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`color-${type?.id ?? 'new'}`} className="s-label">Color (hex)</label>
        <input id={`color-${type?.id ?? 'new'}`} name="color_hex" className="s-input" defaultValue={type?.color_hex ?? '#FF1F8F'} pattern="^#[0-9A-Fa-f]{6}$" />
      </div>
      <div className="md:col-span-2 flex items-end">
        <label className="inline-flex items-center gap-2 text-sm" style={{ paddingBottom: 10 }}>
          <input type="checkbox" name="is_active" defaultChecked={type?.is_active ?? true} value="1" />
          Activo
        </label>
      </div>
      {type && (
        <div className="md:col-span-5 flex items-center gap-4 s-hint" style={{ marginTop: 0 }}>
          <span>Vendidas: {type.sold} / {type.capacity}</span>
          <span>Ingreso pot.: {formatPEN(type.price_cents * type.capacity)}</span>
        </div>
      )}
      <div className="md:col-span-12 flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="s-btn s-btn--ghost" onClick={onCancel}>Cancelar</button>
        )}
        {type && onDelete && (
          <button
            type="button"
            className="s-btn s-btn--ghost"
            onClick={() => onDelete(type.id)}
            disabled={isPending || type.sold > 0}
            title={type.sold > 0 ? 'No se puede borrar: ya tiene ventas' : undefined}
          >
            <Trash2 className="h-4 w-4" /> Borrar
          </button>
        )}
        <button type="submit" className="s-btn s-btn--primary" disabled={isPending}>
          {type ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  );
}
