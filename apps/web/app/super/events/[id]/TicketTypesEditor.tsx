'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="space-y-4">
      {types.length === 0 && !creating && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Sin tipos de entrada todavía. Agregá uno para empezar.
          </CardContent>
        </Card>
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
        <Button
          type="button"
          variant="outline"
          onClick={() => setCreating(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4" />
          Agregar tipo de entrada
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        Orden recomendado: el más caro primero (VIP / Box arriba) para anclar
        precio. La página pública respeta el campo "orden".
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
    <form
      action={onSave}
      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-12"
    >
      <input type="hidden" name="event_id" value={eventId} />
      {type && <input type="hidden" name="id" value={type.id} />}

      <div className="md:col-span-3">
        <Label htmlFor={`name-${type?.id ?? 'new'}`}>Nombre</Label>
        <Input
          id={`name-${type?.id ?? 'new'}`}
          name="name"
          defaultValue={type?.name ?? ''}
          placeholder="General"
          required
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`price-${type?.id ?? 'new'}`}>Precio (S/)</Label>
        <Input
          id={`price-${type?.id ?? 'new'}`}
          name="price_soles"
          type="number"
          min={0}
          step="0.5"
          defaultValue={type ? type.price_cents / 100 : ''}
          required
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`capacity-${type?.id ?? 'new'}`}>Capacidad</Label>
        <Input
          id={`capacity-${type?.id ?? 'new'}`}
          name="capacity"
          type="number"
          min={0}
          defaultValue={type?.capacity ?? ''}
          required
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`order-${type?.id ?? 'new'}`}>Orden</Label>
        <Input
          id={`order-${type?.id ?? 'new'}`}
          name="sort_order"
          type="number"
          defaultValue={type?.sort_order ?? 0}
        />
      </div>
      <div className="md:col-span-3 md:col-start-1">
        <Label htmlFor={`desc-${type?.id ?? 'new'}`}>Beneficios (uno por línea)</Label>
        <textarea
          id={`desc-${type?.id ?? 'new'}`}
          name="description"
          rows={2}
          defaultValue={type?.description ?? ''}
          placeholder={'Acceso completo\nCortesía bebida'}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`color-${type?.id ?? 'new'}`}>Color (hex)</Label>
        <Input
          id={`color-${type?.id ?? 'new'}`}
          name="color_hex"
          defaultValue={type?.color_hex ?? '#FF1F8F'}
          pattern="^#[0-9A-Fa-f]{6}$"
        />
      </div>
      <div className="md:col-span-2 flex items-end gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={type?.is_active ?? true}
            value="1"
          />
          Activo
        </label>
      </div>
      {type && (
        <div className="md:col-span-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-[0.18em]">
            Vendidas: {type.sold} / {type.capacity}
          </span>
          <span className="font-mono uppercase tracking-[0.18em]">
            Ingreso pot.: {formatPEN(type.price_cents * type.capacity)}
          </span>
        </div>
      )}
      <div className="md:col-span-12 flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        {type && onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onDelete(type.id)}
            disabled={isPending || type.sold > 0}
            title={type.sold > 0 ? 'No se puede borrar: ya tiene ventas' : undefined}
          >
            <Trash2 className="h-4 w-4" />
            Borrar
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {type ? 'Guardar' : 'Crear'}
        </Button>
      </div>
    </form>
  );
}
