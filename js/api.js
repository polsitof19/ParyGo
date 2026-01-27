// ========================================
// PARYGO - APIs Externas
// ========================================

// API de DNI (RENIEC)
const DniAPI = {
    // Buscar por DNI usando API pública
    async search(dni) {
        if (!isValidDni(dni)) {
            throw new Error('DNI inválido');
        }
        
        try {
            // Intentar con API de apiperu.dev (gratuita)
            const response = await fetch(`https://apiperu.dev/api/dni/${dni}`, {
                headers: {
                    'Authorization': 'Bearer demo' // Token demo
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    return {
                        dni: data.data.numero,
                        name: `${data.data.nombres} ${data.data.apellido_paterno} ${data.data.apellido_materno}`,
                        firstName: data.data.nombres,
                        lastName: `${data.data.apellido_paterno} ${data.data.apellido_materno}`
                    };
                }
            }
        } catch (error) {
            // API principal falló, intentar alternativa
        }
        
        try {
            // API alternativa
            const response = await fetch(`https://dni.optimizeperu.com/api/persons/${dni}`);
            if (response.ok) {
                const data = await response.json();
                if (data.name) {
                    return {
                        dni: dni,
                        name: data.name,
                        firstName: data.first_name || data.name.split(' ')[0],
                        lastName: data.last_name || ''
                    };
                }
            }
        } catch (error) {
            // API alternativa también falló
        }
        
        // Si todas las APIs fallan, retornar solo el DNI
        return {
            dni: dni,
            name: '',
            firstName: '',
            lastName: ''
        };
    }
};

// Servicio de WhatsApp
const WhatsAppService = {
    // Generar link de WhatsApp
    generateLink(phone, message) {
        const cleanPhone = phone.replace(/\D/g, '');
        // Asegurar que tenga código de país
        const fullPhone = cleanPhone.length === 9 ? `51${cleanPhone}` : cleanPhone;
        return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    },
    
    // Enviar mensaje (abre WhatsApp)
    send(phone, message) {
        const link = this.generateLink(phone, message);
        window.open(link, '_blank');
    },
    
    // Preparar mensaje con variables
    prepareMessage(template, data) {
        let message = template || 'Hola {nombre}, tu código de entrada es: {codigo}';
        
        message = message
            .replace(/{nombre}/gi, data.clientName || 'Cliente')
            .replace(/{codigo}/gi, data.code || '')
            .replace(/{evento}/gi, data.eventName || '')
            .replace(/{fecha}/gi, data.eventDate || '')
            .replace(/{hora}/gi, data.eventTime || '')
            .replace(/{tipo}/gi, data.ticketType || '')
            .replace(/{tipo_entrada}/gi, data.ticketType || '')
            .replace(/{lugar}/gi, data.venue || '')
            .replace(/{precio}/gi, data.price || '0');
        
        return message;
    }
};

// Servicio de QR
const QRService = {
    // Generar URL de imagen QR
    generateURL(text, size = 200) {
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
    },
    
    // Generar QR como elemento imagen
    generateImage(text, size = 200) {
        const img = document.createElement('img');
        img.src = this.generateURL(text, size);
        img.alt = 'QR Code';
        return img;
    }
};

// Servicio de exportación
const ExportService = {
    // Exportar a CSV
    toCSV(data, filename = 'export') {
        if (!data || !data.length) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => 
                headers.map(h => {
                    let value = row[h] ?? '';
                    // Escapar comillas y envolver en comillas si contiene comas
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        value = `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');
        
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Archivo exportado correctamente', 'success');
    },
    
    // Exportar entradas
    exportEntries(entries, events, promoters) {
        const data = entries.map(entry => {
            const event = events.find(e => e.id === entry.eventId) || {};
            const promoter = promoters.find(p => p.id === entry.promoterId) || {};
            
            return {
                'Código': entry.code,
                'Cliente': entry.clientName || '-',
                'DNI': entry.clientDni || '-',
                'Teléfono': entry.clientPhone || '-',
                'Email': entry.clientEmail || '-',
                'Evento': event.name || '-',
                'Tipo Entrada': entry.ticketType || '-',
                'Precio': entry.price || 0,
                'Promotor': promoter.name || 'Directo',
                'Estado': entry.status || 'pending',
                'Nº Operación': entry.operationNumber || '-',
                'Fecha Creación': formatDate(entry.createdAt),
                'Fecha Pago': entry.paidAt ? formatDate(entry.paidAt) : '-',
                'Fecha Canje': entry.redeemedAt ? formatDate(entry.redeemedAt) : '-'
            };
        });
        
        this.toCSV(data, 'entradas');
    }
};
